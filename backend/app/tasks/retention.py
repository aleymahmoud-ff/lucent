"""
Data Retention Celery Task — daily cleanup of expired DataSnapshot records.

Design decisions:
- Celery workers are synchronous; async storage methods are invoked through a
  fresh event loop (same pattern used in forecast_tasks.py).
- A synchronous SQLAlchemy engine is constructed from DATABASE_URL by replacing
  the asyncpg driver prefix with psycopg2, so we never block the event loop in
  the worker process.
- Snapshots are processed in configurable batches to avoid memory spikes.
- Each individual deletion is wrapped in try/except so one failure does not
  prevent the remaining snapshots from being processed.
- forecast_history and forecast_predictions are NEVER touched — only
  DataSnapshot rows and their backing storage objects are mutated.
- The task is idempotent: a snapshot whose status is already EXPIRED (or whose
  storage file has already been deleted manually) is handled safely.

Schedule: daily at 03:00 UTC (configured in celery_app.py beat_schedule).
"""

import asyncio
import logging
from datetime import datetime, timezone

from celery import Task
from sqlalchemy import create_engine, select, update
from sqlalchemy.orm import sessionmaker, Session

from app.config import settings
from app.models import DataSnapshot, SnapshotStatus
from app.services.storage import get_storage_backend
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Synchronous DB engine (Celery tasks are sync)
# ---------------------------------------------------------------------------

def _build_sync_database_url() -> str:
    """Convert the async DATABASE_URL to a synchronous one.

    Replaces the asyncpg driver prefix used by SQLAlchemy async engine with
    the standard psycopg2 driver so it can be used inside a Celery worker.

    Examples:
        postgresql+asyncpg://user:pass@host/db  ->  postgresql://user:pass@host/db
        asyncpg://user:pass@host/db             ->  postgresql://user:pass@host/db
    """
    url = settings.DATABASE_URL
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql://", 1)
    if url.startswith("asyncpg://"):
        return url.replace("asyncpg://", "postgresql://", 1)
    # Already a sync URL or unknown scheme — use as-is.
    return url


def _get_sync_session_factory() -> sessionmaker:
    """Create a one-off synchronous SQLAlchemy sessionmaker for the worker.

    The engine is created fresh each time the task runs to avoid holding idle
    connections between scheduled runs.
    """
    sync_url = _build_sync_database_url()
    engine = create_engine(
        sync_url,
        pool_size=2,
        max_overflow=0,
        pool_pre_ping=True,
        future=True,
    )
    return sessionmaker(bind=engine, autocommit=False, autoflush=False)


# ---------------------------------------------------------------------------
# Async helpers (storage operations go through the existing S3Backend)
# ---------------------------------------------------------------------------

def _run_async(coro):
    """Run an async coroutine in a fresh event loop (Celery-safe).

    Mirrors the pattern already used in app/workers/forecast_tasks.py.
    """
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _delete_storage_file(s3_key: str) -> bool:
    """Attempt to delete the backing storage file for a snapshot.

    Returns:
        True  — file was present and deleted (or already absent — idempotent).
        False — deletion raised an unexpected error (caller logs and continues).
    """
    storage = get_storage_backend()
    try:
        deleted = await storage.delete(s3_key)
        if deleted:
            logger.debug("Storage file deleted: key=%s", s3_key)
        else:
            # File was already gone — treat as success (idempotent).
            logger.debug("Storage file not found (already removed): key=%s", s3_key)
        return True
    except Exception as exc:
        logger.error("Storage delete failed: key=%s error=%s", s3_key, exc)
        return False


# ---------------------------------------------------------------------------
# Core batch processor
# ---------------------------------------------------------------------------

def _process_batch(session: Session, batch: list[DataSnapshot]) -> tuple[int, int]:
    """Process a single batch of expired snapshots.

    For each snapshot:
        1. Delete the backing storage file (S3 or local).
        2. Mark the DataSnapshot row as EXPIRED.
        3. Log the outcome.

    forecast_history and forecast_predictions are never touched.

    Returns:
        (expired_count, failed_count) for this batch.
    """
    expired_count = 0
    failed_count = 0

    for snapshot in batch:
        try:
            # Step 1 — delete storage file (runs async storage backend in sync context)
            storage_ok = _run_async(_delete_storage_file(snapshot.s3_key))

            if not storage_ok:
                # Storage error — skip DB update so we can retry on next run.
                failed_count += 1
                logger.warning(
                    "Skipping DB update for snapshot id=%s due to storage error key=%s",
                    snapshot.id,
                    snapshot.s3_key,
                )
                continue

            # Step 2 — mark snapshot EXPIRED in DB
            snapshot.status = SnapshotStatus.EXPIRED
            snapshot.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            session.flush()

            # Step 3 — log success
            logger.info(
                "Expired snapshot deleted: id=%s key=%s tenant=%s",
                snapshot.id,
                snapshot.s3_key,
                snapshot.tenant_id,
            )
            expired_count += 1

        except Exception as exc:
            # One bad snapshot must not block the rest.
            failed_count += 1
            logger.error(
                "Retention: unexpected error processing snapshot id=%s: %s",
                snapshot.id,
                exc,
                exc_info=True,
            )

    return expired_count, failed_count


# ---------------------------------------------------------------------------
# Celery task
# ---------------------------------------------------------------------------

@celery_app.task(
    name="app.tasks.retention.cleanup_expired_snapshots",
    bind=True,
    max_retries=0,           # Beat tasks should not auto-retry; let the next schedule handle it.
    ignore_result=True,      # No caller waiting on the result.
    soft_time_limit=1800,    # 30 minutes — warn before hard kill.
    time_limit=2100,         # 35 minutes — hard kill.
)
def cleanup_expired_snapshots(self: Task) -> None:
    """Daily retention cleanup: delete expired DataSnapshot files from storage.

    Query criteria for "expired":
        - status = READY            (never re-process already-expired rows)
        - expires_at IS NOT NULL    (null means "never expire")
        - expires_at < UTC now      (the retention window has passed)

    Processing:
        - Snapshots are loaded in batches of RETENTION_BATCH_SIZE (default 100).
        - Each snapshot's backing storage file is deleted first; then the DB row
          status is updated to EXPIRED.
        - forecast_history and forecast_predictions are untouched.

    Idempotency:
        - Running the task twice is safe: the query filters on status=READY, so
          already-expired rows are skipped automatically.
        - If a storage file is already gone, the storage backend returns False
          (not an error) and the DB row is still marked EXPIRED.
    """
    logger.info("Retention cleanup task started.")

    batch_size = settings.RETENTION_BATCH_SIZE
    now = datetime.utcnow()

    SessionLocal = _get_sync_session_factory()
    session: Session = SessionLocal()

    total_expired = 0
    total_failed = 0
    total_skipped = 0
    batch_offset = 0

    try:
        while True:
            # Query the next batch of candidates.
            candidates = (
                session.execute(
                    select(DataSnapshot)
                    .where(
                        DataSnapshot.status == SnapshotStatus.READY,
                        DataSnapshot.expires_at.is_not(None),
                        DataSnapshot.expires_at < now,
                    )
                    .order_by(DataSnapshot.expires_at)
                    .limit(batch_size)
                    .offset(batch_offset)
                )
                .scalars()
                .all()
            )

            if not candidates:
                break

            logger.info(
                "Retention: processing batch offset=%d size=%d",
                batch_offset,
                len(candidates),
            )

            expired, failed = _process_batch(session, candidates)
            session.commit()

            total_expired += expired
            total_failed += failed
            # Snapshots that failed storage deletion are not marked EXPIRED, so
            # they will reappear in the next batch query — we must advance the
            # offset by the full batch to avoid an infinite loop on persistent
            # storage errors.
            if failed > 0:
                batch_offset += failed
            # Only advance offset if we've processed fewer than a full batch,
            # meaning there are no more rows. If we got a full batch, re-query
            # from offset 0 because committed rows are no longer status=READY.
            if len(candidates) < batch_size:
                break
            # Full batch was committed (all expired) — next query from offset 0
            # because those rows are now EXPIRED and won't appear again.
            # Adjust only for failed rows that still sit at READY status.
            batch_offset = failed

    except Exception as exc:
        session.rollback()
        logger.error("Retention cleanup task failed with unhandled error: %s", exc, exc_info=True)
        raise
    finally:
        session.close()

    logger.info(
        "Retention cleanup complete: %d expired, %d failed, %d skipped",
        total_expired,
        total_failed,
        total_skipped,
    )
