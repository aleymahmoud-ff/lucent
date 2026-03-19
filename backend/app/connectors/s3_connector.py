"""
AWS S3 Connector — uses boto3 (sync), wrapped in asyncio.to_thread
"""
import asyncio
import io
import logging
from typing import Any

import boto3
import botocore.exceptions
import pandas as pd

from .base import BaseConnector

logger = logging.getLogger(__name__)

# File extensions supported for data ingestion
_DATA_EXTENSIONS = (".csv", ".xlsx", ".xls", ".parquet")


def _parse_file(body_bytes: bytes, key: str) -> pd.DataFrame:
    """Detect format from the S3 key and parse into a DataFrame."""
    lower = key.lower()
    if lower.endswith(".parquet"):
        return pd.read_parquet(io.BytesIO(body_bytes))
    if lower.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(body_bytes))
    # Default: CSV
    return pd.read_csv(io.BytesIO(body_bytes))


class S3Connector(BaseConnector):
    """Connect to an AWS S3 bucket using boto3."""

    def _client(self):
        cfg = self.config
        kwargs: dict = {}
        if cfg.get("aws_access_key_id"):
            kwargs["aws_access_key_id"] = cfg["aws_access_key_id"]
        if cfg.get("aws_secret_access_key"):
            kwargs["aws_secret_access_key"] = cfg["aws_secret_access_key"]
        if cfg.get("aws_session_token"):
            kwargs["aws_session_token"] = cfg["aws_session_token"]
        if cfg.get("region_name"):
            kwargs["region_name"] = cfg["region_name"]
        if cfg.get("endpoint_url"):
            kwargs["endpoint_url"] = cfg["endpoint_url"]
        return boto3.client("s3", **kwargs)

    def _bucket(self) -> str:
        return self.config.get("bucket", "")

    # ------------------------------------------------------------------
    # Sync helpers (run inside asyncio.to_thread)
    # ------------------------------------------------------------------

    def _sync_test_connection(self) -> tuple[bool, str]:
        try:
            self._client().head_bucket(Bucket=self._bucket())
            return True, "Connection successful"
        except botocore.exceptions.ClientError as exc:
            code = exc.response["Error"]["Code"]
            if code == "403":
                return False, "Access denied — check credentials and bucket policy"
            if code == "404":
                return False, f"Bucket '{self._bucket()}' not found"
            return False, f"S3 error: {code}"
        except botocore.exceptions.NoCredentialsError:
            return False, "No AWS credentials found"
        except Exception as exc:
            logger.debug("S3 test_connection error: %s", exc)
            return False, f"Connection failed: {type(exc).__name__}"

    def _sync_fetch_data(
        self,
        key: str,
        filters: dict[str, Any] | None,
        limit: int,
    ) -> pd.DataFrame:
        client = self._client()
        response = client.get_object(Bucket=self._bucket(), Key=key)
        body_bytes = response["Body"].read()
        df = _parse_file(body_bytes, key)

        if filters:
            for col, val in filters.items():
                if col in df.columns:
                    df = df[df[col] == val]

        return df.head(limit)

    def _sync_list_resources(self) -> list[str]:
        client = self._client()
        prefix = self.config.get("prefix", "")
        paginator = client.get_paginator("list_objects_v2")
        keys: list[str] = []

        for page in paginator.paginate(Bucket=self._bucket(), Prefix=prefix):
            for obj in page.get("Contents", []):
                key: str = obj["Key"]
                if key.lower().endswith(_DATA_EXTENSIONS):
                    keys.append(key)

        return sorted(keys)

    # ------------------------------------------------------------------
    # Async interface
    # ------------------------------------------------------------------

    async def test_connection(self) -> tuple[bool, str]:
        return await asyncio.to_thread(self._sync_test_connection)

    async def fetch_data(
        self,
        query: str | None = None,
        table: str | None = None,
        filters: dict[str, Any] | None = None,
        limit: int = 1000,
    ) -> pd.DataFrame:
        key = query or table or self.config.get("key", "")
        if not key:
            raise ValueError(
                "Provide the S3 object key via 'query', 'table', or config 'key'"
            )
        return await asyncio.to_thread(self._sync_fetch_data, key, filters, limit)

    async def list_resources(self) -> list[str]:
        return await asyncio.to_thread(self._sync_list_resources)
