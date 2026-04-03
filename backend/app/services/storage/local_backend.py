"""
Local filesystem storage backend — intended for development and testing only.

Files are stored under:
    {base_path}/{key}

Sub-directories inside base_path are created on demand.
aiofiles is used for all file I/O so the event loop is never blocked.
"""

import asyncio
import logging
import os
from pathlib import Path
from typing import Optional

import aiofiles

from .base import StorageBackend

logger = logging.getLogger(__name__)


class LocalBackend(StorageBackend):
    """Storage backend that writes files to the local filesystem."""

    def __init__(self, base_path: str = "./storage") -> None:
        """Initialise the local backend.

        Args:
            base_path: Root directory for all stored files.
                       Created automatically if it does not exist.
        """
        self._base = Path(base_path).resolve()
        self._base.mkdir(parents=True, exist_ok=True)
        logger.info("LocalBackend initialised — base_path=%s", self._base)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _full_path(self, key: str) -> Path:
        """Resolve the absolute path for *key*, staying inside base_path."""
        safe_key = key.lstrip("/\\")
        full = self._base / safe_key
        # Resolve the parent to catch dot-dot traversal even when file doesn't exist yet.
        # The parent directory may not exist either, so resolve the longest existing ancestor.
        resolved = full.resolve() if full.exists() else (self._base / safe_key).resolve()
        if not str(resolved).startswith(str(self._base)):
            raise ValueError(f"Path traversal detected in storage key: {key!r}")
        return full

    # ------------------------------------------------------------------
    # Async interface (StorageBackend contract)
    # ------------------------------------------------------------------

    async def upload(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",  # noqa: ARG002
    ) -> str:
        """Write *data* to disk at the path derived from *key*.

        content_type is accepted for interface compatibility but not used by
        the local backend.
        """
        path = self._full_path(key)
        # Create parent directories if needed
        await asyncio.to_thread(path.parent.mkdir, parents=True, exist_ok=True)

        async with aiofiles.open(path, mode="wb") as fh:
            await fh.write(data)

        logger.debug("LocalBackend upload OK — key=%s path=%s bytes=%d", key, path, len(data))
        return key

    async def download(self, key: str) -> bytes:
        """Read and return the raw bytes stored at *key*."""
        path = self._full_path(key)
        if not path.is_file():
            raise FileNotFoundError(f"Local storage key not found: '{key}' (path={path})")

        async with aiofiles.open(path, mode="rb") as fh:
            data: bytes = await fh.read()

        logger.debug("LocalBackend download OK — key=%s bytes=%d", key, len(data))
        return data

    async def delete(self, key: str) -> bool:
        """Remove the file at *key*.  Returns True if it existed."""
        path = self._full_path(key)
        if not path.is_file():
            logger.debug("LocalBackend delete — key=%s did not exist", key)
            return False

        await asyncio.to_thread(path.unlink)
        logger.debug("LocalBackend delete OK — key=%s", key)
        return True

    async def exists(self, key: str) -> bool:
        """Return True if the file at *key* exists on disk."""
        path = self._full_path(key)
        return await asyncio.to_thread(path.is_file)

    async def get_url(self, key: str, expires_in: int = 3600) -> Optional[str]:
        """Return the absolute file path as a string.

        expires_in is accepted for interface compatibility but is not used by
        the local backend — local paths do not expire.
        """
        path = self._full_path(key)
        if not await self.exists(key):
            return None
        return str(path)

    async def list_keys(self, prefix: str) -> list[str]:
        """Return a sorted list of all keys whose path starts with *prefix*."""

        def _walk() -> list[str]:
            safe_prefix = prefix.lstrip("/\\")
            search_root = self._base / safe_prefix

            # If the prefix names a directory, walk it; otherwise glob the
            # parent directory using the last path component as a pattern.
            if search_root.is_dir():
                glob_root = search_root
                glob_pattern = "**/*"
            else:
                glob_root = search_root.parent
                glob_pattern = f"{search_root.name}*/**/*" if search_root.parent.is_dir() else "**/*"
                # Simpler: just walk from base and filter by prefix string
                glob_root = self._base
                glob_pattern = "**/*"

            keys: list[str] = []
            for abs_path in glob_root.glob(glob_pattern):
                if abs_path.is_file():
                    rel = abs_path.relative_to(self._base).as_posix()
                    if rel.startswith(safe_prefix):
                        keys.append(rel)
            return sorted(keys)

        result = await asyncio.to_thread(_walk)
        logger.debug("LocalBackend list_keys — prefix=%s found=%d", prefix, len(result))
        return result
