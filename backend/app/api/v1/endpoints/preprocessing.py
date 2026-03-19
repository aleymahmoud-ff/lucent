"""
Preprocessing API Endpoints - Data cleaning and transformation
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from io import StringIO
import pandas as pd

from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.schemas import MessageResponse
from app.services.preprocessing_service import PreprocessingService
from app.schemas.preprocessing import (
    MissingValuesRequest, DuplicatesRequest, OutlierRequest,
    TimeAggregationRequest, ValueReplacementRequest,
    EntityListResponse, EntityStatsResponse,
    PreprocessingResultResponse, MissingValuesResponse,
    OutliersResponse, DuplicatesResponse, PreprocessedDataResponse,
    ValueReplacementResponse
)
from app.core.validators import validate_uuid

router = APIRouter()


# ============================================
# Entity Operations
# ============================================

@router.get("/{dataset_id}/entities", response_model=EntityListResponse)
async def list_entities(
    dataset_id: str,
    entity_column: Optional[str] = Query(None, description="Column containing entity names"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all entities in a dataset"""
    validate_uuid(dataset_id, "dataset_id")
    service = PreprocessingService(current_user.tenant_id, current_user.id)
    entities, detected_column = await service.get_entities(dataset_id, entity_column)

    return EntityListResponse(
        entities=entities,
        total=len(entities),
        entity_column=detected_column or entity_column
    )


@router.get("/{dataset_id}/regressors")
async def detect_regressors(
    dataset_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Detect available regressor columns in a dataset.

    Returns extra numeric columns beyond the core 4 (Date, Entity_ID, Entity_Name, Volume)
    that can be used as Prophet regressors.
    """
    validate_uuid(dataset_id, "dataset_id")
    service = PreprocessingService(current_user.tenant_id, current_user.id)
    df = await service.get_dataset_dataframe(dataset_id)

    if df is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Core columns that are NOT regressors
    core_patterns = {"date", "entity_id", "entity_name", "volume", "entity", "id", "name"}
    entity_col = service._detect_entity_column(df) if hasattr(service, '_detect_entity_column') else None

    regressors: List[dict] = []
    for col in df.columns:
        if col.lower().replace("_", "") in {p.replace("_", "") for p in core_patterns}:
            continue
        if entity_col and col == entity_col:
            continue

        # Check if column is numeric
        numeric_vals = pd.to_numeric(df[col], errors='coerce')
        valid_ratio = numeric_vals.notna().sum() / len(df) if len(df) > 0 else 0

        if valid_ratio > 0.8:
            unique_vals = numeric_vals.dropna().unique()
            is_binary = set(unique_vals).issubset({0, 1, 0.0, 1.0})
            regressors.append({
                "column": col,
                "type": "binary" if is_binary else "numeric",
                "sample_values": [round(float(v), 2) for v in numeric_vals.dropna().head(5).tolist()],
                "valid_ratio": round(valid_ratio, 2),
            })

    return {"dataset_id": dataset_id, "regressors": regressors, "total": len(regressors)}


@router.get("/{dataset_id}/entity/{entity_id}/stats", response_model=EntityStatsResponse)
async def get_entity_stats(
    dataset_id: str,
    entity_id: str,
    entity_column: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get statistics for a specific entity"""
    validate_uuid(dataset_id, "dataset_id")
    service = PreprocessingService(current_user.tenant_id, current_user.id)
    stats = await service.get_entity_stats(dataset_id, entity_id, entity_column)

    if not stats:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entity not found or dataset unavailable"
        )

    return stats


@router.get("/{dataset_id}/entity/{entity_id}/data", response_model=PreprocessedDataResponse)
async def get_entity_data(
    dataset_id: str,
    entity_id: str,
    entity_column: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get data for a specific entity with pagination"""
    validate_uuid(dataset_id, "dataset_id")
    service = PreprocessingService(current_user.tenant_id, current_user.id)
    result = await service.get_preprocessed_data(
        dataset_id, entity_id, entity_column, page, page_size
    )

    return PreprocessedDataResponse(**result)


# ============================================
# Missing Values
# ============================================

@router.get("/{dataset_id}/missing")
async def analyze_missing_values(
    dataset_id: str,
    entity_id: Optional[str] = Query(None),
    entity_column: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Analyze missing values in dataset or entity"""
    validate_uuid(dataset_id, "dataset_id")
    service = PreprocessingService(current_user.tenant_id, current_user.id)
    result = await service.analyze_missing_values(dataset_id, entity_id, entity_column)
    return result


@router.post("/{dataset_id}/missing", response_model=PreprocessingResultResponse)
async def handle_missing_values(
    dataset_id: str,
    request: MissingValuesRequest,
    entity_id: Optional[str] = Query(None),
    entity_column: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Handle missing values in dataset or entity"""
    validate_uuid(dataset_id, "dataset_id")
    service = PreprocessingService(current_user.tenant_id, current_user.id)
    result = await service.handle_missing_values(
        dataset_id, request, entity_id, entity_column
    )

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.message
        )

    return result


# ============================================
# Duplicates
# ============================================

@router.get("/{dataset_id}/duplicates")
async def analyze_duplicates(
    dataset_id: str,
    entity_id: Optional[str] = Query(None),
    entity_column: Optional[str] = Query(None),
    subset: Optional[str] = Query(None, description="Comma-separated column names"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Analyze duplicates in dataset or entity"""
    validate_uuid(dataset_id, "dataset_id")
    service = PreprocessingService(current_user.tenant_id, current_user.id)
    subset_list = subset.split(",") if subset else None
    result = await service.analyze_duplicates(dataset_id, subset_list, entity_id, entity_column)
    return result


@router.post("/{dataset_id}/duplicates", response_model=PreprocessingResultResponse)
async def handle_duplicates(
    dataset_id: str,
    request: DuplicatesRequest,
    entity_id: Optional[str] = Query(None),
    entity_column: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Handle duplicates in dataset or entity"""
    validate_uuid(dataset_id, "dataset_id")
    service = PreprocessingService(current_user.tenant_id, current_user.id)
    result = await service.handle_duplicates(
        dataset_id, request, entity_id, entity_column
    )

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.message
        )

    return result


# ============================================
# Outliers
# ============================================

@router.get("/{dataset_id}/outliers")
async def detect_outliers(
    dataset_id: str,
    method: str = Query("iqr", description="Detection method: iqr, zscore, percentile"),
    threshold: float = Query(1.5, description="Threshold for detection"),
    entity_id: Optional[str] = Query(None),
    entity_column: Optional[str] = Query(None),
    columns: Optional[str] = Query(None, description="Comma-separated column names"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Detect outliers in dataset or entity"""
    validate_uuid(dataset_id, "dataset_id")
    from app.schemas.preprocessing import OutlierMethod

    service = PreprocessingService(current_user.tenant_id, current_user.id)

    request = OutlierRequest(
        method=OutlierMethod(method),
        threshold=threshold,
        columns=columns.split(",") if columns else None
    )

    result = await service.detect_outliers(dataset_id, request, entity_id, entity_column)
    return result


@router.post("/{dataset_id}/outliers", response_model=PreprocessingResultResponse)
async def handle_outliers(
    dataset_id: str,
    request: OutlierRequest,
    entity_id: Optional[str] = Query(None),
    entity_column: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Handle outliers in dataset or entity"""
    validate_uuid(dataset_id, "dataset_id")
    service = PreprocessingService(current_user.tenant_id, current_user.id)
    result = await service.handle_outliers(
        dataset_id, request, entity_id, entity_column
    )

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.message
        )

    return result


# ============================================
# Time Aggregation
# ============================================

@router.post("/{dataset_id}/aggregate", response_model=PreprocessingResultResponse)
async def aggregate_time(
    dataset_id: str,
    request: TimeAggregationRequest,
    entity_id: Optional[str] = Query(None),
    entity_column: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Aggregate data by time frequency"""
    validate_uuid(dataset_id, "dataset_id")
    service = PreprocessingService(current_user.tenant_id, current_user.id)
    result = await service.aggregate_time(
        dataset_id, request, entity_id, entity_column
    )

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.message
        )

    return result


# ============================================
# Value Replacement
# ============================================

@router.post("/{dataset_id}/replace", response_model=PreprocessingResultResponse)
async def replace_values(
    dataset_id: str,
    request: ValueReplacementRequest,
    entity_id: Optional[str] = Query(None),
    entity_column: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Replace values in a column"""
    validate_uuid(dataset_id, "dataset_id")
    service = PreprocessingService(current_user.tenant_id, current_user.id)
    result = await service.replace_values(
        dataset_id, request, entity_id, entity_column
    )

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.message
        )

    return result


# ============================================
# Reset & Download
# ============================================

@router.post("/{dataset_id}/reset", response_model=MessageResponse)
async def reset_preprocessing(
    dataset_id: str,
    entity_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reset preprocessing to original data"""
    validate_uuid(dataset_id, "dataset_id")
    service = PreprocessingService(current_user.tenant_id, current_user.id)
    success = await service.reset_preprocessing(dataset_id, entity_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reset preprocessing"
        )

    return {"message": "Preprocessing reset to original data"}


@router.get("/{dataset_id}/download")
async def download_preprocessed(
    dataset_id: str,
    entity_id: Optional[str] = Query(None),
    entity_column: Optional[str] = Query(None),
    format: str = Query("csv", description="Download format: csv, xlsx"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Download preprocessed data"""
    validate_uuid(dataset_id, "dataset_id")
    service = PreprocessingService(current_user.tenant_id, current_user.id)

    if entity_id:
        df = await service.get_entity_data(dataset_id, entity_id, entity_column)
    else:
        df = await service.get_dataset_dataframe(dataset_id)

    if df is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )

    if format == "csv":
        output = StringIO()
        df.to_csv(output, index=False)
        output.seek(0)

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=preprocessed_{dataset_id}.csv"}
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV format is currently supported"
        )
