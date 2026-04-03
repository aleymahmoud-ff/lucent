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

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.redis_client import get_redis
from app.services.preprocessing_service import PreprocessingService
from app.services.snapshot_service import SnapshotService
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

# Strong references to background tasks to prevent GC from cancelling them
_background_tasks: set = set()


class ForecastService:
    """Service for running forecasts and managing results"""

    def __init__(self, tenant_id: str, user_id: Optional[str] = None, db: Optional[AsyncSession] = None):
        self.tenant_id = tenant_id
        self.user_id = user_id
        self.db = db
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
        entity_column: Optional[str] = None,
        regressor_columns: Optional[List[str]] = None
    ) -> Tuple[Optional[pd.Series], Optional[str], Optional[pd.DataFrame]]:
        """
        Get time series data for forecasting.
        Falls back to raw data if no preprocessing exists.
        Returns (series, error, exog_df) where exog_df contains regressor columns if available.
        """
        try:
            # Get data - preprocessing service already handles fallback to raw data
            if entity_id and entity_id != "All Data":
                logger.info(f"_get_forecast_data: fetching entity={entity_id!r}, entity_column={entity_column!r}")
                df = await self.preprocessing_service.get_entity_data(
                    dataset_id, entity_id, entity_column
                )
            else:
                logger.info(f"_get_forecast_data: fetching full dataset for entity_id={entity_id!r}")
                df = await self.preprocessing_service.get_dataset_dataframe(dataset_id)

            if df is None:
                logger.warning(f"_get_forecast_data: df is None for dataset={dataset_id}")
                return None, "Dataset not found or expired", None

            logger.info(f"_get_forecast_data: got {len(df)} rows, columns={list(df.columns)}")

            if len(df) == 0:
                return None, "Dataset is empty", None

            # Auto-detect columns if not specified
            if not date_column:
                date_column = self._detect_date_column(df)
            if not value_column:
                value_column = self._detect_value_column(df)

            if not date_column:
                return None, "Could not detect date column. Please specify date_column.", None
            if not value_column:
                return None, "Could not detect value column. Please specify value_column.", None

            if date_column not in df.columns:
                return None, f"Date column '{date_column}' not found in dataset", None
            if value_column not in df.columns:
                return None, f"Value column '{value_column}' not found in dataset", None

            # Prepare time series
            df[date_column] = pd.to_datetime(df[date_column], errors='coerce')
            df = df.dropna(subset=[date_column, value_column])
            df = df.sort_values(date_column)

            # Convert value column to numeric
            df[value_column] = pd.to_numeric(df[value_column], errors='coerce')
            df = df.dropna(subset=[value_column])

            if len(df) < 10:
                return None, f"Insufficient data points ({len(df)}). Need at least 10 observations.", None

            # Create series with date index
            series = pd.Series(
                df[value_column].values,
                index=pd.DatetimeIndex(df[date_column]),
                name=value_column
            )

            # Extract regressor columns (exogenous variables)
            exog_df = None
            core_columns = {date_column, value_column}
            if entity_column:
                core_columns.add(entity_column)
            # Also exclude Entity_ID and Entity_Name by convention
            core_columns.update({"Entity_ID", "Entity_Name", "entity_id", "entity_name"})

            if regressor_columns:
                # Use explicitly specified regressors
                available = [c for c in regressor_columns if c in df.columns]
                if available:
                    exog_df = df[[date_column] + available].copy()
                    exog_df.set_index(date_column, inplace=True)
                    for col in available:
                        exog_df[col] = pd.to_numeric(exog_df[col], errors='coerce')
                    # Fill NaN with column mean (don't drop rows)
                    col_means = exog_df.mean(numeric_only=True)
                    exog_df = exog_df.fillna(col_means)
                    exog_df = exog_df.dropna(axis=1, how='all')  # drop columns still all-NaN
            else:
                # Auto-detect: any extra numeric column not in core columns
                extra_cols = [c for c in df.columns if c not in core_columns]
                numeric_extras = []
                for col in extra_cols:
                    converted = pd.to_numeric(df[col], errors='coerce')
                    # Require 90%+ valid numeric values to qualify as a regressor
                    if converted.notna().sum() > len(df) * 0.9:
                        numeric_extras.append(col)
                if numeric_extras:
                    exog_df = df[[date_column] + numeric_extras].copy()
                    exog_df.set_index(date_column, inplace=True)
                    for col in numeric_extras:
                        exog_df[col] = pd.to_numeric(exog_df[col], errors='coerce')
                    col_means = exog_df.mean(numeric_only=True)
                    exog_df = exog_df.fillna(col_means)
                    exog_df = exog_df.dropna(axis=1, how='all')

            return series, None, exog_df

        except Exception as e:
            logger.error(f"Error preparing forecast data: {e}")
            return None, str(e), None

    # ============================================
    # Forecast Execution
    # ============================================

    async def run_forecast(
        self,
        request: ForecastRequest,
        forecast_id: Optional[str] = None,
        forecast_history_id: Optional[str] = None,
    ) -> ForecastResultResponse:
        """Run a single forecast"""
        forecast_id = forecast_id or str(uuid.uuid4())

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

            logger.info(f"Forecast: entity_id={request.entity_id!r}, dataset={request.dataset_id}, method={request.method}, entity_column={request.entity_column!r}")

            series, error, exog_df = await self._get_forecast_data(
                request.dataset_id,
                request.entity_id,
                request.date_column,
                request.value_column,
                request.entity_column,
                request.regressor_columns
            )

            if error:
                logger.warning(f"Forecast data error for entity={request.entity_id!r}: {error}")
                result.status = ForecastStatus.FAILED
                result.error = error
                await self._store_result(result)
                return result

            logger.info(f"Forecast data OK: series_len={len(series)}, exog={exog_df.columns.tolist() if exog_df is not None else None}")

            # Only pass exog to Prophet (ARIMA/ETS don't support it in our implementation)
            use_exog = exog_df if (request.method == ForecastMethod.PROPHET and exog_df is not None and len(exog_df.columns) > 0) else None

            result.progress = 30
            await self._store_result(result)

            # Create forecaster
            forecaster = self._create_forecaster(request)

            # Fit model
            result.progress = 50
            await self._store_result(result)

            forecaster.fit(series, exog=use_exog)

            result.progress = 70
            await self._store_result(result)

            # Generate predictions
            output = forecaster.predict(request.horizon, exog=use_exog)

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
                },
                regressors_used=list(use_exog.columns) if use_exog is not None else None
            )

            result.status = ForecastStatus.COMPLETED
            result.progress = 100
            result.completed_at = datetime.utcnow()

            # Save predictions permanently to PostgreSQL (non-blocking)
            try:
                if self.db is not None and forecast_history_id:
                    await self._save_predictions_to_db(forecast_history_id, result)
            except Exception as db_err:
                logger.error(f"Failed to save predictions to DB (non-blocking): {db_err}")

        except Exception as e:
            logger.error(f"Forecast failed: {e}", exc_info=True)
            result.status = ForecastStatus.FAILED
            result.error = str(e)

        await self._store_result(result)
        return result

    async def start_batch_forecast(
        self,
        request: BatchForecastRequest
    ) -> BatchForecastStatusResponse:
        """Start a batch forecast — returns immediately, processes in background."""
        batch_id = str(uuid.uuid4())

        # Store initial batch status in Redis
        initial_status = BatchForecastStatusResponse(
            batch_id=batch_id,
            total=len(request.entity_ids),
            completed=0,
            failed=0,
            in_progress=len(request.entity_ids),
            status=ForecastStatus.RUNNING,
            results=[]
        )
        await self._store_batch_status(batch_id, initial_status)

        # Launch background task with strong reference to prevent GC
        import asyncio
        loop = asyncio.get_running_loop()
        task = loop.create_task(self._run_batch_background(batch_id, request))
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)

        return initial_status

    async def _run_batch_background(
        self,
        batch_id: str,
        request: BatchForecastRequest
    ) -> None:
        """Background worker that processes batch entities one by one."""
        results: List[ForecastResultResponse] = []

        try:
            # Auto-detect entity column once for the whole batch
            entity_column = None
            try:
                df = await self.preprocessing_service.get_dataset_dataframe(request.dataset_id)
                if df is not None:
                    entity_column = self.preprocessing_service._detect_entity_column(df)
                    logger.info(f"Batch forecast: detected entity_column={entity_column!r}, entities={request.entity_ids}")
            except Exception as e:
                logger.warning(f"Batch: could not detect entity column: {e}")

            for i, entity_id in enumerate(request.entity_ids):
                single_request = ForecastRequest(
                    dataset_id=request.dataset_id,
                    entity_id=entity_id,
                    entity_column=entity_column,
                    method=request.method,
                    horizon=request.horizon,
                    frequency=request.frequency,
                    confidence_level=request.confidence_level,
                    arima_settings=request.arima_settings,
                    ets_settings=request.ets_settings,
                    prophet_settings=request.prophet_settings,
                    regressor_columns=request.regressor_columns
                )

                result = await self.run_forecast(single_request)
                results.append(result)

                # Update batch status in Redis after each entity
                completed = sum(1 for r in results if r.status == ForecastStatus.COMPLETED)
                failed = sum(1 for r in results if r.status == ForecastStatus.FAILED)
                remaining = len(request.entity_ids) - len(results)

                batch_status = BatchForecastStatusResponse(
                    batch_id=batch_id,
                    total=len(request.entity_ids),
                    completed=completed,
                    failed=failed,
                    in_progress=remaining,
                    status=ForecastStatus.RUNNING if remaining > 0 else (
                        ForecastStatus.COMPLETED if completed > 0 else ForecastStatus.FAILED
                    ),
                    results=results
                )
                await self._store_batch_status(batch_id, batch_status)

            logger.info(f"Batch {batch_id} finished: {sum(1 for r in results if r.status == ForecastStatus.COMPLETED)}/{len(results)} completed")

        except Exception as e:
            # Top-level handler: mark batch as FAILED so it doesn't stay stuck as "running"
            logger.error(f"Batch {batch_id} crashed: {e}", exc_info=True)
            failed_status = BatchForecastStatusResponse(
                batch_id=batch_id,
                total=len(request.entity_ids),
                completed=sum(1 for r in results if r.status == ForecastStatus.COMPLETED),
                failed=len(request.entity_ids) - sum(1 for r in results if r.status == ForecastStatus.COMPLETED),
                in_progress=0,
                status=ForecastStatus.FAILED,
                results=results
            )
            await self._store_batch_status(batch_id, failed_status)

    async def _store_batch_status(self, batch_id: str, status: BatchForecastStatusResponse) -> None:
        """Store batch forecast status in Redis."""
        try:
            redis = await get_redis()
            if redis is None:
                return
            key = f"forecast_batch:{batch_id}"
            data = status.model_dump(mode='json')
            await redis.set(key, json.dumps(data, default=str), ex=REDIS_FORECAST_TTL)
        except Exception as e:
            logger.error(f"Error storing batch status: {e}")

    async def get_batch_status(self, batch_id: str) -> Optional[BatchForecastStatusResponse]:
        """Get batch forecast status from Redis."""
        try:
            redis = await get_redis()
            if redis is None:
                return None
            key = f"forecast_batch:{batch_id}"
            data = await redis.get(key)
            if data:
                if isinstance(data, bytes):
                    data = data.decode('utf-8')
                return BatchForecastStatusResponse(**json.loads(data))
            return None
        except Exception as e:
            logger.error(f"Error getting batch status: {e}")
            return None

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
        series, error, _ = await self._get_forecast_data(dataset_id, entity_id)
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

    async def _save_predictions_to_db(
        self,
        forecast_history_id: str,
        result: ForecastResultResponse,
    ) -> None:
        """Persist forecast predictions to PostgreSQL for permanent storage."""
        from app.models import ForecastPrediction

        prediction = ForecastPrediction(
            id=str(uuid.uuid4()),
            tenant_id=self.tenant_id,
            forecast_history_id=forecast_history_id,
            entity_id=result.entity_id or "unknown",
            entity_name=None,
            predicted_values=[
                {"date": p.date, "value": p.value, "lower_bound": p.lower_bound, "upper_bound": p.upper_bound}
                for p in (result.predictions or [])
            ],
            metrics=result.metrics.model_dump() if result.metrics else None,
            model_summary=result.model_summary.model_dump() if result.model_summary else None,
            cv_results=result.cv_results.model_dump() if result.cv_results else None,
        )
        self.db.add(prediction)
        await self.db.flush()
        logger.info(
            "Saved prediction to DB: forecast_history_id=%s entity=%s",
            forecast_history_id,
            result.entity_id,
        )

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
            'has_missing': bool(series.isna().any()),
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
            characteristics['is_stationary'] = bool(result[1] < 0.05)
            characteristics['adf_pvalue'] = round(float(result[1]), 4)
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
