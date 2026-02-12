"""
ARIMA Forecaster - ARIMA/SARIMA implementation using statsmodels
"""
import warnings
from typing import Dict, Any, Optional, Tuple
import pandas as pd
import numpy as np
import logging

from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.tsa.stattools import adfuller, acf, pacf

from .base import BaseForecaster, ForecastOutput

logger = logging.getLogger(__name__)

# Suppress statsmodels warnings
warnings.filterwarnings('ignore', category=UserWarning)
warnings.filterwarnings('ignore', category=FutureWarning)


class ARIMAForecaster(BaseForecaster):
    """ARIMA/SARIMA forecaster using statsmodels"""

    def __init__(
        self,
        frequency: str = "D",
        confidence_level: float = 0.95,
        order: Tuple[int, int, int] = (1, 1, 1),
        seasonal_order: Optional[Tuple[int, int, int, int]] = None,
        auto: bool = True
    ):
        """
        Initialize ARIMA forecaster.

        Args:
            frequency: Data frequency ('D', 'W', 'M')
            confidence_level: Confidence level for intervals
            order: (p, d, q) - AR order, differencing, MA order
            seasonal_order: (P, D, Q, s) - Seasonal parameters
            auto: Whether to auto-detect parameters
        """
        super().__init__(frequency, confidence_level)
        self.order = order
        self.seasonal_order = seasonal_order
        self.auto = auto

    def fit(self, y: pd.Series, exog: Optional[pd.DataFrame] = None) -> None:
        """Fit ARIMA model to the data"""
        y = self._validate_data(y)
        self._training_data = y

        # Auto-detect parameters if enabled
        if self.auto:
            self.order, self.seasonal_order = self._auto_arima(y)
            logger.info(f"Auto-detected ARIMA order: {self.order}, seasonal: {self.seasonal_order}")

        try:
            if self.seasonal_order and self.seasonal_order[3] > 1:
                # Use SARIMAX for seasonal data
                self.model = SARIMAX(
                    y,
                    order=self.order,
                    seasonal_order=self.seasonal_order,
                    enforce_stationarity=False,
                    enforce_invertibility=False
                ).fit(disp=False)
            else:
                # Use ARIMA for non-seasonal data
                self.model = ARIMA(
                    y,
                    order=self.order
                ).fit()

            self.is_fitted = True
            logger.info(f"ARIMA model fitted successfully. AIC: {self.model.aic:.2f}")

        except Exception as e:
            logger.error(f"ARIMA fitting failed: {e}")
            raise ValueError(f"Failed to fit ARIMA model: {str(e)}")

    def predict(self, horizon: int, exog: Optional[pd.DataFrame] = None) -> ForecastOutput:
        """Generate predictions"""
        if not self.is_fitted:
            raise ValueError("Model must be fitted before prediction")

        # Get predictions with confidence intervals
        forecast = self.model.get_forecast(steps=horizon)
        mean = forecast.predicted_mean
        conf_int = forecast.conf_int(alpha=1 - self.confidence_level)

        # Create future dates
        last_date = self._training_data.index[-1]
        future_dates = self._create_future_dates(last_date, horizon)

        # Build predictions DataFrame
        predictions = pd.DataFrame({
            'date': future_dates,
            'value': mean.values,
            'lower_bound': conf_int.iloc[:, 0].values,
            'upper_bound': conf_int.iloc[:, 1].values
        })

        # Calculate in-sample metrics
        fitted_values = self.model.fittedvalues
        residuals = self.model.resid

        # Align lengths for metric calculation
        min_len = min(len(self._training_data), len(fitted_values))
        y_true = self._training_data.values[-min_len:]
        y_pred = fitted_values.values[-min_len:]

        metrics = self._calculate_metrics(y_true, y_pred)

        # Add AIC/BIC to metrics
        metrics['aic'] = round(float(self.model.aic), 2)
        metrics['bic'] = round(float(self.model.bic), 2)

        # Build model summary
        model_summary = {
            'method': 'ARIMA',
            'order': list(self.order),
            'seasonal_order': list(self.seasonal_order) if self.seasonal_order else None,
            'aic': self.model.aic,
            'bic': self.model.bic,
            'parameters': {
                'p': self.order[0],
                'd': self.order[1],
                'q': self.order[2]
            }
        }

        # Add coefficients if available
        try:
            model_summary['coefficients'] = {
                str(k): round(float(v), 6)
                for k, v in self.model.params.items()
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
            'order': self.order,
            'seasonal_order': self.seasonal_order,
            'auto': self.auto,
            'frequency': self.frequency,
            'confidence_level': self.confidence_level
        }

    @classmethod
    def auto_detect_params(cls, y: pd.Series, frequency: str = "D") -> Dict[str, Any]:
        """Auto-detect optimal ARIMA parameters"""
        forecaster = cls(frequency=frequency, auto=True)
        y = forecaster._validate_data(y)
        order, seasonal_order = forecaster._auto_arima(y)

        return {
            'order': order,
            'seasonal_order': seasonal_order,
            'stationarity': forecaster._check_stationarity(y),
            'recommended_d': forecaster._find_d(y)
        }

    def _auto_arima(self, y: pd.Series) -> Tuple[Tuple[int, int, int], Optional[Tuple[int, int, int, int]]]:
        """Simple auto ARIMA parameter selection"""
        # Determine differencing order
        d = self._find_d(y)

        # Grid search for p, q (simplified)
        best_aic = float('inf')
        best_order = (1, d, 1)

        # Try different combinations
        for p in range(4):
            for q in range(4):
                if p == 0 and q == 0:
                    continue  # Skip (0, d, 0)
                try:
                    with warnings.catch_warnings():
                        warnings.simplefilter("ignore")
                        model = ARIMA(y, order=(p, d, q)).fit()
                        if model.aic < best_aic:
                            best_aic = model.aic
                            best_order = (p, d, q)
                except Exception:
                    continue

        # Detect seasonality
        seasonal_order = self._detect_seasonality(y)

        return best_order, seasonal_order

    def _find_d(self, y: pd.Series) -> int:
        """Find optimal differencing order using ADF test"""
        max_d = 2
        for d in range(max_d + 1):
            if d == 0:
                test_series = y
            else:
                test_series = y.diff(d).dropna()

            if len(test_series) < 10:
                return d

            try:
                result = adfuller(test_series, autolag='AIC')
                p_value = result[1]
                if p_value < 0.05:  # Stationary at 5% level
                    return d
            except Exception:
                continue

        return 1  # Default to d=1

    def _detect_seasonality(self, y: pd.Series) -> Optional[Tuple[int, int, int, int]]:
        """Detect seasonal patterns in data"""
        n = len(y)

        # Check for common seasonal periods based on frequency
        seasonal_periods = {
            'D': [7, 30, 365],  # Weekly, monthly, yearly for daily data
            'W': [4, 52],       # Monthly, yearly for weekly data
            'M': [12],          # Yearly for monthly data
        }

        periods_to_check = seasonal_periods.get(self.frequency, [])

        for period in periods_to_check:
            if n > 2 * period:
                try:
                    # Check ACF at the seasonal lag
                    acf_values = acf(y.dropna(), nlags=period + 1, fft=True)
                    if abs(acf_values[period]) > 0.3:  # Threshold for seasonality
                        return (1, 1, 1, period)
                except Exception:
                    continue

        return None

    def _check_stationarity(self, y: pd.Series) -> bool:
        """Check if series is stationary using ADF test"""
        try:
            result = adfuller(y.dropna(), autolag='AIC')
            return result[1] < 0.05  # p-value < 0.05 means stationary
        except Exception:
            return False
