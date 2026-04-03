"""
ConnectorDataSource Schemas - Pydantic models for saved connector import configurations.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime


# ============================================
# Create
# ============================================

class ConnectorDataSourceCreate(BaseModel):
    """Payload received from the connector import wizard to save a new configuration."""
    connector_id: str = Field(..., description="ID of the parent connector")
    name: str = Field(..., min_length=1, max_length=255, description="User-friendly label for this import config")
    source_table: str = Field(..., min_length=1, max_length=500, description="Remote table or view name, e.g. 'dbo.DailySales'")
    column_map: Dict[str, str] = Field(
        ...,
        description=(
            "Mapping from LUCENT column roles to remote column names. "
            "Required keys: 'date', 'entity_id', 'volume'. "
            "Optional keys: 'entity_name'. "
            "Example: {\"date\": \"sale_date\", \"entity_id\": \"store_id\", \"volume\": \"quantity_sold\"}"
        ),
    )
    date_range_start: Optional[datetime] = None
    date_range_end: Optional[datetime] = None
    selected_entity_ids: Optional[List[str]] = Field(
        default_factory=list,
        description="Subset of entity IDs to import. Empty list means import all entities.",
    )

    @field_validator("column_map")
    @classmethod
    def validate_required_columns(cls, v: dict) -> dict:
        required = {"date", "entity_id", "volume"}
        missing = required - v.keys()
        if missing:
            raise ValueError(f"column_map missing required keys: {missing}")
        return v


# ============================================
# Update
# ============================================

class ConnectorDataSourceUpdate(BaseModel):
    """Partial update for a saved import configuration. All fields are optional."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    source_table: Optional[str] = Field(None, min_length=1, max_length=500)
    column_map: Optional[Dict[str, str]] = None
    date_range_start: Optional[datetime] = None
    date_range_end: Optional[datetime] = None
    selected_entity_ids: Optional[List[str]] = None
    is_active: Optional[bool] = None


# ============================================
# Response
# ============================================

class ConnectorDataSourceResponse(BaseModel):
    """Full API response for a saved import configuration."""
    id: str
    tenant_id: str
    connector_id: str
    name: str
    source_table: str
    column_map: Dict[str, Any]
    date_range_start: Optional[datetime] = None
    date_range_end: Optional[datetime] = None
    selected_entity_ids: List[str] = []
    last_imported_at: Optional[datetime] = None
    last_import_row_count: Optional[int] = None
    last_dataset_id: Optional[str] = None
    is_active: bool
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConnectorDataSourceListResponse(BaseModel):
    """Paginated list of saved import configurations."""
    data_sources: List[ConnectorDataSourceResponse]
    total: int
