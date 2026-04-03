"""
ConnectorWizard Schemas - Pydantic models for each step of the connector import wizard.

Wizard flow:
  1. List available tables        → WizardTableResponse
  2. Inspect columns              → WizardColumnsRequest  → WizardColumnResponse
  3. Preview sample rows          → WizardPreviewRequest  → ConnectorFetchResponse (reused)
  4. Detect date range            → WizardDateRangeRequest → WizardDateRangeResponse
  5. List distinct entities       → WizardEntitiesRequest → WizardEntityResponse
  6. Confirm + trigger import     → WizardImportRequest   → WizardImportResponse
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# ============================================
# Step 2 — Column inspection
# ============================================

class WizardColumnsRequest(BaseModel):
    """Request the column schema for a specific table."""
    table: str = Field(..., min_length=1, max_length=500, description="Fully qualified table name, e.g. 'dbo.DailySales'")


# ============================================
# Step 3 — Preview rows
# ============================================

class WizardPreviewRequest(BaseModel):
    """Request a sample of rows from a table using a proposed column map."""
    table: str = Field(..., min_length=1, max_length=500)
    column_map: Dict[str, str] = Field(
        ...,
        description="Mapping from LUCENT roles to remote column names used to shape the preview.",
    )
    limit: int = Field(100, ge=1, le=1000, description="Maximum number of rows to return")


# ============================================
# Step 4 — Date range detection
# ============================================

class WizardDateRangeRequest(BaseModel):
    """Request the MIN/MAX date range for a table's date column."""
    table: str = Field(..., min_length=1, max_length=500)
    date_column: str = Field(..., min_length=1, max_length=255, description="Name of the date column in the remote table")


# ============================================
# Step 5 — Entity discovery
# ============================================

class WizardEntitiesRequest(BaseModel):
    """Request the distinct entities available in a table."""
    table: str = Field(..., min_length=1, max_length=500)
    entity_id_column: str = Field(..., min_length=1, max_length=255, description="Column containing the entity identifier")
    entity_name_column: Optional[str] = Field(
        None, max_length=255,
        description="Column containing a human-readable entity name (optional)",
    )


# ============================================
# Step 6 — Import
# ============================================

class WizardImportRequest(BaseModel):
    """Trigger the import and optionally save the configuration for future re-use."""
    table: str = Field(..., min_length=1, max_length=500)
    column_map: Dict[str, str] = Field(
        ...,
        description="Mapping from LUCENT roles to remote column names.",
    )
    date_range_start: Optional[datetime] = Field(
        None,
        description="ISO 8601 date for the start of the import window, inclusive.",
    )
    date_range_end: Optional[datetime] = Field(
        None,
        description="ISO 8601 date for the end of the import window, inclusive.",
    )
    entity_ids: Optional[List[str]] = Field(
        None,
        description="Subset of entity IDs to import. Omit or pass null to import all entities.",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="User-friendly name for the saved data source configuration.",
    )


# ============================================
# Response — Step 1 (table listing)
# ============================================

class WizardTableResponse(BaseModel):
    """Metadata for a single table/view returned by the table-listing step."""
    name: str = Field(..., description="Fully qualified table name, e.g. 'dbo.DailySales'")
    row_count: Optional[int] = Field(None, description="Approximate row count if available from statistics")
    schema_name: str = Field(..., description="Schema the table belongs to, e.g. 'dbo'")


# ============================================
# Response — Step 2 (column inspection)
# ============================================

class WizardColumnResponse(BaseModel):
    """Metadata for a single column returned by the column-inspection step."""
    name: str = Field(..., description="Column name as it appears in the remote table")
    type: str = Field(..., description="Data type string as reported by the connector, e.g. 'varchar', 'datetime2'")
    nullable: bool = Field(..., description="Whether the column allows NULL values")
    sample: Optional[str] = Field(None, description="A representative sample value cast to string, or null if the column is empty")


# ============================================
# Response — Step 4 (date range)
# ============================================

class WizardDateRangeResponse(BaseModel):
    """MIN/MAX date range and total row count for the selected table."""
    min_date: Optional[str] = Field(None, description="Earliest date value as ISO 8601 string")
    max_date: Optional[str] = Field(None, description="Latest date value as ISO 8601 string")
    total_rows: int = Field(..., description="Total number of rows in the table (unfiltered)")


# ============================================
# Response — Step 5 (entity listing)
# ============================================

class WizardEntityResponse(BaseModel):
    """A single entity returned by the entity-discovery step."""
    id: str = Field(..., description="Entity identifier value (from entity_id_column)")
    name: Optional[str] = Field(None, description="Human-readable entity name if entity_name_column was provided")
    count: int = Field(..., description="Number of rows associated with this entity")


# ============================================
# Response — Step 6 (import result)
# ============================================

class WizardImportResponse(BaseModel):
    """Summary of a completed import triggered from the wizard."""
    dataset_id: str = Field(..., description="ID of the Dataset record created in LUCENT")
    data_source_id: str = Field(..., description="ID of the ConnectorDataSource record saved for future re-use")
    row_count: int = Field(..., description="Total rows imported")
    entity_count: int = Field(..., description="Number of distinct entities imported")
    status: str = Field(..., description="Import status: 'completed' or 'failed'")


# ============================================
# Step 5 (Admin Setup) — NEW two-role flow
# ============================================

class WizardSetupRequest(BaseModel):
    """Admin confirms the data source setup: saves recipe + extracts all entities + auto-creates RLS."""
    table: str = Field(..., min_length=1, max_length=500)
    column_map: Dict[str, str] = Field(
        ...,
        description="Mapping from LUCENT roles to remote column names.",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="User-friendly name for the saved data source configuration.",
    )


class WizardSetupResponse(BaseModel):
    """Result of admin setup: saved recipe + all extracted entities + RLS column."""
    data_source_id: str = Field(..., description="ID of the ConnectorDataSource record")
    entities: List[WizardEntityResponse] = Field(..., description="All unique entities extracted from the data")
    rls_column: str = Field(..., description="The remote column name set as RLS filter (from entity_id mapping)")
    entity_count: int = Field(..., description="Total number of distinct entities")


# ============================================
# User Data Access — NEW two-role flow
# ============================================

class UserImportRequest(BaseModel):
    """User imports data filtered by their RLS-allowed entities + date range."""
    date_range_start: Optional[datetime] = Field(None, description="Start of date range filter")
    date_range_end: Optional[datetime] = Field(None, description="End of date range filter")
