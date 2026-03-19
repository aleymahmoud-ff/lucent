"""
Diagnostics API Endpoints - Forecast residual analysis, model parameters,
seasonality decomposition, quality indicators, and model comparison.
"""
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.diagnostics import (
    DiagnosticsFullResponse,
    ModelComparisonRequest,
    ModelComparisonResponse,
    ModelParametersResponse,
    QualityIndicatorsResponse,
    ResidualAnalysisResponse,
    SeasonalityAnalysisResponse,
)
from app.services.diagnostics_service import DiagnosticsService
from app.core.validators import validate_uuid

router = APIRouter()


# ============================================
# Helpers
# ============================================

def _get_service(current_user: User) -> DiagnosticsService:
    return DiagnosticsService(current_user.tenant_id, current_user.id)


async def _require_result_exists(
    forecast_id: str,
    service: DiagnosticsService,
) -> None:
    """
    Verify that the forecast result exists in Redis.
    Raises 404 when the key is missing or has expired.
    """
    validate_uuid(forecast_id, "forecast_id")
    result = await service._fetch_result(forecast_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"Forecast '{forecast_id}' not found or has expired. "
                "Results are cached for 1 hour after completion."
            ),
        )
    from app.schemas.forecast import ForecastStatus
    if result.status != ForecastStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Diagnostics are only available for completed forecasts. "
                f"Current status: '{result.status.value}'."
            ),
        )


# ============================================
# GET /diagnostics/{forecast_id}
# ============================================

@router.get(
    "/{forecast_id}",
    response_model=DiagnosticsFullResponse,
    summary="Get full diagnostics",
    description=(
        "Return all diagnostic sub-analyses in a single response: residual analysis, "
        "model parameters, seasonality decomposition, and quality indicators. "
        "Sub-analyses that cannot be computed are returned as null. "
        "Returns 404 when the forecast is missing or expired, "
        "and 400 when the forecast has not completed."
    ),
)
async def get_full_diagnostics(
    forecast_id: str,
    current_user: User = Depends(get_current_user),
) -> DiagnosticsFullResponse:
    service = _get_service(current_user)
    await _require_result_exists(forecast_id, service)

    result = await service.get_full_diagnostics(forecast_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Forecast '{forecast_id}' not found or has expired.",
        )
    return result


# ============================================
# GET /diagnostics/{forecast_id}/residuals
# ============================================

@router.get(
    "/{forecast_id}/residuals",
    response_model=ResidualAnalysisResponse,
    summary="Get residual analysis",
    description=(
        "Compute and return residual diagnostics: raw residuals, ACF/PACF (20 lags), "
        "Ljung-Box test for autocorrelation, Jarque-Bera normality test, "
        "and a white-noise verdict. "
        "Returns 400 when residual data is not available for this forecast."
    ),
)
async def get_residual_analysis(
    forecast_id: str,
    current_user: User = Depends(get_current_user),
) -> ResidualAnalysisResponse:
    service = _get_service(current_user)
    await _require_result_exists(forecast_id, service)

    result = await service.get_residual_analysis(forecast_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Residual analysis is not available for this forecast. "
                "The model summary may not contain residual information."
            ),
        )
    return result


# ============================================
# GET /diagnostics/{forecast_id}/parameters
# ============================================

@router.get(
    "/{forecast_id}/parameters",
    response_model=ModelParametersResponse,
    summary="Get model parameters",
    description=(
        "Return the fitted model parameters, coefficients (if available), "
        "and information criteria (AIC, BIC). "
        "Returns 400 when the model summary is not present."
    ),
)
async def get_model_parameters(
    forecast_id: str,
    current_user: User = Depends(get_current_user),
) -> ModelParametersResponse:
    service = _get_service(current_user)
    await _require_result_exists(forecast_id, service)

    result = await service.get_model_parameters(forecast_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Model parameters are not available for this forecast. "
                "The model summary is missing."
            ),
        )
    return result


# ============================================
# GET /diagnostics/{forecast_id}/seasonality
# ============================================

@router.get(
    "/{forecast_id}/seasonality",
    response_model=SeasonalityAnalysisResponse,
    summary="Get seasonality analysis",
    description=(
        "Detect the dominant seasonal period and compute trend/seasonal strength "
        "via STL decomposition (when sufficient data is available). "
        "Returns 400 when prediction data is not present."
    ),
)
async def get_seasonality_analysis(
    forecast_id: str,
    current_user: User = Depends(get_current_user),
) -> SeasonalityAnalysisResponse:
    service = _get_service(current_user)
    await _require_result_exists(forecast_id, service)

    result = await service.get_seasonality_analysis(forecast_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Seasonality analysis is not available for this forecast. "
                "No prediction data found."
            ),
        )
    return result


# ============================================
# GET /diagnostics/{forecast_id}/quality
# ============================================

@router.get(
    "/{forecast_id}/quality",
    response_model=QualityIndicatorsResponse,
    summary="Get quality indicators",
    description=(
        "Return four composite quality scores (0–100): "
        "accuracy (from MAPE), stability (residual variation), "
        "reliability (Ljung-Box test), and coverage (prediction interval width). "
        "Returns 400 when quality cannot be computed."
    ),
)
async def get_quality_indicators(
    forecast_id: str,
    current_user: User = Depends(get_current_user),
) -> QualityIndicatorsResponse:
    service = _get_service(current_user)
    await _require_result_exists(forecast_id, service)

    result = await service.get_quality_indicators(forecast_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Quality indicators could not be computed for this forecast. "
                "Metrics or prediction data may be missing."
            ),
        )
    return result


# ============================================
# POST /diagnostics/compare
# ============================================

@router.post(
    "/compare",
    response_model=ModelComparisonResponse,
    summary="Compare multiple forecast models",
    description=(
        "Fetch 2–5 forecast results by ID, compute quality scores for each, "
        "and return a ranked comparison. "
        "The best model is selected by composite score "
        "(0.4×accuracy + 0.3×reliability + 0.2×stability + 0.1×coverage). "
        "Forecasts that are not found or have not completed are silently skipped."
    ),
)
async def compare_models(
    body: ModelComparisonRequest,
    current_user: User = Depends(get_current_user),
) -> ModelComparisonResponse:
    service = _get_service(current_user)
    result = await service.compare_models(body.forecast_ids)

    if not result.models:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "None of the provided forecast IDs could be found or have completed. "
                "Ensure the forecasts exist and have finished running."
            ),
        )

    return result
