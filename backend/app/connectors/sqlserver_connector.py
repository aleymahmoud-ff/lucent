"""
SQL Server Connector — uses aioodbc for fully async operation via ODBC Driver 17
"""
import logging
from typing import Any

import aioodbc
import pandas as pd

from .base import BaseConnector, validate_sql_identifier, validate_qualified_identifier

logger = logging.getLogger(__name__)


class SQLServerConnector(BaseConnector):
    """Connect to a Microsoft SQL Server database using aioodbc."""

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _dsn(self) -> str:
        """
        Build an ODBC connection string from the connector config.

        Config keys:
            host     — SQL Server hostname or IP (required)
            port     — TCP port, default 1433
            database — Target database name (required)
            username — Login name (required)
            password — Login password (required)
            driver   — ODBC driver name, default "ODBC Driver 17 for SQL Server"
            encrypt  — Whether to encrypt the connection ("yes"/"no"), default "yes"
            trust_cert — Whether to trust the server certificate ("yes"/"no"),
                         default "yes" (useful for self-signed certs in dev)
        """
        cfg = self.config
        host = cfg.get("host", "localhost")
        port = cfg.get("port", 1433)
        database = cfg.get("database", "")
        username = cfg.get("username", "")
        password = cfg.get("password", "")
        driver = cfg.get("driver", "ODBC Driver 17 for SQL Server")
        encrypt = cfg.get("encrypt", "yes")
        trust_cert = cfg.get("trust_cert", "yes")
        return (
            f"DRIVER={{{driver}}};"
            f"SERVER={host},{port};"
            f"DATABASE={database};"
            f"UID={username};"
            f"PWD={password};"
            f"Encrypt={encrypt};"
            f"TrustServerCertificate={trust_cert}"
        )

    def _schema(self) -> str:
        return self.config.get("schema", "dbo")

    # ------------------------------------------------------------------
    # Interface
    # ------------------------------------------------------------------

    async def test_connection(self) -> tuple[bool, str]:
        """
        Verify that the connector can reach the SQL Server instance.

        Returns:
            (True, "Connected to {database} on {host}")  on success
            (False, "<reason>")                          on failure —
                credentials are never included in the reason string
        """
        host = self.config.get("host", "localhost")
        database = self.config.get("database", "")
        try:
            async with aioodbc.connect(dsn=self._dsn()) as conn:
                async with conn.cursor() as cur:
                    await cur.execute("SELECT 1")
            return True, f"Connected to {database} on {host}"
        except aioodbc.Error as exc:
            msg = str(exc)
            # ODBC error codes surface as strings like "[28000]" (auth) or
            # "[08001]" (network / server not found).
            if "[28000]" in msg or "Login failed" in msg:
                return False, "Authentication failed — invalid credentials"
            if "[08001]" in msg or "TCP Provider" in msg or "named instance" in msg.lower():
                return False, "Network error — could not reach host"
            logger.debug("SQL Server test_connection ODBC error: %s", type(exc).__name__)
            return False, f"Connection failed: {type(exc).__name__}"
        except Exception as exc:
            logger.debug("SQL Server test_connection error: %s", type(exc).__name__)
            return False, f"Connection failed: {type(exc).__name__}"

    async def fetch_data(
        self,
        query: str | None = None,
        table: str | None = None,
        filters: dict[str, Any] | None = None,
        limit: int = 1000,
    ) -> pd.DataFrame:
        """
        Fetch data from SQL Server and return it as a pandas DataFrame.

        When *table* is given a ``SELECT TOP N`` query is built using the
        optional *filters* dict.  When *query* is given it is executed
        directly after passing through identifier validation on any table
        or column names embedded via the helper; the caller is responsible
        for ensuring the query string itself is safe.

        SQL Server identifiers are quoted with [bracket] notation.
        SQL Server uses ``TOP N`` instead of ``LIMIT N``.

        Args:
            query:   Raw SQL query string (executed as-is)
            table:   Table name — a safe SELECT TOP query is built for you
            filters: Optional column → value dict applied as WHERE conditions
            limit:   Maximum number of rows to return (default 1000)

        Returns:
            pandas DataFrame; empty DataFrame when the result set is empty
        """
        if not query and not table:
            raise ValueError("Either 'query' or 'table' must be provided")

        params: tuple = ()
        if not query:
            # Split schema.table if dot-qualified, validate each segment
            if "." in table:
                schema, safe_table_name = validate_qualified_identifier(table, "table")
            else:
                schema = validate_sql_identifier(self._schema(), "schema")
                safe_table_name = validate_sql_identifier(table, "table")
            # SQL Server bracket-quoted identifiers
            safe_table = f"[{schema}].[{safe_table_name}]"
            if filters:
                for col in filters.keys():
                    validate_sql_identifier(col, "filter column")
                conditions = " AND ".join(f"[{col}] = ?" for col in filters.keys())
                sql = (
                    f"SELECT TOP {int(limit)} * FROM {safe_table} "
                    f"WHERE {conditions}"
                )
                params = tuple(filters.values())
            else:
                sql = f"SELECT TOP {int(limit)} * FROM {safe_table}"
                params = ()
        else:
            # Wrap the caller-supplied query to enforce the row limit.
            # Cannot use TOP on a derived table that may contain ORDER BY,
            # so use OFFSET/FETCH which is compatible with subquery ORDER BY.
            sql = f"SELECT * FROM ({query}) AS _lucent_q ORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT {int(limit)} ROWS ONLY"
            params = ()

        async with aioodbc.connect(dsn=self._dsn()) as conn:
            async with conn.cursor() as cur:
                if params:
                    await cur.execute(sql, params)
                else:
                    await cur.execute(sql)

                rows = await cur.fetchall()
                if not rows:
                    return pd.DataFrame()

                # cur.description is a sequence of 7-item tuples; index 0 is
                # the column name.
                columns = [desc[0] for desc in cur.description]

        data = [list(row) for row in rows]
        return pd.DataFrame(data, columns=columns)

    async def list_resources(self) -> list[str]:
        """
        Return all base tables in the database as ``schema.table`` strings.

        Queries INFORMATION_SCHEMA.TABLES so no special permissions beyond
        SELECT on that view are required.

        Returns:
            Sorted list of "schema.table" name strings
        """
        async with aioodbc.connect(dsn=self._dsn()) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT TABLE_SCHEMA + '.' + TABLE_NAME
                    FROM   INFORMATION_SCHEMA.TABLES
                    WHERE  TABLE_TYPE = 'BASE TABLE'
                    ORDER  BY TABLE_SCHEMA, TABLE_NAME
                    """
                )
                rows = await cur.fetchall()

        return [row[0] for row in rows]
