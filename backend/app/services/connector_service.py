"""
Connector Service - Database connection, column discovery, and data access
"""
import json
import logging
from typing import List, Any, Dict, Optional

import pandas as pd
from cryptography.fernet import Fernet

from app.models.connector import Connector, ConnectorType
from app.config import settings
from app.connectors import get_connector
from app.core.validators import sanitize_sql_query, sanitize_file_path
from app.connectors.base import validate_sql_identifier

logger = logging.getLogger(__name__)


def decrypt_config(encrypted_config: str) -> Dict[str, Any]:
    """Decrypt connector configuration"""
    try:
        # If encryption is configured
        if hasattr(settings, 'ENCRYPTION_KEY') and settings.ENCRYPTION_KEY:
            f = Fernet(settings.ENCRYPTION_KEY.encode())
            decrypted = f.decrypt(encrypted_config.encode())
            return json.loads(decrypted.decode())
        else:
            # If no encryption, assume plain JSON
            return json.loads(encrypted_config)
    except Exception:
        # Fallback: try as plain JSON
        return json.loads(encrypted_config)


# ============================================================
# High-level service methods used by the API endpoints
# ============================================================

async def test_connector_connection(connector: Connector) -> tuple[bool, str]:
    """
    Decrypt the connector's stored config, instantiate the appropriate
    connector class, and run a connection test.

    Returns:
        (True, success_message) or (False, error_message)
    """
    try:
        config = decrypt_config(connector.config)
    except Exception as exc:
        logger.warning("Failed to decrypt config for connector %s: %s", connector.id, exc)
        return False, "Could not read connector configuration"

    try:
        conn = get_connector(connector.type.value, config, connector.tenant_id)
    except ValueError as exc:
        return False, str(exc)

    return await conn.test_connection()


async def fetch_connector_data(
    connector: Connector,
    query: Optional[str] = None,
    table: Optional[str] = None,
    filters: Optional[Dict[str, Any]] = None,
    limit: int = 1000,
) -> pd.DataFrame:
    """
    Decrypt the connector's stored config, instantiate the appropriate
    connector class, and fetch data as a pandas DataFrame.

    Args:
        connector: Connector ORM object
        query:     SQL query string (database connectors) or file key (storage connectors)
        table:     Table name or file path (used when no explicit query given)
        filters:   Optional dict of column → value filters
        limit:     Maximum number of rows to return

    Returns:
        pandas DataFrame
    """
    try:
        config = decrypt_config(connector.config)
    except Exception as exc:
        logger.warning("Failed to decrypt config for connector %s: %s", connector.id, exc)
        raise ValueError("Could not read connector configuration") from exc

    conn = get_connector(connector.type.value, config, connector.tenant_id)

    # If neither query nor table supplied, attempt to fall back to config defaults
    effective_query = query or config.get("query")
    effective_table = table or config.get("table") or config.get("key") or config.get("blob_name")

    # --- Security: sanitise user-supplied inputs ---
    is_db_connector = connector.type.value in ("postgres", "mysql", "snowflake", "sqlserver", "bigquery")
    is_storage_connector = connector.type.value in ("s3", "azure_blob", "gcs")

    if effective_query and is_db_connector:
        # Only allow read-only SELECT statements against database connectors
        effective_query = sanitize_sql_query(effective_query)

    if effective_table and is_storage_connector:
        # Prevent path traversal on cloud storage file keys / blob names
        effective_table = sanitize_file_path(effective_table, param_name="table/file path")

    if effective_query and is_storage_connector:
        # For storage connectors, query is used as a file key — sanitise it too
        effective_query = sanitize_file_path(effective_query, param_name="query/file path")

    return await conn.fetch_data(
        query=effective_query,
        table=effective_table,
        filters=filters,
        limit=limit,
    )


async def list_connector_resources(connector: Connector) -> List[str]:
    """
    Decrypt the connector's stored config, instantiate the appropriate
    connector class, and list available tables / files.

    Returns:
        List of resource name strings
    """
    try:
        config = decrypt_config(connector.config)
    except Exception as exc:
        logger.warning("Failed to decrypt config for connector %s: %s", connector.id, exc)
        raise ValueError("Could not read connector configuration") from exc

    conn = get_connector(connector.type.value, config, connector.tenant_id)
    return await conn.list_resources()


async def get_connector_columns_from_db(connector: Connector) -> List[str]:
    """
    Get column names from a connector's data source.
    Supports PostgreSQL, MySQL, SQL Server connectors.
    """
    config = decrypt_config(connector.config)
    connector_type = connector.type

    if connector_type == ConnectorType.POSTGRES:
        return await _get_postgres_columns(config)
    elif connector_type == ConnectorType.MYSQL:
        return await _get_mysql_columns(config)
    elif connector_type == ConnectorType.SQLSERVER:
        return await _get_sqlserver_columns(config)
    elif connector_type == ConnectorType.BIGQUERY:
        return await _get_bigquery_columns(config)
    elif connector_type == ConnectorType.SNOWFLAKE:
        return await _get_snowflake_columns(config)
    else:
        # For file-based connectors (S3, GCS, Azure Blob),
        # columns need to be discovered differently or entered manually
        raise ValueError(f"Column discovery not supported for connector type: {connector_type.value}")


async def _get_postgres_columns(config: Dict[str, Any]) -> List[str]:
    """Get columns from PostgreSQL database"""
    import asyncpg

    host = config.get('host', 'localhost')
    port = config.get('port', 5432)
    database = config.get('database')
    user = config.get('user')
    password = config.get('password')
    schema = config.get('schema', 'public')
    table = config.get('table')
    query = config.get('query')

    conn = await asyncpg.connect(
        host=host,
        port=port,
        database=database,
        user=user,
        password=password
    )

    try:
        if table:
            # Get columns from specific table
            columns = await conn.fetch("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = $1 AND table_name = $2
                ORDER BY ordinal_position
            """, schema, table)
            return [row['column_name'] for row in columns]
        elif query:
            # Get columns from query by executing with LIMIT 0
            limited_query = f"SELECT * FROM ({query}) AS q LIMIT 0"
            stmt = await conn.prepare(limited_query)
            return [attr.name for attr in stmt.get_attributes()]
        else:
            raise ValueError("Either 'table' or 'query' must be specified in connector config")
    finally:
        await conn.close()


async def _get_mysql_columns(config: Dict[str, Any]) -> List[str]:
    """Get columns from MySQL database"""
    import aiomysql

    host = config.get('host', 'localhost')
    port = config.get('port', 3306)
    database = config.get('database')
    user = config.get('user')
    password = config.get('password')
    table = config.get('table')
    query = config.get('query')

    conn = await aiomysql.connect(
        host=host,
        port=port,
        db=database,
        user=user,
        password=password
    )

    try:
        async with conn.cursor() as cur:
            if table:
                await cur.execute(f"""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position
                """, (database, table))
                rows = await cur.fetchall()
                return [row[0] for row in rows]
            elif query:
                # Get columns from query by executing with LIMIT 0
                limited_query = f"SELECT * FROM ({query}) AS q LIMIT 0"
                await cur.execute(limited_query)
                return [desc[0] for desc in cur.description]
            else:
                raise ValueError("Either 'table' or 'query' must be specified in connector config")
    finally:
        conn.close()


async def _get_sqlserver_columns(config: Dict[str, Any]) -> List[str]:
    """Get columns from SQL Server database"""
    import aioodbc

    host = config.get('host', 'localhost')
    port = config.get('port', 1433)
    database = config.get('database')
    user = config.get('user')
    password = config.get('password')
    schema = config.get('schema', 'dbo')
    table = config.get('table')
    query = config.get('query')

    dsn = f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={host},{port};DATABASE={database};UID={user};PWD={password}"

    async with aioodbc.connect(dsn=dsn) as conn:
        async with conn.cursor() as cur:
            if table:
                await cur.execute("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = ? AND table_name = ?
                    ORDER BY ordinal_position
                """, schema, table)
                rows = await cur.fetchall()
                return [row[0] for row in rows]
            elif query:
                # Get columns from query by executing with TOP 0
                limited_query = f"SELECT TOP 0 * FROM ({query}) AS q"
                await cur.execute(limited_query)
                return [desc[0] for desc in cur.description]
            else:
                raise ValueError("Either 'table' or 'query' must be specified in connector config")


async def _get_bigquery_columns(config: Dict[str, Any]) -> List[str]:
    """Get columns from BigQuery"""
    from google.cloud import bigquery
    from google.oauth2 import service_account
    import json

    credentials_json = config.get('credentials')
    project_id = config.get('project_id')
    dataset = config.get('dataset')
    table = config.get('table')
    query = config.get('query')

    if credentials_json:
        credentials = service_account.Credentials.from_service_account_info(
            json.loads(credentials_json) if isinstance(credentials_json, str) else credentials_json
        )
        client = bigquery.Client(credentials=credentials, project=project_id)
    else:
        client = bigquery.Client(project=project_id)

    if table:
        table_ref = f"{project_id}.{dataset}.{table}"
        table_obj = client.get_table(table_ref)
        return [field.name for field in table_obj.schema]
    elif query:
        # Dry run to get schema
        job_config = bigquery.QueryJobConfig(dry_run=True, use_query_cache=False)
        query_job = client.query(query, job_config=job_config)
        return [field.name for field in query_job.schema]
    else:
        raise ValueError("Either 'table' or 'query' must be specified in connector config")


async def _get_snowflake_columns(config: Dict[str, Any]) -> List[str]:
    """Get columns from Snowflake"""
    import snowflake.connector

    account = config.get('account')
    user = config.get('user')
    password = config.get('password')
    warehouse = config.get('warehouse')
    database = config.get('database')
    schema = config.get('schema', 'PUBLIC')
    table = config.get('table')
    query = config.get('query')

    conn = snowflake.connector.connect(
        account=account,
        user=user,
        password=password,
        warehouse=warehouse,
        database=database,
        schema=schema
    )

    try:
        cur = conn.cursor()
        if table:
            safe_schema = validate_sql_identifier(schema, "schema")
            safe_table = validate_sql_identifier(table, "table")
            cur.execute(f'DESCRIBE TABLE "{safe_schema}"."{safe_table}"')
            rows = cur.fetchall()
            return [row[0] for row in rows]  # Column name is first field
        elif query:
            # Get columns from query by executing with LIMIT 0
            limited_query = f"SELECT * FROM ({query}) LIMIT 0"
            cur.execute(limited_query)
            return [desc[0] for desc in cur.description]
        else:
            raise ValueError("Either 'table' or 'query' must be specified in connector config")
    finally:
        conn.close()
