"""
ForecastPrediction Model - Permanent per-entity forecast results.
Stores the full output (predictions, metrics, model summary, CV results) for
each entity within a forecast run so results are queryable and auditable.
"""
from sqlalchemy import Column, String, JSON, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import uuid

from app.db.database import Base


class ForecastPrediction(Base):
    __tablename__ = "forecast_predictions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    forecast_history_id = Column(String(36), ForeignKey("forecast_history.id", ondelete="CASCADE"), nullable=False, index=True)

    # The entity this prediction belongs to
    entity_id = Column(String(255), nullable=False)
    entity_name = Column(String(255), nullable=True)

    # Full time-series output — list of dicts:
    # [{"date": "2026-01-01", "value": 42.3, "lower_bound": 38.1, "upper_bound": 46.5}, ...]
    predicted_values = Column(JSON, nullable=False)

    # Accuracy metrics — all keys optional depending on method:
    # {"mae": 1.2, "rmse": 1.8, "mape": 3.5, "mse": 3.24, "r2": 0.92, "aic": -120.4, "bic": -115.1}
    metrics = Column(JSON, nullable=True)

    # Fitted model information for explainability:
    # {"method": "arima", "parameters": {"p": 2, "d": 1, "q": 1}, "coefficients": {...}}
    model_summary = Column(JSON, nullable=True)

    # Cross-validation results when CV was requested:
    # {"folds": 5, "method": "rolling", "metrics_per_fold": [...], "average_metrics": {...}}
    cv_results = Column(JSON, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())

    # Relationships
    forecast_run = relationship("ForecastHistory", back_populates="predictions")

    __table_args__ = (
        Index("ix_forecast_predictions_history_tenant", "forecast_history_id", "tenant_id"),
    )

    def __repr__(self):
        return f"<ForecastPrediction(id={self.id}, entity_id={self.entity_id}, forecast_history_id={self.forecast_history_id})>"
