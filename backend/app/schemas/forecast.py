"""
Forecast Schemas - Pydantic models for forecasting operations
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from enum import Enum


# ============================================
# Enums
# ============================================

class ForecastMethod(str, Enum):
    ARIMA = "arima"
    ETS = "ets"
    PROPHET = "prophet"


class ForecastStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ForecastFrequency(str, Enum):
    DAILY = "D"
    WEEKLY = "W"
    MONTHLY = "M"


# ============================================
# Method-Specific Settings
# ============================================

class ARIMASettingsRequest(BaseModel):
    """ARIMA model configuration"""
    auto: bool = True  # Use auto-detection for parameters
    p: Optional[int] = Field(None, ge=0, le=5, description="AR order")
    d: Optional[int] = Field(None, ge=0, le=2, description="Differencing order")
    q: Optional[int] = Field(None, ge=0, le=5, description="MA order")
    P: Optional[int] = Field(None, ge=0, le=3, description="Seasonal AR order")
    D: Optional[int] = Field(None, ge=0, le=2, description="Seasonal differencing order")
    Q: Optional[int] = Field(None, ge=0, le=3, description="Seasonal MA order")
    s: Optional[int] = Field(None, ge=1, description="Seasonal period")


class ETSSettingsRequest(BaseModel):
    """ETS (Exponential Smoothing) model configuration"""
    auto: bool = True  # Use auto-detection
    error: Optional[str] = Field(None, description="Error type: 'add' or 'mul'")
    trend: Optional[str] = Field(None, description="Trend type: 'add', 'mul', or None")
    seasonal: Optional[str] = Field(None, description="Seasonal type: 'add', 'mul', or None")
    seasonal_periods: Optional[int] = Field(None, ge=2, description="Seasonal period length")
    damped_trend: bool = False


class ProphetSettingsRequest(BaseModel):
    """Facebook Prophet model configuration"""
    changepoint_prior_scale: float = Field(0.05, ge=0.001, le=0.5)
    seasonality_prior_scale: float = Field(10.0, ge=0.01, le=100.0)
    seasonality_mode: str = Field("additive", description="'additive' or 'multiplicative'")
    yearly_seasonality: Union[bool, int] = True
    weekly_seasonality: Union[bool, int] = True
    daily_seasonality: Union[bool, int] = False
    holidays_prior_scale: float = Field(10.0, ge=0.01, le=100.0)


class CrossValidationRequest(BaseModel):
    """Cross-validation configuration"""
    enabled: bool = False
    folds: int = Field(5, ge=2, le=10)
    method: str = Field("rolling", description="'rolling' or 'expanding'")
    initial_train_size: float = Field(0.7, ge=0.5, le=0.9)


# ============================================
# Request Schemas
# ============================================

class ForecastRequest(BaseModel):
    """Request to run a single forecast"""
    dataset_id: str
    entity_id: str
    method: ForecastMethod
    horizon: int = Field(30, ge=1, le=365, description="Forecast horizon in periods")
    frequency: ForecastFrequency = ForecastFrequency.DAILY
    confidence_level: float = Field(0.95, ge=0.5, le=0.99, description="Confidence interval level")

    # Method-specific settings (only one should be provided based on method)
    arima_settings: Optional[ARIMASettingsRequest] = None
    ets_settings: Optional[ETSSettingsRequest] = None
    prophet_settings: Optional[ProphetSettingsRequest] = None

    # Cross-validation
    cross_validation: Optional[CrossValidationRequest] = None

    # Column mapping (optional - auto-detected if not provided)
    date_column: Optional[str] = None
    value_column: Optional[str] = None
    entity_column: Optional[str] = None

    # Regressor columns (optional - auto-detected from extra numeric columns if not provided)
    regressor_columns: Optional[List[str]] = None


class BatchForecastRequest(BaseModel):
    """Request to run forecasts for multiple entities"""
    dataset_id: str
    entity_ids: List[str] = Field(..., min_length=1, max_length=50)
    method: ForecastMethod
    horizon: int = Field(30, ge=1, le=365)
    frequency: ForecastFrequency = ForecastFrequency.DAILY
    confidence_level: float = Field(0.95, ge=0.5, le=0.99)

    # Method-specific settings
    arima_settings: Optional[ARIMASettingsRequest] = None
    ets_settings: Optional[ETSSettingsRequest] = None
    prophet_settings: Optional[ProphetSettingsRequest] = None

    # Regressor columns
    regressor_columns: Optional[List[str]] = None


class AutoParamsRequest(BaseModel):
    """Request to auto-detect optimal parameters"""
    dataset_id: str
    entity_id: str
    date_column: Optional[str] = None
    value_column: Optional[str] = None


# ============================================
# Response Schemas
# ============================================

class PredictionResponse(BaseModel):
    """Single prediction point"""
    date: str
    value: float
    lower_bound: float
    upper_bound: float


class MetricsResponse(BaseModel):
    """Forecast accuracy metrics"""
    mae: float = Field(..., description="Mean Absolute Error")
    rmse: float = Field(..., description="Root Mean Square Error")
    mape: float = Field(..., description="Mean Absolute Percentage Error")
    mse: Optional[float] = Field(None, description="Mean Square Error")
    r2: Optional[float] = Field(None, description="R-squared")
    aic: Optional[float] = Field(None, description="Akaike Information Criterion")
    bic: Optional[float] = Field(None, description="Bayesian Information Criterion")


class ModelSummaryResponse(BaseModel):
    """Model summary and parameters"""
    method: str
    parameters: Dict[str, Any]
    coefficients: Optional[Dict[str, float]] = None
    diagnostics: Optional[Dict[str, Any]] = None
    regressors_used: Optional[List[str]] = None


class CrossValidationResultResponse(BaseModel):
    """Cross-validation results"""
    folds: int
    method: str
    metrics_per_fold: List[MetricsResponse]
    average_metrics: MetricsResponse


class ForecastResultResponse(BaseModel):
    """Complete forecast result"""
    model_config = ConfigDict(protected_namespaces=())

    id: str
    dataset_id: str
    entity_id: str
    method: ForecastMethod
    status: ForecastStatus
    progress: int = Field(0, ge=0, le=100)

    # Results (populated when completed)
    predictions: List[PredictionResponse] = []
    metrics: Optional[MetricsResponse] = None
    model_summary: Optional[ModelSummaryResponse] = None
    cv_results: Optional[CrossValidationResultResponse] = None

    # Timestamps
    created_at: datetime
    completed_at: Optional[datetime] = None

    # Error information (populated when failed)
    error: Optional[str] = None


class BatchForecastStatusResponse(BaseModel):
    """Batch forecast status"""
    batch_id: str
    total: int
    completed: int
    failed: int
    in_progress: int
    status: ForecastStatus
    results: List[ForecastResultResponse] = []


class MethodInfoResponse(BaseModel):
    """Information about a forecasting method"""
    id: str
    name: str
    description: str
    supports_seasonality: bool
    supports_exogenous: bool
    default_settings: Dict[str, Any]


class AutoParamsResponse(BaseModel):
    """Auto-detected parameters response"""
    method: ForecastMethod
    recommended_params: Dict[str, Any]
    data_characteristics: Dict[str, Any]


class DataCharacteristics(BaseModel):
    """Time series data characteristics"""
    length: int
    mean: float
    std: float
    min: float
    max: float
    trend: str  # "increasing", "decreasing", "stationary"
    has_missing: bool
    is_stationary: bool
    seasonality_detected: bool
    seasonality_period: Optional[int] = None


class ForecastPreviewResponse(BaseModel):
    """Quick forecast preview response"""
    forecast_id: str
    predictions: List[PredictionResponse]
    metrics: Optional[MetricsResponse] = None
    status: ForecastStatus
