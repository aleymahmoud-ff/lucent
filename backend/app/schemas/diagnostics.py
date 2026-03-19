"""
Diagnostics Schemas - Pydantic models for forecast diagnostic analysis
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


# ============================================
# Residual Analysis
# ============================================

class ResidualAnalysisResponse(BaseModel):
    """Residual diagnostics — randomness and distribution of forecast errors"""
    residuals: List[float]
    residual_mean: float
    residual_std: float
    acf: List[float]            # autocorrelation values for 20 lags
    pacf: List[float]           # partial autocorrelation values for 20 lags
    acf_confidence: float       # confidence band value: 1.96 / sqrt(n)
    ljung_box: Dict[str, float]  # {"statistic": float, "p_value": float}
    jarque_bera: Dict[str, float]  # {"statistic": float, "p_value": float}
    is_white_noise: bool        # True when ljung_box p_value > 0.05


# ============================================
# Model Parameters
# ============================================

class ModelParametersResponse(BaseModel):
    """Extracted model parameters and information criteria"""
    method: str
    parameters: Dict[str, Any]
    coefficients: Optional[Dict[str, Any]] = None
    standard_errors: Optional[Dict[str, Any]] = None
    aic: Optional[float] = None
    bic: Optional[float] = None


# ============================================
# Seasonality Analysis
# ============================================

class SeasonalityAnalysisResponse(BaseModel):
    """Seasonal and trend decomposition results"""
    seasonal_strength: Optional[float] = None   # 0.0 to 1.0
    trend_strength: Optional[float] = None      # 0.0 to 1.0
    detected_period: Optional[int] = None
    seasonal_component: Optional[List[float]] = None  # decomposed seasonal values


# ============================================
# Quality Indicators
# ============================================

class QualityIndicatorsResponse(BaseModel):
    """Composite quality scores for the forecast (0-100 scale)"""
    accuracy: float     # based on MAPE (MAPE < 10% = 100)
    stability: float    # based on coefficient of variation of residuals
    reliability: float  # based on Ljung-Box p-value
    coverage: float     # based on % of actuals within prediction intervals


# ============================================
# Model Comparison
# ============================================

class ModelComparisonRequest(BaseModel):
    """Request to compare multiple forecasts side-by-side"""
    forecast_ids: List[str] = Field(..., min_length=2, max_length=5)


class ModelComparisonResponse(BaseModel):
    """Ranked comparison of multiple forecast models"""
    models: List[Dict[str, Any]]  # [{forecast_id, method, entity_id, metrics, quality}]
    best_model: str               # forecast_id of the best overall model


# ============================================
# Full Diagnostics
# ============================================

class DiagnosticsFullResponse(BaseModel):
    """Complete diagnostics bundle for a single forecast"""
    forecast_id: str
    entity_id: str
    method: str
    residual_analysis: Optional[ResidualAnalysisResponse] = None
    model_parameters: Optional[ModelParametersResponse] = None
    seasonality: Optional[SeasonalityAnalysisResponse] = None
    quality_indicators: Optional[QualityIndicatorsResponse] = None
