"""
Celery Application - Task queue configuration using Redis as broker/backend
"""
from celery import Celery

from app.config import settings

celery_app = Celery(
    "lucent",
    broker=settings.celery_broker,
    backend=settings.celery_backend,
)

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # Timezone
    timezone="UTC",
    enable_utc=True,

    # Task behaviour
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,

    # Result expiry (1 hour, matching forecast TTL)
    result_expires=3600,

    # Concurrency — keep low to avoid memory spikes from statsmodels / prophet
    worker_concurrency=2,

    # Auto-discover tasks in the workers package
    imports=["app.workers.forecast_tasks"],
)
