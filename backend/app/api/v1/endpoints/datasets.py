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
from app.schemas import MessageResponse
from app.config import settings
from app.core.validators import validate_uuid

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
    validate_uuid(dataset_id, "dataset_id")
    service = DatasetService(db, current_user.tenant_id, current_user.id)
    dataset = await service.get_dataset(dataset_id)

    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )

    return DatasetResponse.model_validate(dataset)


@router.delete("/{dataset_id}", response_model=MessageResponse)
async def delete_dataset(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a dataset"""
    validate_uuid(dataset_id, "dataset_id")
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
    validate_uuid(dataset_id, "dataset_id")
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
    validate_uuid(dataset_id, "dataset_id")
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
    validate_uuid(dataset_id, "dataset_id")
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
    validate_uuid(dataset_id, "dataset_id")
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
    validate_uuid(dataset_id, "dataset_id")
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
            description="90 days of sample data for 2 products (180 rows). Ready to forecast.",
            columns=["Date", "Entity_ID", "Entity_Name", "Volume"],
            sample_rows=180
        ),
        TemplateInfo(
            name="Extended Template (with Regressors)",
            description="90 days with Marketing, Weather & Event columns for Prophet regressors (180 rows)",
            columns=["Date", "Entity_ID", "Entity_Name", "Volume", "Marketing_Spend", "Temperature", "Local_Match", "National_Match", "International_Match"],
            sample_rows=180
        ),
        TemplateInfo(
            name="Multi-Entity Template",
            description="90 days of sample data for 3 products (270 rows). Ready for batch forecast.",
            columns=["Date", "Entity_ID", "Entity_Name", "Volume"],
            sample_rows=270
        ),
        TemplateInfo(
            name="Sales Forecast Template",
            description="90 days of sales data for 2 products (180 rows)",
            columns=["Date", "Entity_ID", "Entity_Name", "Volume"],
            sample_rows=180
        ),
    ]
    return templates


@router.get("/templates/download")
async def download_template(
    template_type: str = Query("basic", description="Template type: basic, extended, multi_entity, sales")
):
    """Download a CSV template file.

    All templates use the required column format: Date, Entity_ID, Entity_Name, Volume.
    Templates include 60+ rows per entity so they can be used directly for forecasting.
    The 'extended' template adds optional columns for Prophet regressors.
    """
    from datetime import date, timedelta
    import random

    random.seed(42)  # Reproducible sample data

    # Generate 90 days of dates
    base_date = date(2024, 1, 1)
    dates = [(base_date + timedelta(days=i)).isoformat() for i in range(90)]

    import math

    def _gen_volume(base: int, day: int) -> int:
        """Generate a realistic volume with weekly seasonality and trend."""
        trend = int(day * 0.3)
        weekday = (base_date + timedelta(days=day)).weekday()
        seasonal = int(base * 0.1 * (1 if weekday < 5 else -0.4))
        noise = random.randint(-int(base * 0.05), int(base * 0.05))
        return max(10, base + trend + seasonal + noise)

    def _gen_marketing(base: int) -> int:
        """Generate marketing spend (500-2000)."""
        return random.randint(max(base - 500, 300), base + 500)

    def _gen_temperature(day: int) -> float:
        """Generate temperature with seasonal pattern (like the old R app)."""
        return round(20 + 10 * math.sin(2 * math.pi * day / 365.25) + random.gauss(0, 3), 1)

    def _gen_binary(prob: float) -> int:
        """Generate binary 0/1 with given probability of 1."""
        return 1 if random.random() < prob else 0

    # Build template data
    entities = {
        "basic": [("PRD-001", "Product A", 100), ("PRD-002", "Product B", 150)],
        "extended": [("PRD-001", "Product A", 100), ("PRD-002", "Product B", 150)],
        "multi_entity": [("SKU-001", "Widget A", 100), ("SKU-002", "Widget B", 150), ("SKU-003", "Gadget X", 200)],
        "sales": [("WGT-A", "Widget A", 1000), ("WGT-B", "Widget B", 1500)],
    }

    filenames = {
        "basic": "lucent_forecast_template.csv",
        "extended": "lucent_extended_template.csv",
        "multi_entity": "lucent_multi_entity_template.csv",
        "sales": "lucent_sales_template.csv",
    }

    if template_type not in entities:
        template_type = "basic"

    is_extended = template_type == "extended"
    columns = ["Date", "Entity_ID", "Entity_Name", "Volume"]
    if is_extended:
        columns += ["Marketing_Spend", "Temperature", "Local_Match", "National_Match", "International_Match"]

    # Marketing spend base per entity (for extended template)
    marketing_bases = {"PRD-001": 1500, "PRD-002": 1000}

    rows = []
    for day_i, dt in enumerate(dates):
        for eid, ename, base_vol in entities[template_type]:
            row = [dt, eid, ename, _gen_volume(base_vol, day_i)]
            if is_extended:
                row.append(_gen_marketing(marketing_bases.get(eid, 1200)))
                row.append(_gen_temperature(day_i))
                row.append(_gen_binary(0.10))   # Local_Match ~10%
                row.append(_gen_binary(0.05))   # National_Match ~5%
                row.append(_gen_binary(0.02))   # International_Match ~2%
            rows.append(row)

    # Create CSV in memory with BOM for Excel Arabic support
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(columns)
    writer.writerows(rows)

    content = output.getvalue().encode("utf-8-sig")
    return StreamingResponse(
        BytesIO(content),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filenames[template_type]}"
        }
    )
