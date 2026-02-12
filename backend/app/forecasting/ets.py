"""
ETS Forecaster - Exponential Smoothing implementation using statsmodels
"""
import warnings
from typing import Dict, Any, Optional
import pandas as pd
import numpy as np
import logging

from statsmodels.tsa.holtwinters import ExponentialSmoothing

from .base import BaseForecaster, ForecastOutput

logger = logging.getLogger(__name__)

# Suppress warnings
warnings.filterwarnings('ignore', category=UserWarning)
warnings.filterwarnings('ignore', category=FutureWarning)


class ETSForecaster(BaseForecaster):
    """ETS (Error-Trend-Seasonality) forecaster using Exponential Smoothing"""

    def __init__(
        self,
        frequency: str = "D",
        confidence_level: float = 0.95,
        error: str = "add",
        trend: Optional[str] = "add",
        seasonal: Optional[str] = None,
        seasonal_periods: Optional[int] = None,
        damped_trend: bool = False,
        auto: bool = True
    ):
        """
        Initialize ETS forecaster.

        Args:
            frequency: Data frequency ('D', 'W', 'M')
            confidence_level: Confidence level for intervals
            error: Error type ('add' or 'mul')
            trend: Trend type ('add', 'mul', or None)
            seasonal: Seasonal type ('add', 'mul', or None)
            seasonal_periods: Number of periods in a season
            damped_trend: Whether to damp the trend
            auto: Whether to auto-detect parameters
        """
        super().__init__(frequency, confidence_level)
        self.error = error
        self.trend = trend
        self.seasonal = seasonal
        self.seasonal_periods = seasonal_periods
        self.damped_trend = damped_trend
        self.auto = auto

    def fit(self, y: pd.Series, exog: Optional[pd.DataFrame] = None) -> None:
        """Fit ETS model to the data"""
        y = self._validate_data(y)
        self._training_data = y

        # Auto-detect parameters if enabled
        if self.auto:
            self._auto_detect(y)
            logger.info(f"Auto-detected ETS: trend={self.trend}, seasonal={self.seasonal}, periods={self.seasonal_periods}")

        try:
            # Handle seasonal parameter
            seasonal_component = self.seasonal if self.seasonal and self.seasonal != 'none' else None
            trend_component = self.trend if self.trend and self.trend != 'none' else None

            self.model = ExponentialSmoothing(
                y,
                trend=trend_component,
                seasonal=seasonal_component,
                seasonal_periods=self.seasonal_periods if seasonal_component else None,
                damped_trend=self.damped_trend if trend_component else False,
                initialization_method='estimated'
            ).fit(optimized=True)

            self.is_fitted = True
            logger.info(f"ETS model fitted successfully. AIC: {self.model.aic:.2f}")

        except Exception as e:
            logger.error(f"ETS fitting failed: {e}")
            # Fallback to simple exponential smoothing
            try:
                self.model = ExponentialSmoothing(
                    y,
                    trend=None,
                    seasonal=None,
                    initialization_method='estimated'
                ).fit(optimized=True)
                self.is_fitted = True
                self.trend = None
                self.seasonal = None
                logger.info("Fallback to simple exponential smoothing")
            except Exception as e2:
                raise ValueError(f"Failed to fit ETS model: {str(e2)}")

    def predict(self, horizon: int, exog: Optional[pd.DataFrame] = None) -> ForecastOutput:
        """Generate predictions"""
        if not self.is_fitted:
            raise ValueError("Model must be fitted before prediction")

        # Generate point forecasts
        forecast = self.model.forecast(horizon)

        # Generate confidence intervals using simulation
        try:
            simulations = self.model.simulate(
                nsimulations=horizon,
                repetitions=1000,
                anchor='end'
            )
            lower = np.percentile(simulations, (1 - self.confidence_level) / 2 * 100, axis=1)
            upper = np.percentile(simulations, (1 + self.confidence_level) / 2 * 100, axis=1)
        except Exception:
            # Fallback: use residual-based intervals
            residual_std = np.std(self.model.resid)
            z_score = 1.96 if self.confidence_level == 0.95 else 2.576
            lower = forecast.values - z_score * residual_std * np.sqrt(np.arange(1, horizon + 1))
            upper = forecast.values + z_score * residual_std * np.sqrt(np.arange(1, horizon + 1))

        # Create future dates
        last_date = self._training_data.index[-1]
        future_dates = self._create_future_dates(last_date, horizon)

        # Build predictions DataFrame
        predictions = pd.DataFrame({
            'date': future_dates,
            'value': forecast.values,
            'lower_bound': lower,
            'upper_bound': upper
        })

        # Calculate in-sample metrics
        fitted_values = self.model.fittedvalues
        residuals = self.model.resid

        metrics = self._calculate_metrics(
            self._training_data.values,
            fitted_values.values
        )

        # Add AIC/BIC to metrics
        try:
            metrics['aic'] = round(float(self.model.aic), 2)
            metrics['bic'] = round(float(self.model.bic), 2)
        except Exception:
            pass

        # Build model summary
        model_summary = {
            'method': 'ETS',
            'trend': self.trend,
            'seasonal': self.seasonal,
            'seasonal_periods': self.seasonal_periods,
            'damped_trend': self.damped_trend,
            'parameters': {}
        }

        # Add smoothing parameters
        try:
            params = self.model.params
            model_summary['parameters'] = {
                'alpha': round(float(params.get('smoothing_level', 0)), 4),
                'beta': round(float(params.get('smoothing_trend', 0)), 4) if self.trend else None,
                'gamma': round(float(params.get('smoothing_seasonal', 0)), 4) if self.seasonal else None,
                'phi': round(float(params.get('damping_trend', 0)), 4) if self.damped_trend else None,
            }
            # Remove None values
            model_summary['parameters'] = {
                k: v for k, v in model_summary['parameters'].items() if v is not None
            }
        except Exception:
            pass

        return ForecastOutput(
            predictions=predictions,
            metrics=metrics,
            model_summary=model_summary,
            residuals=residuals.values if residuals is not None else None
        )

    def get_params(self) -> Dict[str, Any]:
        """Return model parameters"""
        return {
            'error': self.error,
            'trend': self.trend,
            'seasonal': self.seasonal,
            'seasonal_periods': self.seasonal_periods,
            'damped_trend': self.damped_trend,
            'auto': self.auto,
            'frequency': self.frequency,
            'confidence_level': self.confidence_level
        }

    @classmethod
    def auto_detect_params(cls, y: pd.Series, frequency: str = "D") -> Dict[str, Any]:
        """Auto-detect optimal ETS parameters"""
        forecaster = cls(frequency=frequency, auto=True)
        y = forecaster._validate_data(y)
        forecaster._auto_detect(y)

        return {
            'trend': forecaster.trend,
            'seasonal': forecaster.seasonal,
            'seasonal_periods': forecaster.seasonal_periods,
            'damped_trend': forecaster.damped_trend
        }

    def _auto_detect(self, y: pd.Series) -> None:
        """Auto-detect ETS parameters based on data characteristics"""
        n = len(y)

        # Detect trend
        self.trend = self._detect_trend(y)

        # Detect seasonality
        self.seasonal, self.seasonal_periods = self._detect_seasonality(y)

        # Damped trend usually works better for longer horizons
        self.damped_trend = self.trend is not None

    def _detect_trend(self, y: pd.Series) -> Optional[str]:
        """Detect if data has a trend"""
        n = len(y)
        if n < 10:
            return None

        # Simple linear regression slope
        x = np.arange(n)
        slope, _ = np.polyfit(x, y.values, 1)

        # Coefficient of variation of the series
        cv = np.std(y) / np.mean(y) if np.mean(y) != 0 else 0

        # If slope is significant relative to the data variability
        if abs(slope * n) > 0.1 * np.std(y):
            # Check if multiplicative trend is more appropriate
            if np.all(y > 0) and cv > 0.3:
                return 'mul'
            return 'add'

        return None

    def _detect_seasonality(self, y: pd.Series) -> tuple:
        """Detect seasonal pattern"""
        n = len(y)

        # Check for common seasonal periods based on frequency
        seasonal_periods = {
            'D': [7, 30],   # Weekly, monthly for daily data
            'W': [4, 52],   # Monthly, yearly for weekly data
            'M': [12],      # Yearly for monthly data
        }

        periods_to_check = seasonal_periods.get(self.frequency, [])

        for period in periods_to_check:
            if n >= 2 * period:
                # Calculate autocorrelation at seasonal lag
                try:
                    autocorr = pd.Series(y.values).autocorr(lag=period)
                    if autocorr and autocorr > 0.3:
                        # Check if multiplicative seasonality is appropriate
                        if np.all(y > 0) and np.std(y) / np.mean(y) > 0.3:
                            return 'mul', period
                        return 'add', period
                except Exception:
                    continue

        return None, None
