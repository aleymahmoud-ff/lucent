"""
Snowflake Connector — uses snowflake-connector-python (sync), wrapped in asyncio.to_thread
"""
import asyncio
import logging
from typing import Any

import pandas as pd
import snowflake.connector
from snowflake.connector import errors as sf_errors

from .base import BaseConnector, validate_sql_identifier

logger = logging.getLogger(__name__)


class SnowflakeConnector(BaseConnector):
    """Connect to Snowflake using snowflake-connector-python."""

    def _connect(self) -> snowflake.connector.SnowflakeConnection:
        cfg = self.config
        kwargs = dict(
            account=cfg.get("account", ""),
            user=cfg.get("user", ""),
            password=cfg.get("password", ""),
        )
        if cfg.get("warehouse"):
            kwargs["warehouse"] = cfg["warehouse"]
        if cfg.get("database"):
            kwargs["database"] = cfg["database"]
        if cfg.get("schema"):
            kwargs["schema"] = cfg["schema"]
        if cfg.get("role"):
            kwargs["role"] = cfg["role"]
        return snowflake.connector.connect(**kwargs)

    def _schema(self) -> str:
        return self.config.get("schema", "PUBLIC")

    def _database(self) -> str:
        return self.config.get("database", "")

    # ------------------------------------------------------------------
    # Sync helpers
    # ------------------------------------------------------------------

    def _sync_test_connection(self) -> tuple[bool, str]:
        conn = None
        try:
            conn = self._connect()
            cur = conn.cursor()
            cur.execute("SELECT CURRENT_VERSION()")
            cur.fetchone()
            return True, "Connection successful"
        except sf_errors.DatabaseError as exc:
            msg = str(exc)
            if "Incorrect username or password" in msg or "390100" in msg:
                return False, "Authentication failed — invalid credentials"
            if "Account must be specified" in msg:
                return False, "Account identifier is missing or invalid"
            return False, f"Snowflake error: {type(exc).__name__}"
        except Exception as exc:
            logger.debug("Snowflake test_connection error: %s", exc)
            return False, f"Connection failed: {type(exc).__name__}"
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass

    def _sync_fetch_data(
        self,
        query: str | None,
        table: str | None,
        filters: dict[str, Any] | None,
        limit: int,
    ) -> pd.DataFrame:
        schema = self._schema()
        if not query and not table:
            raise ValueError("Either 'query' or 'table' must be provided")

        if not query:
            safe_table = validate_sql_identifier(table, "table")
            if schema:
                safe_schema = validate_sql_identifier(schema, "schema")
                full_table = f'"{safe_schema}"."{safe_table}"'
            else:
                full_table = f'"{safe_table}"'
            if filters:
                for col in filters.keys():
                    validate_sql_identifier(col, "filter column")
                conditions = " AND ".join(f'"{col}" = %s' for col in filters.keys())
                sql = f'SELECT * FROM {full_table} WHERE {conditions} LIMIT {limit}'
                params = tuple(filters.values())
            else:
                sql = f"SELECT * FROM {full_table} LIMIT {limit}"
                params = ()
        else:
            sql = f"SELECT * FROM ({query}) LIMIT {limit}"
            params = ()

        conn = self._connect()
        try:
            cur = conn.cursor(snowflake.connector.DictCursor)
            if params:
                cur.execute(sql, params)
            else:
                cur.execute(sql)
            rows = cur.fetchall()

            if not rows:
                return pd.DataFrame()
            return pd.DataFrame(rows)
        finally:
            conn.close()

    def _sync_list_resources(self) -> list[str]:
        schema = self._schema()
        database = self._database()

        conn = self._connect()
        try:
            cur = conn.cursor()
            if database and schema:
                safe_db = validate_sql_identifier(database, "database")
                safe_schema = validate_sql_identifier(schema, "schema")
                cur.execute(f'SHOW TABLES IN SCHEMA "{safe_db}"."{safe_schema}"')
            elif schema:
                safe_schema = validate_sql_identifier(schema, "schema")
                cur.execute(f'SHOW TABLES IN SCHEMA "{safe_schema}"')
            else:
                cur.execute("SHOW TABLES")

            rows = cur.fetchall()
            # Column index 1 is the table name in SHOW TABLES output
            return [row[1] for row in rows]
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Async interface
    # ------------------------------------------------------------------

    async def test_connection(self) -> tuple[bool, str]:
        return await asyncio.to_thread(self._sync_test_connection)

    async def fetch_data(
        self,
        query: str | None = None,
        table: str | None = None,
        filters: dict[str, Any] | None = None,
        limit: int = 1000,
    ) -> pd.DataFrame:
        return await asyncio.to_thread(
            self._sync_fetch_data, query, table, filters, limit
        )

    async def list_resources(self) -> list[str]:
        return await asyncio.to_thread(self._sync_list_resources)
