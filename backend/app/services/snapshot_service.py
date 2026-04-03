"""
Snapshot Service - DataFrame snapshot management.

Compresses a pandas DataFrame to parquet+gzip, uploads it to S3 (or the
configured storage backend), and records a DataSnapshot row in PostgreSQL.

Key guarantees:
- SHA-256 deduplication: identical DataFrames reuse the same snapshot.
- Status transitions: PENDING → UPLOADING → READY (FAILED on error).
- Async-safe: all pandas/pyarrow operations are offloaded via asyncio.to_thread().
"""
import asyncio
import hashlib
import io
import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DataSnapshot, SnapshotStatus
from app.services.storage import get_storage_backend

logger = logging.getLogger(__name__)


class SnapshotService:
    """Manages creation and retrieval of DataFrame snapshots backed by S3."""

    def __init__(self, tenant_id: str, user_id: Optional[str] = None):
        self.tenant_id = tenant_id
        self.user_id = user_id

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def create_snapshot(
        self,
        df: pd.DataFrame,
        db: AsyncSession,
        dataset_id: Optional[str] = None,
        connector_data_source_id: Optional[str] = None,
        retention_days: Optional[int] = None,
    ) -> DataSnapshot:
        """
        Snapshot a DataFrame to storage and persist the metadata in DB.

        Steps:
        1. Compute SHA-256 hash of the (sorted) DataFrame.
        2. Check for an existing READY snapshot with the same tenant + hash.
           If found, return it immediately (deduplication).
        3. Create a DataSnapshot record in PENDING state.
        4. Compress DataFrame → parquet + gzip in a thread.
        5. Upload to storage (key: ``{tenant_id}/snapshots/{hash}.parquet.gz``).
        6. Update status → READY, store row/column counts and file size.
        7. Return the DataSnapshot ORM object.

        The DB session is passed in by the caller; this method calls
        ``db.flush()`` but never ``db.commit()``.

        Args:
            df: DataFrame to snapshot.
            db: Active async database session.
            dataset_id: Optional source dataset UUID.
            connector_data_source_id: Optional connector recipe UUID.
            retention_days: If provided, the snapshot will expire after this
                many days and will be deleted by the daily retention task.
                Pass ``None`` (default) for a snapshot that never expires.
        """
        data_hash = await asyncio.to_thread(self.compute_data_hash, df)
        s3_key = f"{self.tenant_id}/snapshots/{data_hash}.parquet.gz"

        # --- Deduplication check ---
        existing = await self._find_existing_snapshot(db, data_hash)
        if existing is not None:
            logger.info(
                "Snapshot dedup hit — reusing snapshot id=%s hash=%s",
                existing.id,
                data_hash,
            )
            return existing

        # --- Compute expiry date ---
        expiry_date = self.calculate_expiry(retention_days)

        # --- Create PENDING record ---
        snapshot = DataSnapshot(
            id=str(uuid.uuid4()),
            tenant_id=self.tenant_id,
            dataset_id=dataset_id,
            connector_data_source_id=connector_data_source_id,
            s3_key=s3_key,
            data_hash=data_hash,
            row_count=len(df),
            column_count=len(df.columns),
            compression="gzip",
            format="parquet",
            status=SnapshotStatus.PENDING,
            created_by=self.user_id,
            expires_at=expiry_date,
        )
        db.add(snapshot)
        await db.flush()

        # --- Compress in thread ---
        try:
            snapshot.status = SnapshotStatus.UPLOADING
            await db.flush()

            parquet_bytes = await asyncio.to_thread(self._compress_to_parquet_gz, df)

            # --- Upload ---
            storage = get_storage_backend()
            await storage.upload(
                key=s3_key,
                data=parquet_bytes,
                content_type="application/octet-stream",
            )

            snapshot.status = SnapshotStatus.READY
            snapshot.file_size_bytes = len(parquet_bytes)
            await db.flush()

            logger.info(
                "Snapshot created: id=%s key=%s rows=%d size_bytes=%d",
                snapshot.id,
                s3_key,
                len(df),
                len(parquet_bytes),
            )

        except Exception as exc:
            logger.error("Snapshot upload failed for key=%s: %s", s3_key, exc)
            snapshot.status = SnapshotStatus.FAILED
            await db.flush()
            raise

        return snapshot

    async def get_snapshot_data(self, snapshot: DataSnapshot) -> pd.DataFrame:
        """Download a snapshot from storage and return it as a DataFrame."""
        storage = get_storage_backend()
        raw_bytes = await storage.download(snapshot.s3_key)
        df = await asyncio.to_thread(self._decompress_parquet_gz, raw_bytes)
        return df

    # ------------------------------------------------------------------
    # Static / class helpers
    # ------------------------------------------------------------------

    @staticmethod
    def compute_data_hash(df: pd.DataFrame) -> str:
        """
        Compute a stable SHA-256 hash of a DataFrame for deduplication.

        The DataFrame is normalised (columns and rows sorted) before hashing
        so that the same logical data always produces the same hash regardless
        of column or row ordering.
        """
        # Sort for stability: columns first, then rows
        normalised = df.reindex(sorted(df.columns), axis=1)
        normalised = normalised.sort_values(by=list(normalised.columns)).reset_index(drop=True)
        data_bytes = normalised.to_json(orient="records").encode("utf-8")
        return hashlib.sha256(data_bytes).hexdigest()

    def calculate_expiry(self, retention_days: Optional[int]) -> Optional[datetime]:
        """
        Return expiry datetime given a retention period.

        Args:
            retention_days: Number of days from now. Pass None for "never expire".

        Returns:
            ``datetime`` of expiry, or ``None`` to keep the snapshot indefinitely.
        """
        if retention_days is None:
            return None
        return datetime.utcnow() + timedelta(days=retention_days)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _find_existing_snapshot(
        self,
        db: AsyncSession,
        data_hash: str,
    ) -> Optional[DataSnapshot]:
        """Query DB for a READY snapshot matching tenant_id + data_hash."""
        result = await db.execute(
            select(DataSnapshot).where(
                DataSnapshot.tenant_id == self.tenant_id,
                DataSnapshot.data_hash == data_hash,
                DataSnapshot.status == SnapshotStatus.READY,
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    def _compress_to_parquet_gz(df: pd.DataFrame) -> bytes:
        """Serialise a DataFrame to parquet with gzip compression; return raw bytes."""
        buffer = io.BytesIO()
        df.to_parquet(buffer, engine="pyarrow", compression="gzip", index=True)
        return buffer.getvalue()

    @staticmethod
    def _decompress_parquet_gz(raw_bytes: bytes) -> pd.DataFrame:
        """Read a gzip-compressed parquet byte stream back into a DataFrame."""
        buffer = io.BytesIO(raw_bytes)
        return pd.read_parquet(buffer, engine="pyarrow")
