"""
Abstract storage backend interface.

All storage implementations (S3, local filesystem, etc.) must inherit from
StorageBackend and implement every abstract method.

Expected key structure:
    {tenant_id}/working/{dataset_id}.parquet
    {tenant_id}/snapshots/{sha256hash}.parquet.gz
    {tenant_id}/exports/{export_id}.csv
"""

import logging
from abc import ABC, abstractmethod
from typing import Optional

logger = logging.getLogger(__name__)


class StorageBackend(ABC):
    """Abstract storage backend for file operations."""

    # ------------------------------------------------------------------
    # Core file operations
    # ------------------------------------------------------------------

    @abstractmethod
    async def upload(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload data to storage.

        Args:
            key: Object key / file path (e.g. "tenant_id/working/dataset.parquet").
            data: Raw bytes to store.
            content_type: MIME type of the payload.

        Returns:
            The key that was stored (same as the input key).
        """
        ...

    @abstractmethod
    async def download(self, key: str) -> bytes:
        """Download data from storage.

        Args:
            key: Object key to retrieve.

        Returns:
            Raw bytes of the stored object.

        Raises:
            FileNotFoundError: If the key does not exist.
        """
        ...

    @abstractmethod
    async def delete(self, key: str) -> bool:
        """Delete a file from storage.

        Args:
            key: Object key to delete.

        Returns:
            True if the file was deleted, False if it did not exist.
        """
        ...

    @abstractmethod
    async def exists(self, key: str) -> bool:
        """Check if a file exists in storage.

        Args:
            key: Object key to check.

        Returns:
            True if the key exists, False otherwise.
        """
        ...

    @abstractmethod
    async def get_url(self, key: str, expires_in: int = 3600) -> Optional[str]:
        """Get a URL for accessing the file.

        For S3 backends this returns a presigned URL that expires.
        For the local backend this returns the absolute file path.

        Args:
            key: Object key.
            expires_in: URL lifetime in seconds (S3 only).

        Returns:
            URL string, or None if the key does not exist.
        """
        ...

    @abstractmethod
    async def list_keys(self, prefix: str) -> list[str]:
        """List all keys with the given prefix.

        Args:
            prefix: Key prefix to filter by (e.g. "tenant_id/working/").

        Returns:
            Sorted list of matching keys.
        """
        ...
