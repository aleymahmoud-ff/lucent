"""
Datasets API Endpoints - File upload, preview, and statistics
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from io import BytesIO, StringIO
import csv
import logging

from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.services.dataset_service import DatasetService
from app.schemas.datasets import (
    DatasetResponse, DatasetListResponse, DataPreviewResponse,
    DataSummaryResponse, DataStructureResponse, UploadResponse,
    SampleDataRequest, SampleDataResponse, ColumnMappingRequest,
    ColumnMappingResponse, TemplateInfo
)
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================
# File Upload
# ============================================

@router.post("/upload", response_model=UploadResponse)
async def upload_dataset(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload a CSV or Excel file for analysis.

    Supported formats: .csv, .xlsx, .xls
    """
    # Validate file type
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided"
        )

    filename_lower = file.filename.lower()
    if not any(filename_lower.endswith(ext) for ext in [".csv", ".xlsx", ".xls"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Supported formats: CSV, XLSX, XLS"
        )

    # Check file size
    content = await file.read()
    file_size_mb = len(content) / (1024 * 1024)

    # Get tenant limits
    max_size = settings.MAX_UPLOAD_SIZE_MB
    if current_user.tenant and current_user.tenant.limits:
        max_size = current_user.tenant.limits.get("max_file_size_mb", max_size)

    if file_size_mb > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size: {max_size}MB"
        )

    # Process upload
    try:
        service = DatasetService(db, current_user.tenant_id, current_user.id)
        dataset = await service.upload_file(
            file_content=content,
            filename=file.filename,
            content_type=file.content_type or ""
        )

        return UploadResponse(
            id=dataset.id,
            name=dataset.name,
            filename=dataset.filename,
            file_size=dataset.file_size,
            file_type=dataset.file_type,
            row_count=dataset.row_count or 0,
            column_count=dataset.column_count or 0,
            columns=dataset.columns or [],
            message="File uploaded and processed successfully"
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error uploading file: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while processing the file"
        )


# ============================================
# Sample Data
# ============================================

@router.post("/sample", response_model=SampleDataResponse)
async def load_sample_data(
    request: SampleDataRequest = SampleDataRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Load sample dataset for testing/demo purposes.

    Sample types:
    - default: General forecast data
    - sales: Product sales data
    - energy: Energy consumption data
    - stock: Stock price data
    """
    try:
        service = DatasetService(db, current_user.tenant_id, current_user.id)
        dataset = await service.load_sample_data(request.sample_type)

        return SampleDataResponse(
            id=dataset.id,
            name=dataset.name,
            filename=dataset.filename,
            row_count=dataset.row_count or 0,
            column_count=dataset.column_count or 0,
            entities=dataset.entities or [],
            message="Sample data loaded successfully"
        )

    except Exception as e:
        logger.error(f"Error loading sample data: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while loading sample data"
        )


# ============================================
# List & Get Datasets
# ============================================

@router.get("", response_model=DatasetListResponse)
async def list_datasets(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all datasets for the current tenant"""
    service = DatasetService(db, current_user.tenant_id, current_user.id)
    datasets, total = await service.list_datasets(skip=skip, limit=limit, search=search)

    return DatasetListResponse(
        datasets=[DatasetResponse.model_validate(d) for d in datasets],
        total=total
    )


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific dataset by ID"""
    service = DatasetService(db, current_user.tenant_id, current_user.id)
    dataset = await service.get_dataset(dataset_id)

    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )

    return DatasetResponse.model_validate(dataset)


@router.delete("/{dataset_id}")
async def delete_dataset(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a dataset"""
    service = DatasetService(db, current_user.tenant_id, current_user.id)
    success = await service.delete_dataset(dataset_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )

    return {"message": "Dataset deleted successfully"}


# ============================================
# Data Preview
# ============================================

@router.get("/{dataset_id}/preview", response_model=DataPreviewResponse)
async def get_dataset_preview(
    dataset_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get paginated data preview"""
    service = DatasetService(db, current_user.tenant_id, current_user.id)

    try:
        preview = await service.get_preview(dataset_id, page=page, page_size=page_size)
        return preview
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


# ============================================
# Data Summary & Statistics
# ============================================

@router.get("/{dataset_id}/summary", response_model=DataSummaryResponse)
async def get_dataset_summary(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed summary statistics for a dataset"""
    service = DatasetService(db, current_user.tenant_id, current_user.id)

    try:
        summary = await service.get_summary(dataset_id)
        return summary
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.get("/{dataset_id}/structure", response_model=DataStructureResponse)
async def get_dataset_structure(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get data structure analysis with column info"""
    service = DatasetService(db, current_user.tenant_id, current_user.id)

    try:
        structure = await service.get_structure(dataset_id)
        return structure
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.get("/{dataset_id}/missing")
async def get_missing_values(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get missing values analysis"""
    service = DatasetService(db, current_user.tenant_id, current_user.id)

    try:
        missing = await service.get_missing_values(dataset_id)
        return missing
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


# ============================================
# Column Mapping
# ============================================

@router.put("/{dataset_id}/columns", response_model=ColumnMappingResponse)
async def update_column_mapping(
    dataset_id: str,
    mapping: ColumnMappingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update column mapping for a dataset"""
    service = DatasetService(db, current_user.tenant_id, current_user.id)

    try:
        dataset = await service.update_column_mapping(
            dataset_id=dataset_id,
            date_column=mapping.date_column,
            value_column=mapping.value_column,
            entity_column=mapping.entity_column
        )

        return ColumnMappingResponse(
            id=dataset.id,
            date_column=dataset.date_column or "",
            entity_column=dataset.entity_column,
            value_column=dataset.value_column or "",
            entities=dataset.entities or [],
            date_range=dataset.date_range or {}
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


# ============================================
# Templates
# ============================================

@router.get("/templates/info", response_model=List[TemplateInfo])
async def get_templates():
    """Get available template information.

    All templates use the required column format: Date, Entity_ID, Entity_Name, Volume
    """
    templates = [
        TemplateInfo(
            name="Standard Forecast Template",
            description="Required format: Date, Entity_ID, Entity_Name, Volume",
            columns=["Date", "Entity_ID", "Entity_Name", "Volume"],
            sample_rows=4
        ),
        TemplateInfo(
            name="Sales Forecast Template",
            description="Sales data with required columns",
            columns=["Date", "Entity_ID", "Entity_Name", "Volume"],
            sample_rows=4
        ),
        TemplateInfo(
            name="Energy Forecast Template",
            description="Energy consumption data with required columns",
            columns=["Date", "Entity_ID", "Entity_Name", "Volume"],
            sample_rows=4
        ),
    ]
    return templates


@router.get("/templates/download")
async def download_template(
    template_type: str = Query("basic", description="Template type: basic, multi_entity, sales")
):
    """Download a CSV template file.

    All templates use the required column format: Date, Entity_ID, Entity_Name, Volume
    """
    # All templates use the required columns: Date, Entity_ID, Entity_Name, Volume
    templates = {
        "basic": {
            "filename": "lucent_forecast_template.csv",
            "columns": ["Date", "Entity_ID", "Entity_Name", "Volume"],
            "data": [
                ["2024-01-01", "PRD-001", "Product A", 100],
                ["2024-01-01", "PRD-002", "Product B", 150],
                ["2024-01-02", "PRD-001", "Product A", 105],
                ["2024-01-02", "PRD-002", "Product B", 145],
                ["2024-01-03", "PRD-001", "Product A", 98],
                ["2024-01-03", "PRD-002", "Product B", 160],
            ]
        },
        "multi_entity": {
            "filename": "lucent_multi_entity_template.csv",
            "columns": ["Date", "Entity_ID", "Entity_Name", "Volume"],
            "data": [
                ["2024-01-01", "SKU-001", "Widget A", 100],
                ["2024-01-01", "SKU-002", "Widget B", 150],
                ["2024-01-01", "SKU-003", "Gadget X", 200],
                ["2024-01-02", "SKU-001", "Widget A", 105],
                ["2024-01-02", "SKU-002", "Widget B", 145],
                ["2024-01-02", "SKU-003", "Gadget X", 210],
            ]
        },
        "sales": {
            "filename": "lucent_sales_template.csv",
            "columns": ["Date", "Entity_ID", "Entity_Name", "Volume"],
            "data": [
                ["2024-01-01", "WGT-A", "Widget A", 1000],
                ["2024-01-01", "WGT-B", "Widget B", 1500],
                ["2024-01-02", "WGT-A", "Widget A", 1050],
                ["2024-01-02", "WGT-B", "Widget B", 1480],
                ["2024-01-03", "WGT-A", "Widget A", 980],
                ["2024-01-03", "WGT-B", "Widget B", 1520],
            ]
        }
    }

    template = templates.get(template_type, templates["basic"])

    # Create CSV in memory
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(template["columns"])
    writer.writerows(template["data"])

    # Return as downloadable file
    content = output.getvalue().encode("utf-8")
    return StreamingResponse(
        BytesIO(content),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={template['filename']}"
        }
    )
