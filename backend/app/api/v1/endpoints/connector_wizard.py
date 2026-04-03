"""
Connector Wizard Endpoints - Step-by-step import wizard for database connectors.

Endpoint prefix: /connectors/{connector_id}/wizard/
All endpoints require tenant admin auth.

Admin wizard steps:
  1. POST /tables      — list tables with approximate row counts
  2. POST /columns     — inspect column schema for a table
  3. POST /preview     — sample rows with proposed column mapping applied
  4. POST /date-range  — MIN/MAX of a date column
  5. POST /setup       — save recipe + extract ALL entities + auto-create RLS
"""
import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.base import validate_sql_identifier
from app.core.deps import get_current_tenant_admin, get_db
from app.core.validators import validate_uuid
from app.db.redis_client import get_redis
from app.models import ConnectorDataSource, ConnectorRLS, Dataset, User
from app.models.connector import Connector
from app.schemas.connector_wizard import (
    WizardColumnResponse,
    WizardColumnsRequest,
    WizardDateRangeRequest,
    WizardDateRangeResponse,
    WizardEntitiesRequest,
    WizardEntityResponse,
    WizardImportRequest,
    WizardImportResponse,
    WizardPreviewRequest,
    WizardSetupRequest,
    WizardSetupResponse,
    WizardTableResponse,
)
from app.schemas.connectors import ConnectorFetchResponse
from app.services.connector_service import decrypt_config, fetch_connector_data

logger = logging.getLogger(__name__)

router = APIRouter()

# Redis TTL for wizard-imported datasets (matches dataset_service pattern: 4 hours)
_REDIS_DATASET_PREFIX = "dataset:"
_REDIS_DATASET_META_PREFIX = "dataset_meta:"
_REDIS_DATASET_TTL = 3600 * 4

# ============================================================
# SQL dialect helpers
# ============================================================

# Per-dialect quoting characters for identifiers
_QUOTE_OPEN: Dict[str, str] = {
    "sqlserver": "[",
    "postgres": '"',
    "mysql": "`",
    "snowflake": '"',
    "bigquery": "`",
}
_QUOTE_CLOSE: Dict[str, str] = {
    "sqlserver": "]",
    "postgres": '"',
    "mysql": "`",
    "snowflake": '"',
    "bigquery": "`",
}

# TOP N vs LIMIT N
_USE_TOP: set = {"sqlserver"}

# Parameter placeholder style
_PARAM_STYLE: Dict[str, str] = {
    "sqlserver": "?",
    "postgres": "$1",
    "mysql": "%s",
    "snowflake": "%s",
    "bigquery": "@param",
}


def _quote_ident(name: str, db_type: str) -> str:
    """Wrap *name* in the correct identifier-quoting characters for *db_type*."""
    qo = _QUOTE_OPEN.get(db_type, '"')
    qc = _QUOTE_CLOSE.get(db_type, '"')
    return f"{qo}{name}{qc}"


def _limit_clause(db_type: str, n: int) -> Tuple[str, str]:
    """
    Return (prefix_clause, suffix_clause) for limiting rows.

    SQL Server uses   SELECT TOP N ...  (prefix after SELECT keyword, no suffix).
    Everyone else uses                  ... LIMIT N  (suffix).
    """
    if db_type in _USE_TOP:
        return f"TOP {n}", ""
    return "", f"LIMIT {n}"


# ============================================================
# Common connector validation helper
# ============================================================

async def _resolve_connector(
    connector_id: str,
    tenant_id: str,
    db: AsyncSession,
) -> Connector:
    """
    Load a connector from the database, verify tenant ownership, and confirm
    it is active.  Raises appropriate HTTPExceptions on failure.
    """
    validate_uuid(connector_id, "connector_id")
    connector = await db.scalar(
        select(Connector).where(
            Connector.id == connector_id,
            Connector.tenant_id == tenant_id,
        )
    )
    if not connector:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CONNECTOR_NOT_FOUND", "message": "Connector not found"},
        )
    if not connector.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "CONNECTOR_INACTIVE", "message": "Connector is inactive"},
        )
    return connector


# ============================================================
# Raw SQL execution helper
# ============================================================

async def _execute_wizard_query(
    connector: Connector,
    sql: str,
    params: tuple = (),
) -> List[Any]:
    """
    Execute a raw SQL query against the connector using its native driver and
    return the result rows as a list of sequences.

    This bypasses the high-level fetch_connector_data() path so we can run
    arbitrary metadata queries (INFORMATION_SCHEMA, sys.partitions, etc.)
    that are not SELECT-from-a-table operations.

    Raises HTTPException 502 on any connector-level failure.
    """
    db_type = connector.type.value
    config = decrypt_config(connector.config)

    try:
        if db_type == "sqlserver":
            import aioodbc
            host = config.get("host", "localhost")
            port = config.get("port", 1433)
            database = config.get("database", "")
            username = config.get("username", "")
            password = config.get("password", "")
            driver = config.get("driver", "ODBC Driver 17 for SQL Server")
            encrypt = config.get("encrypt", "yes")
            trust_cert = config.get("trust_cert", "yes")
            dsn = (
                f"DRIVER={{{driver}}};"
                f"SERVER={host},{port};"
                f"DATABASE={database};"
                f"UID={username};"
                f"PWD={password};"
                f"Encrypt={encrypt};"
                f"TrustServerCertificate={trust_cert}"
            )
            async with aioodbc.connect(dsn=dsn) as conn:
                async with conn.cursor() as cur:
                    if params:
                        await cur.execute(sql, params)
                    else:
                        await cur.execute(sql)
                    return await cur.fetchall()

        elif db_type == "postgres":
            import asyncpg
            host = config.get("host", "localhost")
            port = config.get("port", 5432)
            database = config.get("database")
            user = config.get("user") or config.get("username")
            password = config.get("password")
            conn_pg = await asyncpg.connect(
                host=host, port=port, database=database, user=user, password=password
            )
            try:
                rows = await conn_pg.fetch(sql, *params)
                return [tuple(r) for r in rows]
            finally:
                await conn_pg.close()

        elif db_type == "mysql":
            import aiomysql
            host = config.get("host", "localhost")
            port = config.get("port", 3306)
            database = config.get("database")
            user = config.get("user") or config.get("username")
            password = config.get("password")
            conn_my = await aiomysql.connect(
                host=host, port=port, db=database, user=user, password=password
            )
            try:
                async with conn_my.cursor() as cur:
                    if params:
                        await cur.execute(sql, params)
                    else:
                        await cur.execute(sql)
                    return await cur.fetchall()
            finally:
                conn_my.close()

        elif db_type == "snowflake":
            import asyncio
            import snowflake.connector
            account = config.get("account")
            user_sf = config.get("user") or config.get("username")
            password = config.get("password")
            warehouse = config.get("warehouse")
            database = config.get("database")
            schema_sf = config.get("schema", "PUBLIC")
            conn_sf = snowflake.connector.connect(
                account=account, user=user_sf, password=password,
                warehouse=warehouse, database=database, schema=schema_sf,
            )
            try:
                cur = conn_sf.cursor()
                loop = asyncio.get_event_loop()
                if params:
                    await loop.run_in_executor(None, lambda: cur.execute(sql, params))
                else:
                    await loop.run_in_executor(None, lambda: cur.execute(sql))
                return await loop.run_in_executor(None, cur.fetchall)
            finally:
                conn_sf.close()

        else:
            raise ValueError(f"Raw query not supported for connector type: {db_type}")

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "Wizard query failed on connector %s (%s): %s",
            connector.id, db_type, exc,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "CONNECTOR_QUERY_FAILED",
                "message": "The connector returned an error while executing the query",
            },
        )


# ============================================================
# Step 1 — List tables
# ============================================================

@router.post("/{connector_id}/wizard/tables", response_model=List[WizardTableResponse])
async def wizard_list_tables(
    connector_id: str,
    current_user: User = Depends(get_current_tenant_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Step 1 — List all base tables in the connector's database together with
    approximate row counts.  Row count failures are non-blocking (returns None).
    """
    connector = await _resolve_connector(connector_id, current_user.tenant_id, db)
    db_type = connector.type.value

    # Fetch table list from INFORMATION_SCHEMA
    try:
        if db_type == "sqlserver":
            table_rows = await _execute_wizard_query(
                connector,
                "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
                "WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME",
            )
        elif db_type == "postgres":
            table_rows = await _execute_wizard_query(
                connector,
                "SELECT table_schema, table_name FROM information_schema.tables "
                "WHERE table_type = 'BASE TABLE' AND table_schema NOT IN "
                "('pg_catalog', 'information_schema') ORDER BY table_schema, table_name",
            )
        elif db_type == "mysql":
            config = decrypt_config(connector.config)
            database = config.get("database", "")
            table_rows = await _execute_wizard_query(
                connector,
                "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
                "WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = %s "
                "ORDER BY TABLE_NAME",
                (database,),
            )
        elif db_type == "snowflake":
            table_rows = await _execute_wizard_query(
                connector,
                "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
                "WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "UNSUPPORTED_CONNECTOR_TYPE",
                    "message": f"Table listing is not supported for connector type '{db_type}'",
                },
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Table listing failed for connector %s: %s", connector_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "TABLE_LISTING_FAILED",
                "message": "Failed to retrieve table list from the connector",
            },
        )

    results: List[WizardTableResponse] = []
    for row in table_rows:
        schema_name, table_name = str(row[0]), str(row[1])
        qualified = f"{schema_name}.{table_name}"

        # Attempt row count — non-blocking
        row_count: Optional[int] = None
        try:
            if db_type == "sqlserver":
                rc_rows = await _execute_wizard_query(
                    connector,
                    "SELECT SUM(rows) FROM sys.partitions "
                    "WHERE object_id = OBJECT_ID(?) AND index_id IN (0, 1)",
                    (qualified,),
                )
                if rc_rows and rc_rows[0][0] is not None:
                    row_count = int(rc_rows[0][0])
            elif db_type in ("postgres", "mysql", "snowflake"):
                # Use reltuples / TABLE_ROWS / ROW_COUNT statistics — best effort
                if db_type == "postgres":
                    rc_rows = await _execute_wizard_query(
                        connector,
                        "SELECT reltuples::bigint FROM pg_class c "
                        "JOIN pg_namespace n ON n.oid = c.relnamespace "
                        "WHERE n.nspname = $1 AND c.relname = $2",
                        (schema_name, table_name),
                    )
                    if rc_rows and rc_rows[0][0] is not None:
                        row_count = max(0, int(rc_rows[0][0]))
                elif db_type == "mysql":
                    rc_rows = await _execute_wizard_query(
                        connector,
                        "SELECT TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES "
                        "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s",
                        (schema_name, table_name),
                    )
                    if rc_rows and rc_rows[0][0] is not None:
                        row_count = int(rc_rows[0][0])
                elif db_type == "snowflake":
                    # Snowflake: use ROW_COUNT from information_schema
                    rc_rows = await _execute_wizard_query(
                        connector,
                        "SELECT ROW_COUNT FROM INFORMATION_SCHEMA.TABLES "
                        "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s",
                        (schema_name, table_name),
                    )
                    if rc_rows and rc_rows[0][0] is not None:
                        row_count = int(rc_rows[0][0])
        except Exception as rc_exc:
            logger.debug(
                "Row count query failed for %s (non-blocking): %s", qualified, rc_exc
            )

        results.append(
            WizardTableResponse(
                name=qualified,
                schema_name=schema_name,
                row_count=row_count,
            )
        )

    return results


# ============================================================
# Step 2 — Columns for a table
# ============================================================

@router.post("/{connector_id}/wizard/columns", response_model=List[WizardColumnResponse])
async def wizard_list_columns(
    connector_id: str,
    body: WizardColumnsRequest,
    current_user: User = Depends(get_current_tenant_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Step 2 — Return column schema (name, type, nullable) for the requested
    table, plus one sample value per column fetched from a single TOP 1 / LIMIT 1
    row.
    """
    connector = await _resolve_connector(connector_id, current_user.tenant_id, db)
    db_type = connector.type.value

    # Split schema.table
    table_str = body.table.strip()
    if "." in table_str:
        parts = table_str.split(".", 1)
        schema_part = parts[0].strip()
        table_part = parts[1].strip()
    else:
        schema_part = _default_schema(db_type)
        table_part = table_str

    # Validate both parts as identifiers
    try:
        validate_sql_identifier(schema_part, "schema")
        validate_sql_identifier(table_part, "table")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_TABLE_NAME", "message": str(exc)},
        )

    # Fetch column metadata from INFORMATION_SCHEMA
    try:
        if db_type == "sqlserver":
            col_rows = await _execute_wizard_query(
                connector,
                "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE "
                "FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? "
                "ORDER BY ORDINAL_POSITION",
                (schema_part, table_part),
            )
        elif db_type == "postgres":
            col_rows = await _execute_wizard_query(
                connector,
                "SELECT column_name, data_type, is_nullable "
                "FROM information_schema.columns "
                "WHERE table_schema = $1 AND table_name = $2 "
                "ORDER BY ordinal_position",
                (schema_part, table_part),
            )
        elif db_type == "mysql":
            col_rows = await _execute_wizard_query(
                connector,
                "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE "
                "FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s "
                "ORDER BY ORDINAL_POSITION",
                (schema_part, table_part),
            )
        elif db_type == "snowflake":
            col_rows = await _execute_wizard_query(
                connector,
                "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE "
                "FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s "
                "ORDER BY ORDINAL_POSITION",
                (schema_part.upper(), table_part.upper()),
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "UNSUPPORTED_CONNECTOR_TYPE",
                    "message": f"Column inspection is not supported for connector type '{db_type}'",
                },
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Column query failed for connector %s: %s", connector_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "COLUMN_QUERY_FAILED",
                "message": "Failed to retrieve column schema from the connector",
            },
        )

    if not col_rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TABLE_NOT_FOUND",
                "message": f"Table '{body.table}' not found or has no columns",
            },
        )

    # Fetch one sample row — non-blocking
    sample_map: Dict[str, Optional[str]] = {}
    try:
        qs = _quote_ident(schema_part, db_type)
        qt = _quote_ident(table_part, db_type)
        top_prefix, limit_suffix = _limit_clause(db_type, 1)
        top_clause = f" {top_prefix}" if top_prefix else ""
        limit_clause_str = f" {limit_suffix}" if limit_suffix else ""
        sample_sql = f"SELECT{top_clause} * FROM {qs}.{qt}{limit_clause_str}"
        sample_rows = await _execute_wizard_query(connector, sample_sql)
        if sample_rows:
            first_row = sample_rows[0]
            for idx, col_info in enumerate(col_rows):
                col_name = str(col_info[0])
                val = first_row[idx] if idx < len(first_row) else None
                sample_map[col_name] = str(val) if val is not None else None
    except Exception as sample_exc:
        logger.debug(
            "Sample row fetch failed for %s.%s (non-blocking): %s",
            schema_part, table_part, sample_exc,
        )

    return [
        WizardColumnResponse(
            name=str(r[0]),
            type=str(r[1]),
            nullable=(str(r[2]).upper() in ("YES", "Y", "1", "TRUE")),
            sample=sample_map.get(str(r[0])),
        )
        for r in col_rows
    ]


# ============================================================
# Step 3 — Preview rows
# ============================================================

@router.post("/{connector_id}/wizard/preview", response_model=ConnectorFetchResponse)
async def wizard_preview(
    connector_id: str,
    body: WizardPreviewRequest,
    current_user: User = Depends(get_current_tenant_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Step 3 — Fetch a sample of rows from the table and apply the proposed
    column_map to rename columns in the response.
    """
    connector = await _resolve_connector(connector_id, current_user.tenant_id, db)

    try:
        df: pd.DataFrame = await fetch_connector_data(
            connector,
            table=body.table,
            limit=body.limit,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "FETCH_ERROR", "message": str(exc)},
        )
    except Exception as exc:
        logger.error("Preview fetch failed for connector %s: %s", connector_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "CONNECTOR_FETCH_FAILED",
                "message": "Failed to fetch preview data from the connector",
            },
        )

    # Apply column_map: keys are LUCENT roles, values are remote column names.
    # We rename remote column names → LUCENT role names where present.
    if body.column_map:
        # Build reverse map: remote_col_name -> lucent_role
        reverse_map = {v: k for k, v in body.column_map.items()}
        df = df.rename(columns=reverse_map)

    df = df.where(df.notna(), other=None)
    return ConnectorFetchResponse(
        columns=list(df.columns),
        rows=df.to_dict(orient="records"),
        row_count=len(df),
    )


# ============================================================
# Step 4 — Date range
# ============================================================

@router.post("/{connector_id}/wizard/date-range", response_model=WizardDateRangeResponse)
async def wizard_date_range(
    connector_id: str,
    body: WizardDateRangeRequest,
    current_user: User = Depends(get_current_tenant_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Step 4 — Return MIN date, MAX date, and total row count for the
    requested date column so the UI can offer a sensible date filter.
    """
    connector = await _resolve_connector(connector_id, current_user.tenant_id, db)
    db_type = connector.type.value

    # Validate identifiers
    table_str = body.table.strip()
    if "." in table_str:
        schema_part, table_part = table_str.split(".", 1)
        schema_part = schema_part.strip()
        table_part = table_part.strip()
    else:
        schema_part = _default_schema(db_type)
        table_part = table_str

    try:
        validate_sql_identifier(schema_part, "schema")
        validate_sql_identifier(table_part, "table")
        validate_sql_identifier(body.date_column, "date_column")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_IDENTIFIER", "message": str(exc)},
        )

    qs = _quote_ident(schema_part, db_type)
    qt = _quote_ident(table_part, db_type)
    qd = _quote_ident(body.date_column, db_type)

    sql = (
        f"SELECT MIN({qd}), MAX({qd}), COUNT(*) "
        f"FROM {qs}.{qt}"
    )

    try:
        rows = await _execute_wizard_query(connector, sql)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Date range query failed for connector %s: %s", connector_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "DATE_RANGE_QUERY_FAILED",
                "message": "Failed to compute date range from the connector",
            },
        )

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TABLE_NOT_FOUND",
                "message": f"Table '{body.table}' not found or returned no results",
            },
        )

    min_val, max_val, total_rows = rows[0][0], rows[0][1], rows[0][2]

    def _to_iso(val: Any) -> Optional[str]:
        if val is None:
            return None
        if isinstance(val, datetime):
            return val.isoformat()
        return str(val)

    return WizardDateRangeResponse(
        min_date=_to_iso(min_val),
        max_date=_to_iso(max_val),
        total_rows=int(total_rows) if total_rows is not None else 0,
    )


# ============================================================
# Step 5 — Admin Setup (NEW two-role flow)
# ============================================================

@router.post(
    "/{connector_id}/wizard/setup",
    response_model=WizardSetupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def wizard_setup(
    connector_id: str,
    body: WizardSetupRequest,
    current_user: User = Depends(get_current_tenant_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Step 5 — Admin setup (final wizard step):
      1. Extract ALL unique entities from the data source.
      2. Save ConnectorDataSource record (the "recipe").
      3. Auto-create ConnectorRLS with rls_column = entity_id mapping.
      4. Return entity list so admin can assign to groups via RLS UI.
    """
    connector = await _resolve_connector(connector_id, current_user.tenant_id, db)
    db_type = connector.type.value
    tenant_id = str(current_user.tenant_id)
    user_id = str(current_user.id)

    # ---- Validate identifiers ----
    table_str = body.table.strip()
    if "." in table_str:
        schema_part, table_part = table_str.split(".", 1)
        schema_part = schema_part.strip()
        table_part = table_part.strip()
    else:
        schema_part = _default_schema(db_type)
        table_part = table_str

    try:
        validate_sql_identifier(schema_part, "schema")
        validate_sql_identifier(table_part, "table")
        for role, remote_col in body.column_map.items():
            validate_sql_identifier(remote_col, f"column_map[{role!r}]")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_IDENTIFIER", "message": str(exc)},
        )

    # ---- Extract ALL unique entities ----
    entity_id_col = body.column_map.get("entity_id")
    entity_name_col = body.column_map.get("entity_name")

    if not entity_id_col:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "MISSING_ENTITY_ID", "message": "column_map must include 'entity_id'"},
        )

    qs = _quote_ident(schema_part, db_type)
    qt = _quote_ident(table_part, db_type)
    qid = _quote_ident(entity_id_col, db_type)

    if entity_name_col:
        qname = _quote_ident(entity_name_col, db_type)
        sql = (
            f"SELECT {qid}, {qname}, COUNT(*) AS cnt "
            f"FROM {qs}.{qt} "
            f"GROUP BY {qid}, {qname} "
            f"ORDER BY cnt DESC"
        )
    else:
        sql = (
            f"SELECT {qid}, COUNT(*) AS cnt "
            f"FROM {qs}.{qt} "
            f"GROUP BY {qid} "
            f"ORDER BY cnt DESC"
        )

    try:
        rows = await _execute_wizard_query(connector, sql)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Entity extraction failed for connector %s: %s", connector_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "ENTITY_EXTRACTION_FAILED",
                "message": "Failed to extract entities from the data source",
            },
        )

    entities: List[WizardEntityResponse] = []
    all_entity_ids: List[str] = []
    for row in rows:
        if entity_name_col:
            eid, ename, count = row[0], row[1], row[2]
        else:
            eid, count = row[0], row[1]
            ename = None

        eid_str = str(eid) if eid is not None else ""
        all_entity_ids.append(eid_str)
        entities.append(
            WizardEntityResponse(
                id=eid_str,
                name=str(ename) if ename is not None else None,
                count=int(count) if count is not None else 0,
            )
        )

    # ---- Persist DB records ----
    try:
        # ConnectorDataSource — saves the "recipe" with all entities
        data_source = ConnectorDataSource(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            connector_id=connector_id,
            name=body.name,
            source_table=body.table,
            column_map=body.column_map,
            selected_entity_ids=all_entity_ids,
            created_by=user_id,
        )
        db.add(data_source)

        # Auto-create ConnectorRLS — set rls_column to the entity_id column
        existing_rls = await db.scalar(
            select(ConnectorRLS).where(ConnectorRLS.connector_id == connector_id)
        )
        if existing_rls:
            existing_rls.rls_column = entity_id_col
            existing_rls.is_enabled = True
        else:
            rls_config = ConnectorRLS(
                connector_id=connector_id,
                rls_column=entity_id_col,
                is_enabled=True,
            )
            db.add(rls_config)

        await db.commit()
        await db.refresh(data_source)

    except Exception as db_exc:
        await db.rollback()
        logger.error(
            "DB persistence failed for wizard setup connector %s: %s",
            connector_id, db_exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "SETUP_PERSIST_FAILED",
                "message": "Setup could not be saved",
            },
        )

    return WizardSetupResponse(
        data_source_id=str(data_source.id),
        entities=entities,
        rls_column=entity_id_col,
        entity_count=len(entities),
    )


# ============================================================
# Private helpers
# ============================================================

def _default_schema(db_type: str) -> str:
    """Return the conventional default schema name for a given DB type."""
    defaults = {
        "sqlserver": "dbo",
        "postgres": "public",
        "mysql": "",
        "snowflake": "PUBLIC",
        "bigquery": "",
    }
    return defaults.get(db_type, "public")


def _indexed_placeholder(db_type: str, index: int) -> str:
    """
    Return the correct positional parameter placeholder for *index*
    (1-based) for the given DB type.

    PostgreSQL uses $1, $2, …; all others use a fixed symbol.
    """
    if db_type == "postgres":
        return f"${index}"
    return _PARAM_STYLE.get(db_type, "?")
