"""
Connector Data Endpoints - User-facing data access filtered by RLS.

After an admin sets up a data source via the wizard, regular users
access their allowed data through these endpoints. Entity access is
controlled by the user's group membership (UserGroup.rls_values).

Endpoints:
  GET  /data-sources/{id}/entities — list user's RLS-allowed entities
  POST /data-sources/{id}/import   — import data filtered by RLS + date range
"""
import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.connectors.base import validate_sql_identifier
from app.core.deps import get_current_user, get_db
from app.core.validators import validate_uuid
from app.db.redis_client import get_redis
from app.models import (
    ConnectorDataSource,
    Connector,
    ConnectorRLS,
    Dataset,
    User,
    UserGroup,
    UserGroupMembership,
)
from app.schemas.connector_wizard import (
    UserImportRequest,
    WizardEntityResponse,
    WizardImportResponse,
)
from app.services.connector_service import decrypt_config
from app.connectors import get_connector

logger = logging.getLogger(__name__)

router = APIRouter()

_REDIS_DATASET_PREFIX = "dataset:"
_REDIS_DATASET_META_PREFIX = "dataset_meta:"
_REDIS_DATASET_TTL = 3600 * 4

# SQL dialect helpers (shared with connector_wizard.py)
_QUOTE_OPEN = {"sqlserver": "[", "postgres": '"', "mysql": "`", "snowflake": '"', "bigquery": "`"}
_QUOTE_CLOSE = {"sqlserver": "]", "postgres": '"', "mysql": "`", "snowflake": '"', "bigquery": "`"}
_PARAM_STYLE = {"sqlserver": "?", "postgres": "$1", "mysql": "%s", "snowflake": "%s", "bigquery": "@param"}


def _quote_ident(name: str, db_type: str) -> str:
    qo = _QUOTE_OPEN.get(db_type, '"')
    qc = _QUOTE_CLOSE.get(db_type, '"')
    return f"{qo}{name}{qc}"


def _indexed_placeholder(db_type: str, index: int) -> str:
    if db_type == "postgres":
        return f"${index}"
    return _PARAM_STYLE.get(db_type, "?")


# ============================================================
# Helpers
# ============================================================

async def _get_user_allowed_entities(
    user: User, connector_id: str, db: AsyncSession
) -> List[str]:
    """
    Get the entity IDs that a user is allowed to access based on their
    group memberships and the connector's RLS configuration.

    Returns an empty list if no RLS is configured (meaning all entities allowed).
    """
    # Check if RLS is enabled for this connector
    rls_config = await db.scalar(
        select(ConnectorRLS).where(
            ConnectorRLS.connector_id == connector_id,
            ConnectorRLS.is_enabled == True,
        )
    )
    if not rls_config:
        return []  # No RLS = all entities allowed

    # Get user's group memberships
    memberships = await db.execute(
        select(UserGroupMembership).where(
            UserGroupMembership.user_id == user.id
        )
    )
    group_ids = [m.group_id for m in memberships.scalars().all()]

    if not group_ids:
        return []  # User has no groups = no access

    # Get RLS values from all user's groups
    groups = await db.execute(
        select(UserGroup).where(
            UserGroup.id.in_(group_ids),
            UserGroup.tenant_id == user.tenant_id,
            UserGroup.is_active == True,
        )
    )

    allowed_entities: List[str] = []
    for group in groups.scalars().all():
        if group.rls_values:
            allowed_entities.extend(group.rls_values)

    return list(set(allowed_entities))  # Deduplicate


# ============================================================
# GET /data-sources/{data_source_id}/entities
# ============================================================

@router.get(
    "/{data_source_id}/entities",
    response_model=List[WizardEntityResponse],
)
async def get_user_entities(
    data_source_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List the entities that the current user is allowed to access
    for a given data source, filtered by their RLS group membership.
    """
    validate_uuid(data_source_id, "data_source_id")
    tenant_id = current_user.tenant_id

    # Load data source
    data_source = await db.scalar(
        select(ConnectorDataSource).where(
            ConnectorDataSource.id == data_source_id,
            ConnectorDataSource.tenant_id == tenant_id,
            ConnectorDataSource.is_active == True,
        )
    )
    if not data_source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Data source not found",
        )

    # Get user's allowed entity IDs via RLS
    allowed = await _get_user_allowed_entities(
        current_user, data_source.connector_id, db
    )

    # All entities stored during setup
    all_entities = data_source.selected_entity_ids or []

    # Filter to only allowed entities (if RLS is active)
    if allowed:
        visible = [eid for eid in all_entities if eid in allowed]
    else:
        visible = all_entities  # No RLS = see all

    return [
        WizardEntityResponse(id=eid, name=None, count=0)
        for eid in visible
    ]


# ============================================================
# POST /data-sources/{data_source_id}/import
# ============================================================

@router.post(
    "/{data_source_id}/import",
    response_model=WizardImportResponse,
    status_code=status.HTTP_201_CREATED,
)
async def user_import_data(
    data_source_id: str,
    body: UserImportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Import data from a configured data source, filtered by:
    - The user's RLS-allowed entities
    - The user's selected date range
    """
    validate_uuid(data_source_id, "data_source_id")
    tenant_id = str(current_user.tenant_id)
    user_id = str(current_user.id)

    # Load data source recipe
    data_source = await db.scalar(
        select(ConnectorDataSource).where(
            ConnectorDataSource.id == data_source_id,
            ConnectorDataSource.tenant_id == tenant_id,
            ConnectorDataSource.is_active == True,
        )
    )
    if not data_source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Data source not found",
        )

    # Load connector
    connector = await db.scalar(
        select(Connector).where(
            Connector.id == data_source.connector_id,
            Connector.tenant_id == tenant_id,
        )
    )
    if not connector or not connector.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Connector not found or inactive",
        )

    # Get user's allowed entities
    allowed = await _get_user_allowed_entities(current_user, connector.id, db)
    if not allowed:
        # No RLS = use all entities from recipe
        allowed = data_source.selected_entity_ids or []

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No entities assigned to your group. Contact your admin.",
        )

    # Build query using the saved recipe
    column_map = data_source.column_map
    db_type = connector.type.value
    config = decrypt_config(connector.config)
    conn_instance = get_connector(db_type, config, tenant_id)

    table_str = data_source.source_table.strip()
    if "." in table_str:
        schema_part, table_part = table_str.split(".", 1)
    else:
        schema_part = "dbo" if db_type == "sqlserver" else "public"
        table_part = table_str

    qs = _quote_ident(validate_sql_identifier(schema_part, "schema"), db_type)
    qt = _quote_ident(validate_sql_identifier(table_part, "table"), db_type)

    # Build SELECT with mapped columns
    select_parts = []
    for role, remote_col in column_map.items():
        qcol = _quote_ident(validate_sql_identifier(remote_col, f"col_{role}"), db_type)
        qrole = _quote_ident(role, db_type)
        select_parts.append(f"{qcol} AS {qrole}")

    # Build WHERE clause
    where_clauses = []
    entity_id_col = column_map.get("entity_id")
    if entity_id_col:
        qec = _quote_ident(entity_id_col, db_type)
        entity_placeholders = ", ".join(
            f"'{eid}'" for eid in allowed  # String literals for entity IDs
        )
        where_clauses.append(f"{qec} IN ({entity_placeholders})")

    date_col = column_map.get("date")
    if date_col:
        qdc = _quote_ident(date_col, db_type)
        if body.date_range_start:
            where_clauses.append(f"{qdc} >= '{body.date_range_start.isoformat()}'")
        if body.date_range_end:
            where_clauses.append(f"{qdc} <= '{body.date_range_end.isoformat()}'")

    sql = f"SELECT {', '.join(select_parts)} FROM {qs}.{qt}"
    if where_clauses:
        sql += " WHERE " + " AND ".join(where_clauses)

    # Fetch data
    try:
        df = await conn_instance.fetch_data(query=sql, limit=100000)
    except Exception as exc:
        logger.error("User import fetch failed for data source %s: %s", data_source_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch data from the connector",
        )

    row_count = len(df)
    role_columns = list(column_map.keys())

    # Count entities
    entity_col_name = "entity_id" if "entity_id" in df.columns else None
    entity_count = int(df[entity_col_name].nunique()) if entity_col_name and entity_col_name in df.columns else 0

    # Store in Redis
    dataset_id = str(uuid.uuid4())
    redis_key = f"{_REDIS_DATASET_PREFIX}{dataset_id}"

    try:
        redis = await get_redis()
        if redis:
            df_clean = df.where(df.notna(), other=None)
            await redis.set(redis_key, df_clean.to_json(orient="split", date_format="iso"), ex=_REDIS_DATASET_TTL)

            # Metadata
            meta = {
                "id": dataset_id,
                "tenant_id": tenant_id,
                "name": data_source.name,
                "filename": f"{data_source.name}.connector",
                "redis_key": redis_key,
                "columns": role_columns,
                "row_count": row_count,
                "column_count": len(role_columns),
                "is_active": True,
                "file_type": "connector",
                "uploaded_at": datetime.utcnow().isoformat(),
            }
            await redis.set(
                f"{_REDIS_DATASET_META_PREFIX}{dataset_id}",
                json.dumps(meta, default=str),
                ex=_REDIS_DATASET_TTL,
            )
    except Exception as e:
        logger.warning("Redis storage failed for user import %s: %s", dataset_id, e)

    # Persist Dataset record
    try:
        dataset_record = Dataset(
            id=dataset_id,
            tenant_id=tenant_id,
            name=data_source.name,
            filename=f"{data_source.name}.connector",
            file_size=0,
            file_type="connector",
            row_count=row_count,
            column_count=len(role_columns),
            columns=role_columns,
            redis_key=redis_key,
            uploaded_by=user_id,
            uploaded_at=datetime.utcnow(),
            is_processed=True,
        )
        db.add(dataset_record)

        # Update data source last import info
        data_source.last_imported_at = datetime.utcnow()
        data_source.last_import_row_count = row_count
        data_source.last_dataset_id = dataset_id

        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error("DB persistence failed for user import: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Import data was fetched but could not be saved",
        )

    return WizardImportResponse(
        dataset_id=dataset_id,
        data_source_id=data_source_id,
        row_count=row_count,
        entity_count=entity_count,
        status="completed",
    )
