"""
Preprocessing API Endpoints - Data cleaning and transformation
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from io import StringIO
import pandas as pd

from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.services.preprocessing_service import PreprocessingService
from app.schemas.preprocessing import (
    MissingValuesRequest, DuplicatesRequest, OutlierRequest,
    TimeAggregationRequest, ValueReplacementRequest,
    EntityListResponse, EntityStatsResponse,
    PreprocessingResultResponse, MissingValuesResponse,
    OutliersResponse, DuplicatesResponse, PreprocessedDataResponse,
    ValueReplacementResponse
)

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
    service = PreprocessingService(current_user.tenant_id, current_user.id)
    entities, detected_column = await service.get_entities(dataset_id, entity_column)

    return EntityListResponse(
        entities=entities,
        total=len(entities),
        entity_column=detected_column or entity_column
    )


@router.get("/{dataset_id}/entity/{entity_id}/stats", response_model=EntityStatsResponse)
async def get_entity_stats(
    dataset_id: str,
    entity_id: str,
    entity_column: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get statistics for a specific entity"""
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

@router.post("/{dataset_id}/reset")
async def reset_preprocessing(
    dataset_id: str,
    entity_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reset preprocessing to original data"""
    service = PreprocessingService(current_user.tenant_id, current_user.id)
    success = await service.reset_preprocessing(dataset_id, entity_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reset preprocessing"
        )

    return {"success": True, "message": "Preprocessing reset to original data"}


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
