"""
Storage service package — abstract file storage with S3 and local filesystem backends.

Usage:
    from app.services.storage import StorageBackend, get_storage_backend

    backend = get_storage_backend()
    key = await backend.upload("tenant_id/working/dataset.parquet", data, "application/octet-stream")
    data = await backend.download("tenant_id/working/dataset.parquet")
"""

from .base import StorageBackend
from .factory import get_storage_backend

__all__ = ["StorageBackend", "get_storage_backend"]
