"""
Forecast Service - Forecasting operations and result management
"""
import pandas as pd
import numpy as np
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
import json
import uuid
import logging

from app.db.redis_client import get_redis
from app.services.preprocessing_service import PreprocessingService
from app.schemas.forecast import (
    ForecastMethod, ForecastStatus, ForecastFrequency,
    ForecastRequest, BatchForecastRequest,
    ForecastResultResponse, MetricsResponse, ModelSummaryResponse,
    PredictionResponse, MethodInfoResponse, AutoParamsResponse,
    DataCharacteristics, BatchForecastStatusResponse
)
from app.forecasting import ARIMAForecaster, ETSForecaster, ProphetForecaster

logger = logging.getLogger(__name__)

# Redis configuration
REDIS_FORECAST_PREFIX = "forecast:"
REDIS_FORECAST_TTL = 3600  # 1 hour


class ForecastService:
    """Service for running forecasts and managing results"""

    def __init__(self, tenant_id: str, user_id: Optional[str] = None):
        self.tenant_id = tenant_id
        self.user_id = user_id
        self.preprocessing_service = PreprocessingService(tenant_id, user_id)

    # ============================================
    # Data Preparation
    # ============================================

    async def _get_forecast_data(
        self,
        dataset_id: str,
        entity_id: str,
        date_column: Optional[str] = None,
        value_column: Optional[str] = None,
        entity_column: Optional[str] = None
    ) -> Tuple[Optional[pd.Series], Optional[str]]:
        """
        Get time series data for forecasting.
        Falls back to raw data if no preprocessing exists.
        """
        try:
            # Get data - preprocessing service already handles fallback to raw data
            if entity_id and entity_id != "All Data":
                df = await self.preprocessing_service.get_entity_data(
                    dataset_id, entity_id, entity_column
                )
            else:
                df = await self.preprocessing_service.get_dataset_dataframe(dataset_id)

            if df is None:
                return None, "Dataset not found or expired"

            if len(df) == 0:
                return None, "Dataset is empty"

            # Auto-detect columns if not specified
            if not date_column:
                date_column = self._detect_date_column(df)
            if not value_column:
                value_column = self._detect_value_column(df)

            if not date_column:
                return None, "Could not detect date column. Please specify date_column."
            if not value_column:
                return None, "Could not detect value column. Please specify value_column."

            if date_column not in df.columns:
                return None, f"Date column '{date_column}' not found in dataset"
            if value_column not in df.columns:
                return None, f"Value column '{value_column}' not found in dataset"

            # Prepare time series
            df[date_column] = pd.to_datetime(df[date_column], errors='coerce')
            df = df.dropna(subset=[date_column, value_column])
            df = df.sort_values(date_column)

            # Convert value column to numeric
            df[value_column] = pd.to_numeric(df[value_column], errors='coerce')
            df = df.dropna(subset=[value_column])

            if len(df) < 10:
                return None, f"Insufficient data points ({len(df)}). Need at least 10 observations."

            # Create series with date index
            series = pd.Series(
                df[value_column].values,
                index=pd.DatetimeIndex(df[date_column]),
                name=value_column
            )

            return series, None

        except Exception as e:
            logger.error(f"Error preparing forecast data: {e}")
            return None, str(e)

    # ============================================
    # Forecast Execution
    # ============================================

    async def run_forecast(self, request: ForecastRequest) -> ForecastResultResponse:
        """Run a single forecast"""
        forecast_id = str(uuid.uuid4())

        # Initialize result
        result = ForecastResultResponse(
            id=forecast_id,
            dataset_id=request.dataset_id,
            entity_id=request.entity_id,
            method=request.method,
            status=ForecastStatus.RUNNING,
            progress=0,
            created_at=datetime.utcnow()
        )

        # Store initial status
        await self._store_result(result)

        try:
            # Get data
            result.progress = 10
            await self._store_result(result)

            series, error = await self._get_forecast_data(
                request.dataset_id,
                request.entity_id,
                request.date_column,
                request.value_column,
                request.entity_column
            )

            if error:
                result.status = ForecastStatus.FAILED
                result.error = error
                await self._store_result(result)
                return result

            result.progress = 30
            await self._store_result(result)

            # Create forecaster
            forecaster = self._create_forecaster(request)

            # Fit model
            result.progress = 50
            await self._store_result(result)

            forecaster.fit(series)

            result.progress = 70
            await self._store_result(result)

            # Generate predictions
            output = forecaster.predict(request.horizon)

            result.progress = 90
            await self._store_result(result)

            # Build response
            result.predictions = [
                PredictionResponse(
                    date=str(row['date'].date()) if hasattr(row['date'], 'date') else str(row['date']),
                    value=round(float(row['value']), 4),
                    lower_bound=round(float(row['lower_bound']), 4),
                    upper_bound=round(float(row['upper_bound']), 4)
                )
                for _, row in output.predictions.iterrows()
            ]

            result.metrics = MetricsResponse(**output.metrics)
            result.model_summary = ModelSummaryResponse(
                method=request.method.value,
                parameters=output.model_summary.get('parameters', {}),
                coefficients=output.model_summary.get('coefficients'),
                diagnostics={
                    'residual_mean': round(float(np.mean(output.residuals)), 4) if output.residuals is not None else None,
                    'residual_std': round(float(np.std(output.residuals)), 4) if output.residuals is not None else None,
                    **{k: v for k, v in output.model_summary.items() if k not in ['method', 'parameters', 'coefficients']}
                }
            )

            result.status = ForecastStatus.COMPLETED
            result.progress = 100
            result.completed_at = datetime.utcnow()

        except Exception as e:
            logger.error(f"Forecast failed: {e}", exc_info=True)
            result.status = ForecastStatus.FAILED
            result.error = str(e)

        await self._store_result(result)
        return result

    async def run_batch_forecast(
        self,
        request: BatchForecastRequest
    ) -> BatchForecastStatusResponse:
        """Run forecasts for multiple entities"""
        batch_id = str(uuid.uuid4())
        results = []

        for i, entity_id in enumerate(request.entity_ids):
            single_request = ForecastRequest(
                dataset_id=request.dataset_id,
                entity_id=entity_id,
                method=request.method,
                horizon=request.horizon,
                frequency=request.frequency,
                confidence_level=request.confidence_level,
                arima_settings=request.arima_settings,
                ets_settings=request.ets_settings,
                prophet_settings=request.prophet_settings
            )

            result = await self.run_forecast(single_request)
            results.append(result)

        completed = sum(1 for r in results if r.status == ForecastStatus.COMPLETED)
        failed = sum(1 for r in results if r.status == ForecastStatus.FAILED)

        return BatchForecastStatusResponse(
            batch_id=batch_id,
            total=len(request.entity_ids),
            completed=completed,
            failed=failed,
            in_progress=0,
            status=ForecastStatus.COMPLETED if failed == 0 else ForecastStatus.FAILED,
            results=results
        )

    # ============================================
    # Auto Parameter Detection
    # ============================================

    async def auto_detect_parameters(
        self,
        method: ForecastMethod,
        dataset_id: str,
        entity_id: str
    ) -> AutoParamsResponse:
        """Auto-detect optimal parameters for a method"""
        series, error = await self._get_forecast_data(dataset_id, entity_id)
        if error:
            raise ValueError(error)

        frequency = self._detect_frequency(series)

        if method == ForecastMethod.ARIMA:
            params = ARIMAForecaster.auto_detect_params(series, frequency)
        elif method == ForecastMethod.ETS:
            params = ETSForecaster.auto_detect_params(series, frequency)
        else:  # Prophet
            params = ProphetForecaster.auto_detect_params(series, frequency)

        # Analyze data characteristics
        characteristics = self._analyze_data_characteristics(series)

        return AutoParamsResponse(
            method=method,
            recommended_params=params,
            data_characteristics=characteristics
        )

    # ============================================
    # Forecaster Factory
    # ============================================

    def _create_forecaster(self, request: ForecastRequest):
        """Create appropriate forecaster based on method"""
        frequency = request.frequency.value

        if request.method == ForecastMethod.ARIMA:
            settings = request.arima_settings
            if settings:
                return ARIMAForecaster(
                    frequency=frequency,
                    confidence_level=request.confidence_level,
                    auto=settings.auto if settings.auto is not None else True,
                    order=(
                        settings.p or 1,
                        settings.d or 1,
                        settings.q or 1
                    ) if not settings.auto else (1, 1, 1),
                    seasonal_order=(
                        settings.P or 0,
                        settings.D or 0,
                        settings.Q or 0,
                        settings.s or 1
                    ) if settings.s else None
                )
            return ARIMAForecaster(
                frequency=frequency,
                confidence_level=request.confidence_level,
                auto=True
            )

        elif request.method == ForecastMethod.ETS:
            settings = request.ets_settings
            if settings:
                return ETSForecaster(
                    frequency=frequency,
                    confidence_level=request.confidence_level,
                    auto=settings.auto if settings.auto is not None else True,
                    trend=settings.trend,
                    seasonal=settings.seasonal,
                    seasonal_periods=settings.seasonal_periods,
                    damped_trend=settings.damped_trend
                )
            return ETSForecaster(
                frequency=frequency,
                confidence_level=request.confidence_level,
                auto=True
            )

        else:  # Prophet
            settings = request.prophet_settings
            if settings:
                return ProphetForecaster(
                    frequency=frequency,
                    confidence_level=request.confidence_level,
                    changepoint_prior_scale=settings.changepoint_prior_scale,
                    seasonality_prior_scale=settings.seasonality_prior_scale,
                    seasonality_mode=settings.seasonality_mode,
                    yearly_seasonality=settings.yearly_seasonality,
                    weekly_seasonality=settings.weekly_seasonality,
                    daily_seasonality=settings.daily_seasonality
                )
            return ProphetForecaster(
                frequency=frequency,
                confidence_level=request.confidence_level
            )

    # ============================================
    # Result Storage
    # ============================================

    async def _store_result(self, result: ForecastResultResponse) -> None:
        """Store forecast result in Redis"""
        try:
            redis = await get_redis()
            if redis is None:
                return

            key = f"{REDIS_FORECAST_PREFIX}{result.id}"
            data = result.model_dump(mode='json')
            await redis.set(key, json.dumps(data, default=str), ex=REDIS_FORECAST_TTL)

        except Exception as e:
            logger.error(f"Error storing forecast result: {e}")

    async def get_forecast_status(self, forecast_id: str) -> Optional[ForecastResultResponse]:
        """Get forecast status/result from Redis"""
        try:
            redis = await get_redis()
            if redis is None:
                return None

            key = f"{REDIS_FORECAST_PREFIX}{forecast_id}"
            data = await redis.get(key)

            if data:
                if isinstance(data, bytes):
                    data = data.decode('utf-8')
                return ForecastResultResponse(**json.loads(data))
            return None

        except Exception as e:
            logger.error(f"Error getting forecast status: {e}")
            return None

    # ============================================
    # Method Information
    # ============================================

    def get_available_methods(self) -> List[MethodInfoResponse]:
        """Get information about available forecasting methods"""
        return [
            MethodInfoResponse(
                id="arima",
                name="ARIMA",
                description="AutoRegressive Integrated Moving Average - Best for data with clear trends and autocorrelation patterns. Handles both stationary and non-stationary time series.",
                supports_seasonality=True,
                supports_exogenous=True,
                default_settings={
                    'auto': True,
                    'p': 1, 'd': 1, 'q': 1
                }
            ),
            MethodInfoResponse(
                id="ets",
                name="ETS (Exponential Smoothing)",
                description="Error-Trend-Seasonality model - Best for data with clear level, trend, and seasonal patterns. Uses weighted averages of past observations.",
                supports_seasonality=True,
                supports_exogenous=False,
                default_settings={
                    'auto': True,
                    'trend': 'add',
                    'seasonal': None,
                    'damped_trend': False
                }
            ),
            MethodInfoResponse(
                id="prophet",
                name="Prophet",
                description="Facebook's forecasting model - Best for business time series with strong seasonal effects, holidays, and missing data. Handles outliers well.",
                supports_seasonality=True,
                supports_exogenous=True,
                default_settings={
                    'changepoint_prior_scale': 0.05,
                    'seasonality_mode': 'additive',
                    'yearly_seasonality': True,
                    'weekly_seasonality': True
                }
            )
        ]

    # ============================================
    # Helper Methods
    # ============================================

    def _detect_date_column(self, df: pd.DataFrame) -> Optional[str]:
        """Auto-detect date column"""
        date_keywords = ["date", "time", "timestamp", "period", "day", "month", "year"]

        # First, check column names
        for col in df.columns:
            if any(kw in col.lower() for kw in date_keywords):
                return col

        # Then, check column types
        for col in df.columns:
            if df[col].dtype == 'datetime64[ns]':
                return col
            # Try to parse as date
            try:
                pd.to_datetime(df[col].head(10), errors='raise')
                return col
            except Exception:
                continue

        return None

    def _detect_value_column(self, df: pd.DataFrame) -> Optional[str]:
        """Auto-detect value column"""
        value_keywords = ["value", "sales", "amount", "quantity", "demand", "price",
                         "revenue", "volume", "count", "total", "sum"]

        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

        # First, check for keyword matches in numeric columns
        for col in numeric_cols:
            if any(kw in col.lower() for kw in value_keywords):
                return col

        # Return first numeric column that's not an ID or index
        for col in numeric_cols:
            if not any(kw in col.lower() for kw in ['id', 'index', 'key']):
                return col

        return numeric_cols[0] if numeric_cols else None

    def _detect_frequency(self, series: pd.Series) -> str:
        """Detect data frequency from time series"""
        if len(series) < 2:
            return 'D'

        try:
            # Calculate median time difference
            time_diffs = series.index.to_series().diff().dropna()
            median_diff = time_diffs.median()

            if median_diff.days >= 28:
                return 'M'
            elif median_diff.days >= 7:
                return 'W'
            else:
                return 'D'
        except Exception:
            return 'D'

    def _analyze_data_characteristics(self, series: pd.Series) -> Dict[str, Any]:
        """Analyze time series characteristics"""
        y = series.dropna()

        # Basic statistics
        characteristics = {
            'length': len(y),
            'mean': round(float(y.mean()), 4),
            'std': round(float(y.std()), 4),
            'min': round(float(y.min()), 4),
            'max': round(float(y.max()), 4),
            'has_missing': series.isna().any(),
            'missing_count': int(series.isna().sum())
        }

        # Trend detection
        if len(y) >= 2:
            first_quarter = y[:len(y)//4].mean()
            last_quarter = y[-len(y)//4:].mean()
            if last_quarter > first_quarter * 1.1:
                characteristics['trend'] = 'increasing'
            elif last_quarter < first_quarter * 0.9:
                characteristics['trend'] = 'decreasing'
            else:
                characteristics['trend'] = 'stationary'
        else:
            characteristics['trend'] = 'unknown'

        # Stationarity check
        try:
            from statsmodels.tsa.stattools import adfuller
            result = adfuller(y, autolag='AIC')
            characteristics['is_stationary'] = result[1] < 0.05
            characteristics['adf_pvalue'] = round(result[1], 4)
        except Exception:
            characteristics['is_stationary'] = None

        # Seasonality detection
        characteristics['seasonality_detected'] = False
        characteristics['seasonality_period'] = None

        try:
            for period in [7, 12, 30, 52]:
                if len(y) >= 2 * period:
                    autocorr = pd.Series(y.values).autocorr(lag=period)
                    if autocorr and autocorr > 0.3:
                        characteristics['seasonality_detected'] = True
                        characteristics['seasonality_period'] = period
                        break
        except Exception:
            pass

        return characteristics
