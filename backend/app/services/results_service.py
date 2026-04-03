"""
Results Service - Forecast result retrieval, pagination, CSV export, and report generation
"""
import csv
import io
import json
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.redis_client import get_redis
from app.schemas.forecast import (
    ForecastResultResponse,
    MetricsResponse,
    ModelSummaryResponse,
    CrossValidationResultResponse,
    PredictionResponse,
    ForecastStatus,
)

logger = logging.getLogger(__name__)

REDIS_FORECAST_PREFIX = "forecast:"


class ResultsService:
    """Service for retrieving and exporting forecast results stored in Redis"""

    def __init__(self, tenant_id: str, user_id: Optional[str] = None):
        self.tenant_id = tenant_id
        self.user_id = user_id

    # ============================================
    # Core Retrieval
    # ============================================

    async def get_result(
        self, forecast_id: str, db: Optional[AsyncSession] = None
    ) -> Optional[ForecastResultResponse]:
        """
        Two-tier retrieval: try Redis first (fast), fall back to PostgreSQL (permanent).

        Returns None only when neither store has the result.
        """
        # --- Tier 1: Redis (hot cache) ---
        try:
            redis = await get_redis()
            if redis is not None:
                key = f"{REDIS_FORECAST_PREFIX}{forecast_id}"
                raw = await redis.get(key)
                if raw is not None:
                    if isinstance(raw, bytes):
                        raw = raw.decode("utf-8")
                    return ForecastResultResponse(**json.loads(raw))
        except Exception as e:
            logger.error(f"Redis retrieval error for {forecast_id}: {e}")

        # --- Tier 2: PostgreSQL (permanent) ---
        if db is not None:
            try:
                result = await self._get_result_from_db(db, forecast_id)
                if result is not None:
                    # Re-populate Redis cache for subsequent fast access
                    try:
                        redis = await get_redis()
                        if redis:
                            key = f"{REDIS_FORECAST_PREFIX}{forecast_id}"
                            data = result.model_dump(mode='json')
                            await redis.set(key, json.dumps(data, default=str), ex=3600)
                    except Exception:
                        pass  # Cache repopulation is best-effort
                    return result
            except Exception as e:
                logger.error(f"DB retrieval error for {forecast_id}: {e}")

        return None

    async def _get_result_from_db(
        self, db: AsyncSession, forecast_id: str
    ) -> Optional[ForecastResultResponse]:
        """Reconstruct a ForecastResultResponse from PostgreSQL records."""
        from app.models import ForecastHistory, ForecastPrediction

        # Load forecast history
        history = await db.scalar(
            select(ForecastHistory).where(
                ForecastHistory.id == forecast_id,
                ForecastHistory.tenant_id == self.tenant_id,
            )
        )
        if history is None:
            return None

        # Load predictions for this forecast
        pred_result = await db.execute(
            select(ForecastPrediction).where(
                ForecastPrediction.forecast_history_id == forecast_id,
                ForecastPrediction.tenant_id == self.tenant_id,
            )
        )
        db_predictions = pred_result.scalars().all()

        # Pick the first prediction to reconstruct the response
        # (single forecast = 1 prediction, batch = multiple)
        predictions = []
        metrics = None
        model_summary = None
        cv_results = None
        entity_id = history.entity_id or "unknown"

        if db_predictions:
            pred = db_predictions[0]
            entity_id = pred.entity_id
            predictions = [
                PredictionResponse(**p)
                for p in (pred.predicted_values or [])
            ]
            if pred.metrics:
                metrics = MetricsResponse(**pred.metrics)
            if pred.model_summary:
                model_summary = ModelSummaryResponse(**pred.model_summary)
            if pred.cv_results:
                cv_results = CrossValidationResultResponse(**pred.cv_results)

        return ForecastResultResponse(
            id=history.id,
            dataset_id=history.dataset_id,
            entity_id=entity_id,
            method=history.method.value if history.method else "arima",
            status=ForecastStatus(history.status.value) if history.status else ForecastStatus.COMPLETED,
            progress=100 if history.status and history.status.value == "completed" else 0,
            predictions=predictions,
            metrics=metrics,
            model_summary=model_summary,
            cv_results=cv_results,
            created_at=history.created_at,
            completed_at=history.completed_at,
        )

    # ============================================
    # Paginated Predictions
    # ============================================

    def paginate_predictions(
        self,
        predictions: List[PredictionResponse],
        page: int,
        page_size: int,
    ) -> Tuple[List[PredictionResponse], int, int, int]:
        """
        Return a page of predictions and pagination metadata.

        Returns:
            (page_items, total_items, total_pages, current_page)
        """
        total = len(predictions)
        total_pages = max(1, (total + page_size - 1) // page_size)
        page = max(1, min(page, total_pages))

        start = (page - 1) * page_size
        end = start + page_size
        page_items = predictions[start:end]

        return page_items, total, total_pages, page

    # ============================================
    # CSV Generation
    # ============================================

    def generate_csv(
        self,
        result: ForecastResultResponse,
    ) -> str:
        """
        Convert forecast predictions to CSV string content.

        Columns: date, value, lower_bound, upper_bound
        """
        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow(["date", "value", "lower_bound", "upper_bound"])

        for pred in result.predictions:
            writer.writerow([
                pred.date,
                pred.value,
                pred.lower_bound,
                pred.upper_bound,
            ])

        return output.getvalue()

    def get_csv_filename(self, result: ForecastResultResponse) -> str:
        """Build a descriptive filename for the CSV download."""
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        entity = result.entity_id.replace(" ", "_")
        return f"forecast_{entity}_{result.method.value}_{ts}.csv"

    # ============================================
    # Export Report
    # ============================================

    def generate_export_report(self, result: ForecastResultResponse) -> Dict[str, Any]:
        """
        Build a JSON-serialisable export report containing all result data.

        The report includes metadata, predictions, metrics, model summary,
        and cross-validation results (when available).
        """
        report: Dict[str, Any] = {
            "export_metadata": {
                "exported_at": datetime.utcnow().isoformat(),
                "forecast_id": result.id,
                "tenant_id": self.tenant_id,
                "user_id": self.user_id,
            },
            "forecast_info": {
                "id": result.id,
                "dataset_id": result.dataset_id,
                "entity_id": result.entity_id,
                "method": result.method.value,
                "status": result.status.value,
                "created_at": result.created_at.isoformat() if result.created_at else None,
                "completed_at": result.completed_at.isoformat() if result.completed_at else None,
            },
            "predictions": [
                {
                    "date": pred.date,
                    "value": pred.value,
                    "lower_bound": pred.lower_bound,
                    "upper_bound": pred.upper_bound,
                }
                for pred in result.predictions
            ],
            "metrics": result.metrics.model_dump() if result.metrics else None,
            "model_summary": result.model_summary.model_dump() if result.model_summary else None,
            "cv_results": result.cv_results.model_dump() if result.cv_results else None,
            "summary": {
                "total_predictions": len(result.predictions),
                "has_confidence_intervals": True,
                "has_metrics": result.metrics is not None,
                "has_cv_results": result.cv_results is not None,
            },
        }
        return report
