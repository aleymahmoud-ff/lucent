"""
Input validation utilities for API endpoints.

Provides UUID validation, SQL query sanitization, and path traversal
protection used across the LUCENT backend.
"""
import re
import uuid
from fastapi import HTTPException, status


# ------------------------------------------------------------------
# UUID validation
# ------------------------------------------------------------------

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def validate_uuid(value: str, param_name: str = "id") -> str:
    """
    Validate that *value* looks like a UUID v4 string.

    Raises HTTPException 422 when the value is not a valid UUID so that
    the error is surfaced before any database query is attempted.
    """
    if not _UUID_RE.match(value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid UUID format for '{param_name}': {value!r}",
        )
    return value


# ------------------------------------------------------------------
# SQL query sanitisation (for connector fetch)
# ------------------------------------------------------------------

# Statements that must never appear in user-supplied SQL
_DANGEROUS_SQL_PATTERNS = re.compile(
    r"""
    \b(
        DROP\s+|ALTER\s+|TRUNCATE\s+|DELETE\s+|UPDATE\s+|INSERT\s+|
        CREATE\s+|GRANT\s+|REVOKE\s+|EXEC\s+|EXECUTE\s+|
        INTO\s+OUTFILE|INTO\s+DUMPFILE|LOAD_FILE|
        pg_sleep|WAITFOR\s+DELAY|BENCHMARK\s*\(|
        xp_cmdshell|sp_executesql|
        COPY\s+|\\\\copy
    )
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Only SELECT statements are allowed
_SELECT_ONLY_RE = re.compile(r"^\s*SELECT\s", re.IGNORECASE)

# Semicolons signal multi-statement attacks
_SEMICOLON_RE = re.compile(r";")


def sanitize_sql_query(query: str) -> str:
    """
    Validate a user-supplied SQL query intended for read-only data preview.

    Raises ValueError when the query contains dangerous patterns such as
    DDL/DML keywords, multi-statement separators, or known injection payloads.
    """
    if not query or not query.strip():
        raise ValueError("Query must not be empty")

    stripped = query.strip()

    # Must start with SELECT
    if not _SELECT_ONLY_RE.match(stripped):
        raise ValueError(
            "Only SELECT queries are allowed. "
            "Query must begin with 'SELECT'."
        )

    # No semicolons (prevent multi-statement injection)
    if _SEMICOLON_RE.search(stripped):
        raise ValueError(
            "Semicolons are not allowed in queries. "
            "Please provide a single SELECT statement."
        )

    # No dangerous keywords
    match = _DANGEROUS_SQL_PATTERNS.search(stripped)
    if match:
        raise ValueError(
            f"Disallowed SQL keyword detected: '{match.group().strip()}'. "
            "Only read-only SELECT queries are permitted."
        )

    return stripped


# ------------------------------------------------------------------
# Path traversal protection (for cloud storage connectors)
# ------------------------------------------------------------------

_TRAVERSAL_PATTERNS = re.compile(r"(\.\.[\\/]|[\\/]\.\.)")


def sanitize_file_path(path: str, param_name: str = "path") -> str:
    """
    Reject file paths that contain path traversal sequences.

    This protects S3, Azure Blob, and GCS connectors from requests
    that try to escape the expected prefix/bucket boundary.
    """
    if not path or not path.strip():
        raise ValueError(f"{param_name} must not be empty")

    if _TRAVERSAL_PATTERNS.search(path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Path traversal detected in '{param_name}'. "
                   "Relative path components ('..') are not allowed.",
        )

    # Reject null bytes
    if "\x00" in path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Null bytes are not allowed in '{param_name}'.",
        )

    return path.strip()


# ------------------------------------------------------------------
# Generic string length enforcement
# ------------------------------------------------------------------

def validate_string_length(
    value: str,
    param_name: str,
    max_length: int = 1000,
) -> str:
    """
    Enforce a maximum length on arbitrary string inputs that are not
    already covered by Pydantic Field(max_length=...).
    """
    if len(value) > max_length:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"'{param_name}' exceeds maximum length of {max_length} characters.",
        )
    return value
