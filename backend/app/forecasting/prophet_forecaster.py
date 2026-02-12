"""
Prophet Forecaster - Facebook Prophet implementation
"""
import warnings
from typing import Dict, Any, Optional, Union
import pandas as pd
import numpy as np
import logging

from .base import BaseForecaster, ForecastOutput

logger = logging.getLogger(__name__)

# Suppress Prophet's verbose output
logging.getLogger('prophet').setLevel(logging.WARNING)
logging.getLogger('cmdstanpy').setLevel(logging.WARNING)
warnings.filterwarnings('ignore', category=FutureWarning)


class ProphetForecaster(BaseForecaster):
    """Facebook Prophet forecaster"""

    def __init__(
        self,
        frequency: str = "D",
        confidence_level: float = 0.95,
        changepoint_prior_scale: float = 0.05,
        seasonality_prior_scale: float = 10.0,
        seasonality_mode: str = "additive",
        yearly_seasonality: Union[bool, int] = True,
        weekly_seasonality: Union[bool, int] = True,
        daily_seasonality: Union[bool, int] = False,
        holidays_prior_scale: float = 10.0
    ):
        """
        Initialize Prophet forecaster.

        Args:
            frequency: Data frequency ('D', 'W', 'M')
            confidence_level: Confidence level for intervals
            changepoint_prior_scale: Flexibility of trend changes (0.001 to 0.5)
            seasonality_prior_scale: Strength of seasonality (0.01 to 100)
            seasonality_mode: 'additive' or 'multiplicative'
            yearly_seasonality: Whether to include yearly seasonality
            weekly_seasonality: Whether to include weekly seasonality
            daily_seasonality: Whether to include daily seasonality
            holidays_prior_scale: Strength of holiday effects
        """
        super().__init__(frequency, confidence_level)
        self.changepoint_prior_scale = changepoint_prior_scale
        self.seasonality_prior_scale = seasonality_prior_scale
        self.seasonality_mode = seasonality_mode
        self.yearly_seasonality = yearly_seasonality
        self.weekly_seasonality = weekly_seasonality
        self.daily_seasonality = daily_seasonality
        self.holidays_prior_scale = holidays_prior_scale
        self._df_train = None

    def fit(self, y: pd.Series, exog: Optional[pd.DataFrame] = None) -> None:
        """Fit Prophet model to the data"""
        # Import Prophet here to avoid import errors if not installed
        try:
            from prophet import Prophet
        except ImportError:
            raise ImportError("Prophet is not installed. Install it with: pip install prophet")

        y = self._validate_data(y)
        self._training_data = y

        # Prepare data in Prophet format
        self._df_train = pd.DataFrame({
            'ds': y.index,
            'y': y.values
        })

        # Handle negative values for multiplicative seasonality
        if self.seasonality_mode == 'multiplicative' and (self._df_train['y'] <= 0).any():
            logger.warning("Multiplicative seasonality requires positive values. Switching to additive.")
            self.seasonality_mode = 'additive'

        try:
            # Initialize Prophet model
            self.model = Prophet(
                changepoint_prior_scale=self.changepoint_prior_scale,
                seasonality_prior_scale=self.seasonality_prior_scale,
                seasonality_mode=self.seasonality_mode,
                yearly_seasonality=self.yearly_seasonality,
                weekly_seasonality=self.weekly_seasonality,
                daily_seasonality=self.daily_seasonality,
                holidays_prior_scale=self.holidays_prior_scale,
                interval_width=self.confidence_level
            )

            # Fit the model
            self.model.fit(self._df_train)
            self.is_fitted = True
            logger.info("Prophet model fitted successfully")

        except Exception as e:
            logger.error(f"Prophet fitting failed: {e}")
            raise ValueError(f"Failed to fit Prophet model: {str(e)}")

    def predict(self, horizon: int, exog: Optional[pd.DataFrame] = None) -> ForecastOutput:
        """Generate predictions"""
        if not self.is_fitted:
            raise ValueError("Model must be fitted before prediction")

        # Map frequency to Prophet format
        freq_map = {
            'D': 'D',
            'W': 'W',
            'M': 'MS'
        }
        freq = freq_map.get(self.frequency, 'D')

        # Create future dataframe
        future = self.model.make_future_dataframe(periods=horizon, freq=freq)
        forecast = self.model.predict(future)

        # Extract only future predictions
        future_forecast = forecast.tail(horizon)

        # Build predictions DataFrame
        predictions = pd.DataFrame({
            'date': future_forecast['ds'],
            'value': future_forecast['yhat'].values,
            'lower_bound': future_forecast['yhat_lower'].values,
            'upper_bound': future_forecast['yhat_upper'].values
        })

        # Calculate metrics on historical fit
        # Merge predictions with training data to ensure alignment
        historical = forecast[forecast['ds'].isin(self._df_train['ds'])]
        merged = self._df_train.merge(historical[['ds', 'yhat']], on='ds', how='inner')

        if len(merged) > 0:
            metrics = self._calculate_metrics(
                merged['y'].values,
                merged['yhat'].values
            )
            residuals = merged['y'].values - merged['yhat'].values
        else:
            # Fallback if merge fails
            metrics = {'mae': 0, 'rmse': 0, 'mape': 0, 'mse': 0, 'r2': 0}
            residuals = np.array([])

        # Build model summary
        model_summary = {
            'method': 'Prophet',
            'changepoint_prior_scale': self.changepoint_prior_scale,
            'seasonality_prior_scale': self.seasonality_prior_scale,
            'seasonality_mode': self.seasonality_mode,
            'parameters': {
                'yearly_seasonality': self.yearly_seasonality,
                'weekly_seasonality': self.weekly_seasonality,
                'daily_seasonality': self.daily_seasonality,
            }
        }

        # Add detected changepoints
        try:
            changepoints = self.model.changepoints
            if len(changepoints) > 0:
                model_summary['changepoints'] = [
                    str(cp.date()) for cp in changepoints[:10]
                ]
                model_summary['n_changepoints'] = len(changepoints)
        except Exception:
            pass

        # Add seasonalities info
        try:
            model_summary['seasonalities'] = list(self.model.seasonalities.keys())
        except Exception:
            pass

        # Add trend info
        try:
            model_summary['trend'] = {
                'initial': round(float(historical['trend'].iloc[0]), 2),
                'final': round(float(historical['trend'].iloc[-1]), 2),
                'change': round(float(historical['trend'].iloc[-1] - historical['trend'].iloc[0]), 2)
            }
        except Exception:
            pass

        return ForecastOutput(
            predictions=predictions,
            metrics=metrics,
            model_summary=model_summary,
            residuals=residuals
        )

    def get_params(self) -> Dict[str, Any]:
        """Return model parameters"""
        return {
            'changepoint_prior_scale': self.changepoint_prior_scale,
            'seasonality_prior_scale': self.seasonality_prior_scale,
            'seasonality_mode': self.seasonality_mode,
            'yearly_seasonality': self.yearly_seasonality,
            'weekly_seasonality': self.weekly_seasonality,
            'daily_seasonality': self.daily_seasonality,
            'holidays_prior_scale': self.holidays_prior_scale,
            'frequency': self.frequency,
            'confidence_level': self.confidence_level
        }

    @classmethod
    def auto_detect_params(cls, y: pd.Series, frequency: str = "D") -> Dict[str, Any]:
        """Auto-detect optimal Prophet parameters based on data characteristics"""
        forecaster = cls(frequency=frequency)
        y = forecaster._validate_data(y)

        n = len(y)
        params = {}

        # Detect appropriate changepoint_prior_scale
        # More volatile data benefits from higher values
        volatility = np.std(np.diff(y.values)) / np.mean(np.abs(y.values))
        if volatility > 0.1:
            params['changepoint_prior_scale'] = 0.1
        elif volatility > 0.05:
            params['changepoint_prior_scale'] = 0.05
        else:
            params['changepoint_prior_scale'] = 0.01

        # Detect seasonality mode
        if np.all(y > 0):
            # Check if variance increases with level
            mid = n // 2
            first_half_cv = np.std(y[:mid]) / np.mean(y[:mid])
            second_half_cv = np.std(y[mid:]) / np.mean(y[mid:])

            if abs(first_half_cv - second_half_cv) < 0.1:
                params['seasonality_mode'] = 'additive'
            else:
                params['seasonality_mode'] = 'multiplicative'
        else:
            params['seasonality_mode'] = 'additive'

        # Detect yearly seasonality (need at least 2 years of data)
        params['yearly_seasonality'] = n >= 730 if frequency == 'D' else n >= 24 if frequency == 'M' else False

        # Detect weekly seasonality (need at least 2 weeks of data)
        params['weekly_seasonality'] = n >= 14 and frequency == 'D'

        # Daily seasonality (need intraday data - rarely used)
        params['daily_seasonality'] = False

        return params
