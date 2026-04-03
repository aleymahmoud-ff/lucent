"""
Storage backend factory — returns the configured StorageBackend singleton.

The active backend is selected at startup based on environment variables:

    STORAGE_BACKEND=s3     →  S3Backend   (requires S3_BUCKET + credentials)
    STORAGE_BACKEND=local  →  LocalBackend (default, good for development)

The singleton is created on the first call to get_storage_backend() and
reused for the lifetime of the process.  Calling reset_storage_backend()
destroys the singleton (useful for testing).
"""

import logging
from typing import Optional

from app.config import settings

from .base import StorageBackend
from .local_backend import LocalBackend
from .s3_backend import S3Backend

logger = logging.getLogger(__name__)

_storage_backend: Optional[StorageBackend] = None


def get_storage_backend() -> StorageBackend:
    """Return the configured storage backend (singleton).

    Selection logic:
    - If STORAGE_BACKEND == "s3" AND S3_BUCKET is set → S3Backend
    - Otherwise → LocalBackend (safe default for development)

    Returns:
        The active StorageBackend instance.
    """
    global _storage_backend  # noqa: PLW0603

    if _storage_backend is None:
        if settings.STORAGE_BACKEND == "s3" and settings.S3_BUCKET:
            if not settings.S3_ACCESS_KEY or not settings.S3_SECRET_KEY:
                raise ValueError(
                    "S3_ACCESS_KEY and S3_SECRET_KEY must both be set when STORAGE_BACKEND=s3"
                )
            logger.info(
                "Storage: using S3Backend — bucket=%s endpoint=%s",
                settings.S3_BUCKET,
                settings.S3_ENDPOINT_URL or "AWS default",
            )
            _storage_backend = S3Backend(
                bucket=settings.S3_BUCKET,
                access_key=settings.S3_ACCESS_KEY,
                secret_key=settings.S3_SECRET_KEY,
                endpoint_url=settings.S3_ENDPOINT_URL,
                region=settings.S3_REGION,
            )
        else:
            if settings.STORAGE_BACKEND == "s3" and not settings.S3_BUCKET:
                logger.warning(
                    "Storage: STORAGE_BACKEND=s3 but S3_BUCKET is not set — "
                    "falling back to LocalBackend"
                )
            else:
                logger.info(
                    "Storage: using LocalBackend — base_path=%s",
                    settings.LOCAL_STORAGE_PATH,
                )
            _storage_backend = LocalBackend(base_path=settings.LOCAL_STORAGE_PATH)

    return _storage_backend


def reset_storage_backend() -> None:
    """Destroy the singleton so the next call to get_storage_backend() creates a fresh instance.

    Intended for use in tests only.
    """
    global _storage_backend  # noqa: PLW0603
    _storage_backend = None
    logger.debug("Storage backend singleton reset")
