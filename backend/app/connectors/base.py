"""
BaseConnector - Abstract base class for all data connectors
"""
import re
from abc import ABC, abstractmethod
from typing import Any

import pandas as pd


# Required columns that every data source must provide
REQUIRED_COLUMNS = {"Date", "Entity_ID", "Entity_Name", "Volume"}

# Regex for valid SQL leaf identifiers (no dots — each segment validated separately).
_SAFE_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def validate_sql_identifier(value: str, param_name: str = "identifier") -> str:
    """
    Validate that *value* is a safe SQL leaf identifier (table name, column name, etc.).

    Dots are NOT allowed — use validate_qualified_identifier() for schema.table names.
    Rejects values that contain special characters, semicolons, spaces, or
    other patterns that could be used for SQL injection when the identifier
    is interpolated into a query string.
    """
    if not value or not value.strip():
        raise ValueError(f"{param_name} must not be empty")
    stripped = value.strip()
    if not _SAFE_IDENTIFIER_RE.match(stripped):
        raise ValueError(
            f"Invalid {param_name}: {stripped!r}. "
            "Only alphanumeric characters and underscores are allowed."
        )
    if len(stripped) > 255:
        raise ValueError(f"{param_name} exceeds maximum length of 255 characters")
    return stripped


def validate_qualified_identifier(value: str, param_name: str = "identifier") -> tuple[str, str]:
    """
    Validate a schema-qualified identifier like 'dbo.DailySales'.

    Splits on the first dot, validates each segment independently.
    Returns (schema, table) tuple. If no dot is present, returns ('dbo', value)
    as a default schema.
    """
    if not value or not value.strip():
        raise ValueError(f"{param_name} must not be empty")
    stripped = value.strip()
    if "." in stripped:
        parts = stripped.split(".", 1)
        schema = validate_sql_identifier(parts[0], f"{param_name} schema")
        table = validate_sql_identifier(parts[1], f"{param_name} table")
        return schema, table
    else:
        table = validate_sql_identifier(stripped, param_name)
        return "dbo", table


class BaseConnector(ABC):
    """
    Abstract base class for all LUCENT data connectors.

    All connectors must implement:
      - test_connection  — verify credentials and reachability
      - fetch_data       — pull data as a pandas DataFrame
      - list_resources   — enumerate available tables / files
    """

    def __init__(self, config: dict, tenant_id: str) -> None:
        self.config = config
        self.tenant_id = tenant_id

    # ------------------------------------------------------------------
    # Abstract interface
    # ------------------------------------------------------------------

    @abstractmethod
    async def test_connection(self) -> tuple[bool, str]:
        """
        Verify that the connector can reach its data source.

        Returns:
            (True, "Connection successful")  on success
            (False, "<reason>")              on failure — never expose raw
                                             credentials in the reason string
        """

    @abstractmethod
    async def fetch_data(
        self,
        query: str | None = None,
        table: str | None = None,
        filters: dict[str, Any] | None = None,
        limit: int = 1000,
    ) -> pd.DataFrame:
        """
        Fetch data from the source and return it as a pandas DataFrame.

        Args:
            query:   SQL query string (database connectors)
            table:   Table or file name (used when no explicit query given)
            filters: Optional dict of column → value filters
            limit:   Maximum number of rows to return (default 1000)

        Returns:
            pandas DataFrame with at least the required columns when the
            source contains data matching the LUCENT schema.
        """

    @abstractmethod
    async def list_resources(self) -> list[str]:
        """
        Enumerate the tables, views, or files available through this connector.

        Returns:
            List of resource name strings (table names, file paths, etc.)
        """

    # ------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------

    def validate_data(self, df: pd.DataFrame) -> tuple[bool, list[str]]:
        """
        Check that a DataFrame contains the four required LUCENT columns:
        Date, Entity_ID, Entity_Name, Volume.

        Returns:
            (True, [])                when all required columns are present
            (False, [missing cols])   when one or more columns are absent
        """
        missing = [col for col in REQUIRED_COLUMNS if col not in df.columns]
        if missing:
            return False, missing
        return True, []

    # ------------------------------------------------------------------
    # Credential-safe repr
    # ------------------------------------------------------------------

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<{self.__class__.__name__} "
            f"tenant_id={self.tenant_id!r}>"
        )
