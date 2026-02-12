"""
Base Forecaster - Abstract base class for all forecasting methods
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass
import pandas as pd
import numpy as np


@dataclass
class ForecastOutput:
    """Output container for forecast results"""
    predictions: pd.DataFrame  # Columns: date, value, lower_bound, upper_bound
    metrics: Dict[str, float]  # MAE, RMSE, MAPE, etc.
    model_summary: Dict[str, Any]  # Method-specific summary
    residuals: Optional[np.ndarray] = None


class BaseForecaster(ABC):
    """Abstract base class for all forecasting methods"""

    def __init__(self, frequency: str = "D", confidence_level: float = 0.95):
        """
        Initialize the forecaster.

        Args:
            frequency: Data frequency ('D' for daily, 'W' for weekly, 'M' for monthly)
            confidence_level: Confidence level for prediction intervals (0.5 to 0.99)
        """
        self.frequency = frequency
        self.confidence_level = confidence_level
        self.model = None
        self.is_fitted = False
        self._training_data = None

    @abstractmethod
    def fit(self, y: pd.Series, exog: Optional[pd.DataFrame] = None) -> None:
        """
        Fit the model to the time series data.

        Args:
            y: Time series data with DatetimeIndex
            exog: Optional exogenous variables
        """
        pass

    @abstractmethod
    def predict(self, horizon: int, exog: Optional[pd.DataFrame] = None) -> ForecastOutput:
        """
        Generate predictions for the given horizon.

        Args:
            horizon: Number of periods to forecast
            exog: Optional exogenous variables for forecast period

        Returns:
            ForecastOutput with predictions, metrics, and model summary
        """
        pass

    @abstractmethod
    def get_params(self) -> Dict[str, Any]:
        """Return the model parameters"""
        pass

    @classmethod
    @abstractmethod
    def auto_detect_params(cls, y: pd.Series, frequency: str = "D") -> Dict[str, Any]:
        """
        Auto-detect optimal parameters for the data.

        Args:
            y: Time series data
            frequency: Data frequency

        Returns:
            Dictionary of recommended parameters
        """
        pass

    def _validate_data(self, y: pd.Series) -> pd.Series:
        """Validate and prepare input data"""
        if y is None or len(y) == 0:
            raise ValueError("Input data cannot be empty")

        # Ensure it's a pandas Series
        if not isinstance(y, pd.Series):
            y = pd.Series(y)

        # Drop NaN values
        y = y.dropna()

        if len(y) < 10:
            raise ValueError("Need at least 10 data points for forecasting")

        return y

    def _create_future_dates(self, last_date: pd.Timestamp, horizon: int) -> pd.DatetimeIndex:
        """Create future date index based on frequency"""
        freq_map = {
            "D": "D",
            "W": "W",
            "M": "MS",
            "Q": "QS",
            "Y": "YS"
        }
        freq = freq_map.get(self.frequency, "D")
        return pd.date_range(start=last_date + pd.Timedelta(days=1), periods=horizon, freq=freq)

    def _calculate_metrics(self, y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
        """Calculate forecast accuracy metrics"""
        from .metrics import calculate_all_metrics
        return calculate_all_metrics(y_true, y_pred)
