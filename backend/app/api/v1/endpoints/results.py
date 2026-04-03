"""
Results API Endpoints - Retrieve, paginate, download, and export forecast results
"""
import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.core.deps import get_current_user, get_db
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.schemas.forecast import (
    CrossValidationResultResponse,
    ForecastResultResponse,
    ForecastStatus,
    MetricsResponse,
    ModelSummaryResponse,
    PredictionResponse,
)
from app.services.results_service import ResultsService
from app.core.validators import validate_uuid

router = APIRouter()


# ============================================
# Helpers
# ============================================

def _get_service(current_user: User) -> ResultsService:
    return ResultsService(current_user.tenant_id, current_user.id)


async def _require_result(
    forecast_id: str,
    service: ResultsService,
    db: Optional[AsyncSession] = None,
) -> ForecastResultResponse:
    """
    Fetch a forecast result or raise 404.
    Uses two-tier retrieval: Redis first, PostgreSQL fallback.
    """
    validate_uuid(forecast_id, "forecast_id")
    result = await service.get_result(forecast_id, db=db)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"Forecast '{forecast_id}' not found or has expired. "
                "Results are cached for 1 hour after completion."
            ),
        )
    return result


# ============================================
# GET /results/{forecast_id}
# ============================================

@router.get(
    "/{forecast_id}",
    response_model=ForecastResultResponse,
    summary="Get full forecast result",
    description=(
        "Retrieve the complete forecast result from Redis, including predictions, "
        "metrics, model summary, and cross-validation results (if available). "
        "Returns 404 when the result has expired (TTL: 1 hour) or does not exist."
    ),
)
async def get_forecast_result(
    forecast_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = _get_service(current_user)
    return await _require_result(forecast_id, service, db=db)


# ============================================
# GET /results/{forecast_id}/data
# ============================================

class PaginatedPredictionsResponse(dict):
    """Inline schema — returned as a plain dict for simplicity."""


@router.get(
    "/{forecast_id}/data",
    summary="Get paginated predictions",
    description=(
        "Return the forecast predictions in pages. "
        "Use `page` and `page_size` query parameters to navigate."
    ),
)
async def get_forecast_data(
    forecast_id: str,
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(50, ge=1, le=500, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    service = _get_service(current_user)
    result = await _require_result(forecast_id, service, db=db)

    items, total, total_pages, current_page = service.paginate_predictions(
        result.predictions, page, page_size
    )

    return {
        "forecast_id": forecast_id,
        "entity_id": result.entity_id,
        "method": result.method.value,
        "pagination": {
            "page": current_page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": total_pages,
            "has_next": current_page < total_pages,
            "has_prev": current_page > 1,
        },
        "data": [p.model_dump() for p in items],
    }


# ============================================
# GET /results/{forecast_id}/metrics
# ============================================

@router.get(
    "/{forecast_id}/metrics",
    response_model=MetricsResponse,
    summary="Get forecast metrics",
    description=(
        "Return only the accuracy metrics (MAE, RMSE, MAPE, MSE, R², AIC, BIC) "
        "for the specified forecast. Returns 404 if the result is missing, "
        "and 400 if metrics are not available (e.g. forecast still running)."
    ),
)
async def get_forecast_metrics(
    forecast_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = _get_service(current_user)
    result = await _require_result(forecast_id, service, db=db)

    if result.metrics is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Metrics are not available. "
                f"Forecast status is '{result.status.value}'. "
                "Metrics are only present for completed forecasts."
            ),
        )

    return result.metrics


# ============================================
# GET /results/{forecast_id}/summary
# ============================================

@router.get(
    "/{forecast_id}/summary",
    response_model=ModelSummaryResponse,
    summary="Get model summary",
    description=(
        "Return only the model summary (method, parameters, coefficients, diagnostics) "
        "for the specified forecast."
    ),
)
async def get_forecast_summary(
    forecast_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = _get_service(current_user)
    result = await _require_result(forecast_id, service, db=db)

    if result.model_summary is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Model summary is not available. "
                f"Forecast status is '{result.status.value}'. "
                "Model summary is only present for completed forecasts."
            ),
        )

    return result.model_summary


# ============================================
# GET /results/{forecast_id}/cv
# ============================================

@router.get(
    "/{forecast_id}/cv",
    response_model=CrossValidationResultResponse,
    summary="Get cross-validation results",
    description=(
        "Return the cross-validation results for the specified forecast. "
        "Returns 400 when the forecast was run without cross-validation enabled."
    ),
)
async def get_forecast_cv(
    forecast_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = _get_service(current_user)
    result = await _require_result(forecast_id, service, db=db)

    if result.cv_results is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Cross-validation results are not available for this forecast. "
                "Re-run the forecast with cross_validation.enabled=true to generate them."
            ),
        )

    return result.cv_results


# ============================================
# GET /results/download/{forecast_id}
# ============================================

@router.get(
    "/download/{forecast_id}",
    summary="Download predictions as CSV",
    description=(
        "Stream the forecast predictions as a CSV file download. "
        "Columns: date, value, lower_bound, upper_bound."
    ),
    response_class=StreamingResponse,
)
async def download_forecast_csv(
    forecast_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = _get_service(current_user)
    result = await _require_result(forecast_id, service, db=db)

    if result.status != ForecastStatus.COMPLETED or not result.predictions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Cannot download results — forecast is not completed or has no predictions. "
                f"Current status: '{result.status.value}'."
            ),
        )

    csv_content = service.generate_csv(result)
    filename = service.get_csv_filename(result)

    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "text/csv; charset=utf-8",
        },
    )


# ============================================
# POST /results/export/{forecast_id}
# ============================================

@router.post(
    "/export/{forecast_id}",
    summary="Export full report as JSON",
    description=(
        "Generate and return a comprehensive JSON export report that includes "
        "all result data: predictions, metrics, model summary, cross-validation results, "
        "and export metadata."
    ),
)
async def export_forecast_report(
    forecast_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    service = _get_service(current_user)
    result = await _require_result(forecast_id, service, db=db)

    if result.status != ForecastStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Cannot export report — forecast is not completed. "
                f"Current status: '{result.status.value}'."
            ),
        )

    report = service.generate_export_report(result)
    return report
