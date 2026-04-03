"""
S3 storage backend — uses boto3 (synchronous), wrapped in asyncio.to_thread.

Compatible with AWS S3 and any S3-compatible object store (e.g. CranL Storage).

CranL endpoint format:  https://storage-{bucket-name}.cranl.net
"""

import asyncio
import logging
from typing import Optional

import boto3
import botocore.exceptions

from .base import StorageBackend

logger = logging.getLogger(__name__)


class S3Backend(StorageBackend):
    """Storage backend backed by an S3-compatible object store."""

    def __init__(
        self,
        bucket: str,
        access_key: str,
        secret_key: str,
        endpoint_url: Optional[str] = None,
        region: str = "us-east-1",
    ) -> None:
        """Initialise the S3 backend.

        Args:
            bucket: Name of the S3 bucket.
            access_key: AWS / CranL access key ID.
            secret_key: AWS / CranL secret access key.
            endpoint_url: Custom endpoint for S3-compatible stores
                          (e.g. "https://storage-lucent-data.cranl.net").
                          Leave as None for standard AWS S3.
            region: AWS region name (default "us-east-1").
        """
        self._bucket = bucket
        self._access_key = access_key
        self._secret_key = secret_key
        self._endpoint_url = endpoint_url
        self._region = region

        # Build the client once at construction time.  boto3 clients are
        # thread-safe for reads; we create a single instance and reuse it
        # inside asyncio.to_thread calls.
        self._client = boto3.client(
            "s3",
            aws_access_key_id=self._access_key,
            aws_secret_access_key=self._secret_key,
            region_name=self._region,
            **({"endpoint_url": self._endpoint_url} if self._endpoint_url else {}),
        )

        logger.info(
            "S3Backend initialised — bucket=%s endpoint=%s region=%s",
            self._bucket,
            self._endpoint_url or "AWS default",
            self._region,
        )

    # ------------------------------------------------------------------
    # Synchronous helpers (executed inside asyncio.to_thread)
    # ------------------------------------------------------------------

    def _sync_upload(self, key: str, data: bytes, content_type: str) -> str:
        """PUT an object into S3."""
        try:
            self._client.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            )
            logger.debug("S3 upload OK — bucket=%s key=%s bytes=%d", self._bucket, key, len(data))
            return key
        except botocore.exceptions.ClientError as exc:
            code = exc.response["Error"]["Code"]
            logger.error("S3 upload failed — key=%s code=%s", key, code)
            raise RuntimeError(f"S3 upload failed for key '{key}': {code}") from exc

    def _sync_download(self, key: str) -> bytes:
        """GET an object from S3 and return its body as bytes."""
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=key)
            data: bytes = response["Body"].read()
            logger.debug("S3 download OK — bucket=%s key=%s bytes=%d", self._bucket, key, len(data))
            return data
        except botocore.exceptions.ClientError as exc:
            code = exc.response["Error"]["Code"]
            if code in ("NoSuchKey", "404"):
                raise FileNotFoundError(f"S3 key not found: '{key}'") from exc
            logger.error("S3 download failed — key=%s code=%s", key, code)
            raise RuntimeError(f"S3 download failed for key '{key}': {code}") from exc

    def _sync_delete(self, key: str) -> bool:
        """Delete an object from S3.  Returns True if it existed."""
        try:
            # Check existence first so we can return an accurate bool.
            self._client.head_object(Bucket=self._bucket, Key=key)
        except botocore.exceptions.ClientError as exc:
            code = exc.response["Error"]["Code"]
            if code in ("404", "NoSuchKey"):
                logger.debug("S3 delete — key=%s did not exist, nothing to do", key)
                return False
            logger.error("S3 delete head_object failed — key=%s code=%s", key, code)
            raise RuntimeError(f"S3 delete check failed for key '{key}': {code}") from exc

        try:
            self._client.delete_object(Bucket=self._bucket, Key=key)
            logger.debug("S3 delete OK — bucket=%s key=%s", self._bucket, key)
            return True
        except botocore.exceptions.ClientError as exc:
            code = exc.response["Error"]["Code"]
            logger.error("S3 delete_object failed — key=%s code=%s", key, code)
            raise RuntimeError(f"S3 delete failed for key '{key}': {code}") from exc

    def _sync_exists(self, key: str) -> bool:
        """Return True if the object exists in S3."""
        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
            return True
        except botocore.exceptions.ClientError as exc:
            code = exc.response["Error"]["Code"]
            if code in ("404", "NoSuchKey"):
                return False
            logger.error("S3 exists check failed — key=%s code=%s", key, code)
            raise RuntimeError(f"S3 exists check failed for key '{key}': {code}") from exc

    def _sync_get_url(self, key: str, expires_in: int) -> Optional[str]:
        """Generate a presigned GET URL for the given key. Returns None if key doesn't exist."""
        if not self._sync_exists(key):
            return None
        try:
            url: str = self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=expires_in,
            )
            logger.debug("S3 presigned URL generated — key=%s expires_in=%ds", key, expires_in)
            return url
        except botocore.exceptions.ClientError as exc:
            code = exc.response["Error"]["Code"]
            logger.error("S3 get_url failed — key=%s code=%s", key, code)
            raise RuntimeError(f"S3 get_url failed for key '{key}': {code}") from exc

    def _sync_list_keys(self, prefix: str) -> list[str]:
        """Return a sorted list of all keys that start with *prefix*."""
        try:
            paginator = self._client.get_paginator("list_objects_v2")
            keys: list[str] = []
            for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
                for obj in page.get("Contents", []):
                    keys.append(obj["Key"])
            logger.debug(
                "S3 list_keys — bucket=%s prefix=%s found=%d", self._bucket, prefix, len(keys)
            )
            return sorted(keys)
        except botocore.exceptions.ClientError as exc:
            code = exc.response["Error"]["Code"]
            logger.error("S3 list_keys failed — prefix=%s code=%s", prefix, code)
            raise RuntimeError(f"S3 list_keys failed for prefix '{prefix}': {code}") from exc

    # ------------------------------------------------------------------
    # Async interface (StorageBackend contract)
    # ------------------------------------------------------------------

    async def upload(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        return await asyncio.to_thread(self._sync_upload, key, data, content_type)

    async def download(self, key: str) -> bytes:
        return await asyncio.to_thread(self._sync_download, key)

    async def delete(self, key: str) -> bool:
        return await asyncio.to_thread(self._sync_delete, key)

    async def exists(self, key: str) -> bool:
        return await asyncio.to_thread(self._sync_exists, key)

    async def get_url(self, key: str, expires_in: int = 3600) -> Optional[str]:
        return await asyncio.to_thread(self._sync_get_url, key, expires_in)

    async def list_keys(self, prefix: str) -> list[str]:
        return await asyncio.to_thread(self._sync_list_keys, prefix)
