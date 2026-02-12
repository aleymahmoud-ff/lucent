"""
Forecast Metrics - Calculate forecast accuracy metrics
"""
import numpy as np
from typing import Dict


def calculate_all_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    """
    Calculate all forecast accuracy metrics.

    Args:
        y_true: Actual values
        y_pred: Predicted values

    Returns:
        Dictionary with MAE, RMSE, MAPE, MSE, R2
    """
    # Convert to numpy arrays and flatten
    y_true = np.asarray(y_true).flatten()
    y_pred = np.asarray(y_pred).flatten()

    # Remove NaN values
    mask = ~(np.isnan(y_true) | np.isnan(y_pred))
    y_true = y_true[mask]
    y_pred = y_pred[mask]

    n = len(y_true)
    if n == 0:
        return {
            "mae": 0.0,
            "rmse": 0.0,
            "mape": 0.0,
            "mse": 0.0,
            "r2": 0.0
        }

    # Calculate errors
    errors = y_true - y_pred

    # MAE - Mean Absolute Error
    mae = float(np.mean(np.abs(errors)))

    # MSE - Mean Squared Error
    mse = float(np.mean(errors ** 2))

    # RMSE - Root Mean Squared Error
    rmse = float(np.sqrt(mse))

    # MAPE - Mean Absolute Percentage Error (avoid division by zero)
    with np.errstate(divide='ignore', invalid='ignore'):
        mape_values = np.abs(errors / y_true) * 100
        # Filter out infinite values
        mape_values = mape_values[~np.isinf(mape_values)]
        mape = float(np.mean(mape_values)) if len(mape_values) > 0 else 0.0

    # R-squared (coefficient of determination)
    ss_res = np.sum(errors ** 2)
    ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
    r2 = float(1 - (ss_res / ss_tot)) if ss_tot > 0 else 0.0

    return {
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "mape": round(mape, 2),
        "mse": round(mse, 4),
        "r2": round(r2, 4)
    }


def mean_absolute_error(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Calculate Mean Absolute Error"""
    return float(np.mean(np.abs(np.asarray(y_true) - np.asarray(y_pred))))


def root_mean_squared_error(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Calculate Root Mean Squared Error"""
    return float(np.sqrt(np.mean((np.asarray(y_true) - np.asarray(y_pred)) ** 2)))


def mean_absolute_percentage_error(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Calculate Mean Absolute Percentage Error"""
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)

    with np.errstate(divide='ignore', invalid='ignore'):
        mape = np.abs((y_true - y_pred) / y_true) * 100
        mape = mape[~np.isinf(mape)]
        return float(np.mean(mape)) if len(mape) > 0 else 0.0
