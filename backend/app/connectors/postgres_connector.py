"""
PostgreSQL Connector — uses asyncpg for fully async operation
"""
import asyncio
import logging
from typing import Any

import asyncpg
import pandas as pd

from .base import BaseConnector, validate_sql_identifier

logger = logging.getLogger(__name__)


class PostgresConnector(BaseConnector):
    """Connect to a PostgreSQL database using asyncpg."""

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _dsn(self) -> str:
        cfg = self.config
        host = cfg.get("host", "localhost")
        port = cfg.get("port", 5432)
        database = cfg.get("database", "")
        user = cfg.get("user", "")
        password = cfg.get("password", "")
        return f"postgresql://{user}:{password}@{host}:{port}/{database}"

    # ------------------------------------------------------------------
    # Interface
    # ------------------------------------------------------------------

    async def test_connection(self) -> tuple[bool, str]:
        try:
            conn = await asyncpg.connect(dsn=self._dsn())
            try:
                await conn.execute("SELECT 1")
            finally:
                await conn.close()
            return True, "Connection successful"
        except asyncpg.InvalidPasswordError:
            return False, "Authentication failed — invalid credentials"
        except asyncpg.CannotConnectNowError as exc:
            return False, f"Server unavailable: {exc}"
        except OSError as exc:
            return False, f"Network error — could not reach host: {exc}"
        except Exception as exc:
            logger.debug("PostgreSQL test_connection error: %s", exc)
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

        if not query:
            schema = validate_sql_identifier(self.config.get("schema", "public"), "schema")
            safe_table_name = validate_sql_identifier(table, "table")
            safe_table = f'"{schema}"."{safe_table_name}"'
            if filters:
                for col in filters.keys():
                    validate_sql_identifier(col, "filter column")
                conditions = " AND ".join(
                    f'"{col}" = ${i + 1}' for i, col in enumerate(filters.keys())
                )
                query = f"SELECT * FROM {safe_table} WHERE {conditions} LIMIT {limit}"
            else:
                query = f"SELECT * FROM {safe_table} LIMIT {limit}"
        else:
            # Wrap user-supplied query to enforce row limit
            query = f"SELECT * FROM ({query}) AS _lucent_q LIMIT {limit}"

        conn = await asyncpg.connect(dsn=self._dsn())
        try:
            if filters:
                rows = await conn.fetch(query, *filters.values())
            else:
                rows = await conn.fetch(query)

            if not rows:
                return pd.DataFrame()

            columns = list(rows[0].keys())
            data = [list(row.values()) for row in rows]
            return pd.DataFrame(data, columns=columns)
        finally:
            await conn.close()

    async def list_resources(self) -> list[str]:
        schema = self.config.get("schema", "public")
        conn = await asyncpg.connect(dsn=self._dsn())
        try:
            rows = await conn.fetch(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = $1
                  AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """,
                schema,
            )
            return [row["table_name"] for row in rows]
        finally:
            await conn.close()
