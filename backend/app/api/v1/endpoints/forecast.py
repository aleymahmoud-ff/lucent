"""
Forecast API Endpoints - Run forecasts and retrieve results
"""
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List

from app.core.deps import get_db, get_current_user
from app.db.redis_client import get_redis
from app.models.user import User
from app.services.forecast_service import ForecastService
from app.schemas.forecast import (
    ForecastMethod, ForecastRequest, BatchForecastRequest,
    ForecastResultResponse, ForecastStatus, MethodInfoResponse, AutoParamsResponse,
    BatchForecastStatusResponse, ForecastPreviewResponse
)
from app.config import settings
from app.core.validators import validate_uuid
from app.core.rate_limit import RateLimitForecast

REDIS_FORECAST_PREFIX = "forecast:"
REDIS_FORECAST_TTL = 3600

router = APIRouter()


# ============================================
# Forecast Methods Info
# ============================================

@router.get("/methods", response_model=List[MethodInfoResponse])
async def get_forecast_methods(
    current_user: User = Depends(get_current_user)
):
    """
    Get available forecasting methods and their descriptions.

    Returns information about ARIMA, ETS, and Prophet methods including
    their capabilities and default settings.
    """
    service = ForecastService(current_user.tenant_id, current_user.id)
    return service.get_available_methods()


# ============================================
# Auto Parameter Detection
# ============================================

@router.post("/auto-params/{method}", response_model=AutoParamsResponse)
async def auto_detect_params(
    method: ForecastMethod,
    dataset_id: str = Query(..., description="Dataset ID"),
    entity_id: str = Query(..., description="Entity ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Auto-detect optimal parameters for a forecasting method.

    Analyzes the time series data and recommends parameters based on
    data characteristics like trend, seasonality, and stationarity.
    """
    service = ForecastService(current_user.tenant_id, current_user.id)

    try:
        result = await service.auto_detect_parameters(method, dataset_id, entity_id)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error detecting parameters: {str(e)}"
        )


# ============================================
# Run Forecast
# ============================================

@router.post("/run", response_model=ForecastResultResponse)
async def run_forecast(
    request: ForecastRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _rate_limit: None = Depends(RateLimitForecast),
):
    """
    Run a forecast for a single entity.

    Dispatches the forecast job to a Celery worker and returns immediately
    with status=PENDING.  The frontend polls GET /forecast/status/{id}
    to track progress and retrieve the completed result.
    """
    # Validate horizon against tenant limits
    max_horizon = settings.DEFAULT_MAX_FORECAST_HORIZON
    if hasattr(current_user, 'tenant') and current_user.tenant:
        limits = getattr(current_user.tenant, 'limits', None)
        if limits and isinstance(limits, dict):
            max_horizon = limits.get('max_forecast_horizon', max_horizon)

    if request.horizon > max_horizon:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Forecast horizon ({request.horizon}) exceeds maximum allowed ({max_horizon} days)"
        )

    # Run forecast inline (no Celery worker required)
    service = ForecastService(current_user.tenant_id, current_user.id, db=db)

    # Create ForecastHistory record for permanent audit trail
    forecast_history_id = None
    try:
        from app.models.forecast_history import ForecastHistory as ForecastHistoryModel, ForecastMethod as FHMethod, ForecastStatus as FHStatus
        history = ForecastHistoryModel(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            dataset_id=request.dataset_id,
            entity_id=request.entity_id,
            method=FHMethod(request.method.value),
            config=request.model_dump(mode='json'),
            status=FHStatus.RUNNING,
            started_at=datetime.utcnow(),
        )
        db.add(history)
        await db.flush()
        forecast_history_id = history.id
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to create ForecastHistory (non-blocking): {e}")

    try:
        result = await service.run_forecast(request, forecast_history_id=forecast_history_id)

        # Update history with completion status
        if forecast_history_id:
            try:
                history.status = FHStatus.COMPLETED if result.status.value == "completed" else FHStatus.FAILED
                history.completed_at = datetime.utcnow()
                if result.metrics:
                    history.mae = result.metrics.mae
                    history.rmse = result.metrics.rmse
                    history.mape = result.metrics.mape
                await db.commit()
            except Exception:
                pass

        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Forecast failed: {str(e)}"
        )


@router.post("/batch", response_model=BatchForecastStatusResponse)
async def run_batch_forecast(
    request: BatchForecastRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _rate_limit: None = Depends(RateLimitForecast),
):
    """
    Run forecasts for multiple entities.

    Dispatches the batch job to a Celery worker and returns immediately
    with status=PENDING.  Poll GET /forecast/status/{id} per entity
    to track individual progress.
    """
    # Validate batch size against tenant limits
    max_entities = 50  # Default
    if hasattr(current_user, 'tenant') and current_user.tenant:
        limits = getattr(current_user.tenant, 'limits', None)
        if limits and isinstance(limits, dict):
            max_entities = limits.get('max_entities_per_batch', max_entities)

    if len(request.entity_ids) > max_entities:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Batch size ({len(request.entity_ids)}) exceeds maximum allowed ({max_entities} entities)"
        )

    # Validate horizon
    max_horizon = settings.DEFAULT_MAX_FORECAST_HORIZON
    if request.horizon > max_horizon:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Forecast horizon ({request.horizon}) exceeds maximum allowed ({max_horizon} days)"
        )

    # Start batch forecast in background (returns immediately)
    service = ForecastService(current_user.tenant_id, current_user.id, db=db)
    try:
        result = await service.start_batch_forecast(request)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch forecast failed: {str(e)}"
        )


# ============================================
# Forecast Status
# ============================================

@router.get("/status/{forecast_id}", response_model=ForecastResultResponse)
async def get_forecast_status(
    forecast_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get the status and results of a forecast.

    Returns the current status (pending, running, completed, failed)
    and results if the forecast has completed.
    """
    validate_uuid(forecast_id, "forecast_id")
    service = ForecastService(current_user.tenant_id, current_user.id)
    result = await service.get_forecast_status(forecast_id)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Forecast not found or expired. Results are stored for 1 hour."
        )

    return result


@router.get("/batch/{batch_id}", response_model=BatchForecastStatusResponse)
async def get_batch_forecast_status(
    batch_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get the status and results of a batch forecast.

    Poll this endpoint after starting a batch forecast to track progress.
    Returns completed/failed counts and individual entity results as they finish.
    """
    validate_uuid(batch_id, "batch_id")
    service = ForecastService(current_user.tenant_id, current_user.id)
    result = await service.get_batch_status(batch_id)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Batch forecast not found or expired. Results are stored for 1 hour."
        )

    return result


# ============================================
# Preview (Quick forecast for visualization)
# ============================================

@router.post("/preview", response_model=ForecastPreviewResponse)
async def preview_forecast(
    request: ForecastRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate a quick preview forecast.

    Uses a limited horizon (max 30 periods) for faster results.
    Useful for quick visualization before running a full forecast.
    """
    # Limit preview horizon
    preview_request = request.model_copy()
    preview_request.horizon = min(request.horizon, 30)

    service = ForecastService(current_user.tenant_id, current_user.id)

    try:
        result = await service.run_forecast(preview_request)

        return ForecastPreviewResponse(
            forecast_id=result.id,
            predictions=result.predictions[:30],  # Limit to 30 points
            metrics=result.metrics,
            status=result.status
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating preview: {str(e)}"
        )
