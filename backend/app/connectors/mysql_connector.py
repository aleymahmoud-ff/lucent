"""
MySQL Connector — uses aiomysql for fully async operation
"""
import logging
from typing import Any

import aiomysql
import pandas as pd

from .base import BaseConnector, validate_sql_identifier

logger = logging.getLogger(__name__)


class MySQLConnector(BaseConnector):
    """Connect to a MySQL / MariaDB database using aiomysql."""

    def _conn_kwargs(self) -> dict:
        cfg = self.config
        return dict(
            host=cfg.get("host", "localhost"),
            port=int(cfg.get("port", 3306)),
            db=cfg.get("database", ""),
            user=cfg.get("user", ""),
            password=cfg.get("password", ""),
            autocommit=True,
        )

    # ------------------------------------------------------------------
    # Interface
    # ------------------------------------------------------------------

    async def test_connection(self) -> tuple[bool, str]:
        try:
            conn = await aiomysql.connect(**self._conn_kwargs())
            try:
                async with conn.cursor() as cur:
                    await cur.execute("SELECT 1")
            finally:
                conn.close()
            return True, "Connection successful"
        except aiomysql.OperationalError as exc:
            code = exc.args[0] if exc.args else 0
            if code in (1045, 1044):
                return False, "Authentication failed — invalid credentials"
            if code in (2003, 2013):
                return False, "Network error — could not reach host"
            return False, f"Connection failed: {type(exc).__name__}"
        except Exception as exc:
            logger.debug("MySQL test_connection error: %s", exc)
            return False, f"Connection failed: {type(exc).__name__}"

    async def fetch_data(
        self,
        query: str | None = None,
        table: str | None = None,
        filters: dict[str, Any] | None = None,
        limit: int = 1000,
    ) -> pd.DataFrame:
        if not query and not table:
            raise ValueError("Either 'query' or 'table' must be provided")

        params: tuple = ()
        if not query:
            database = validate_sql_identifier(self.config.get("database", ""), "database")
            safe_table_name = validate_sql_identifier(table, "table")
            safe_table = f"`{database}`.`{safe_table_name}`"
            if filters:
                for col in filters.keys():
                    validate_sql_identifier(col, "filter column")
                conditions = " AND ".join(f"`{col}` = %s" for col in filters.keys())
                query = f"SELECT * FROM {safe_table} WHERE {conditions} LIMIT %s"
                params = (*filters.values(), limit)
            else:
                query = f"SELECT * FROM {safe_table} LIMIT %s"
                params = (limit,)
        else:
            query = f"SELECT * FROM ({query}) AS _lucent_q LIMIT %s"
            params = (limit,)

        conn = await aiomysql.connect(**self._conn_kwargs())
        try:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(query, params)
                rows = await cur.fetchall()

            if not rows:
                return pd.DataFrame()
            return pd.DataFrame(rows)
        finally:
            conn.close()

    async def list_resources(self) -> list[str]:
        database = self.config.get("database", "")
        conn = await aiomysql.connect(**self._conn_kwargs())
        try:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = %s
                      AND table_type = 'BASE TABLE'
                    ORDER BY table_name
                    """,
                    (database,),
                )
                rows = await cur.fetchall()
            return [row[0] for row in rows]
        finally:
            conn.close()
