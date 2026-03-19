"""
Forecast Celery Tasks - Async execution of forecast jobs

Tasks run synchronously inside Celery workers but wrap the async
ForecastService methods via asyncio.run().  Progress is written to
Redis by the service layer so the frontend can poll /forecast/status/{id}.
"""
import asyncio
import logging
from typing import Dict, Any, List

from app.workers.celery_app import celery_app
from app.services.forecast_service import ForecastService
from app.schemas.forecast import ForecastRequest, BatchForecastRequest

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Run an async coroutine in a fresh event loop (Celery-safe)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    name="forecast.run",
    bind=True,
    max_retries=1,
    default_retry_delay=10,
)
def run_forecast_task(self, tenant_id: str, user_id: str, request_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run a single forecast asynchronously via Celery.

    The caller (API endpoint) creates the initial PENDING result in Redis
    before dispatching this task.  This task picks up from there, runs the
    forecast, and updates Redis with the final result.

    Returns the forecast result dict (also stored in Redis).
    """
    try:
        # Extract the pre-generated forecast_id from the dispatcher
        forecast_id = request_data.pop("_forecast_id", None)
        request = ForecastRequest(**request_data)
        service = ForecastService(tenant_id, user_id)
        result = _run_async(service.run_forecast(request, forecast_id=forecast_id))
        return result.model_dump(mode="json")
    except Exception as exc:
        logger.error(f"Celery forecast task failed: {exc}", exc_info=True)
        raise self.retry(exc=exc)


@celery_app.task(
    name="forecast.run_batch",
    bind=True,
    max_retries=1,
    default_retry_delay=30,
)
def run_batch_forecast_task(
    self,
    tenant_id: str,
    user_id: str,
    request_data: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Run a batch forecast (multiple entities) asynchronously via Celery.

    Each entity is forecasted sequentially inside this single task.
    For true parallelism per entity, the caller can dispatch N individual
    run_forecast_task calls instead.
    """
    try:
        request = BatchForecastRequest(**request_data)
        service = ForecastService(tenant_id, user_id)
        result = _run_async(service.run_batch_forecast(request))
        return result.model_dump(mode="json")
    except Exception as exc:
        logger.error(f"Celery batch forecast task failed: {exc}", exc_info=True)
        raise self.retry(exc=exc)
