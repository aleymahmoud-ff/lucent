"""
Google Cloud Storage Connector — uses google-cloud-storage (sync), wrapped in asyncio.to_thread
"""
import asyncio
import io
import json
import logging
from typing import Any

import pandas as pd
from google.cloud import storage as gcs
from google.oauth2 import service_account

from .base import BaseConnector

logger = logging.getLogger(__name__)

_DATA_EXTENSIONS = (".csv", ".xlsx", ".xls", ".parquet")


def _parse_blob(data: bytes, blob_name: str) -> pd.DataFrame:
    """Detect format from blob name and parse into a DataFrame."""
    lower = blob_name.lower()
    if lower.endswith(".parquet"):
        return pd.read_parquet(io.BytesIO(data))
    if lower.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(data))
    return pd.read_csv(io.BytesIO(data))


class GCSConnector(BaseConnector):
    """Connect to Google Cloud Storage using google-cloud-storage."""

    def _client(self) -> gcs.Client:
        cfg = self.config
        credentials_info = cfg.get("credentials")
        project_id = cfg.get("project_id")

        if credentials_info:
            if isinstance(credentials_info, str):
                credentials_info = json.loads(credentials_info)
            credentials = service_account.Credentials.from_service_account_info(
                credentials_info
            )
            return gcs.Client(project=project_id, credentials=credentials)

        # Fall back to Application Default Credentials
        return gcs.Client(project=project_id)

    def _bucket_name(self) -> str:
        return self.config.get("bucket", "")

    # ------------------------------------------------------------------
    # Sync helpers
    # ------------------------------------------------------------------

    def _sync_test_connection(self) -> tuple[bool, str]:
        try:
            client = self._client()
            client.get_bucket(self._bucket_name())
            return True, "Connection successful"
        except Exception as exc:
            name = type(exc).__name__
            msg = str(exc)
            if "403" in msg or "Forbidden" in msg or name == "Forbidden":
                return False, "Access denied — check service account permissions"
            if "404" in msg or "NotFound" in name:
                return False, f"Bucket '{self._bucket_name()}' not found"
            logger.debug("GCS test_connection error: %s", exc)
            return False, f"Connection failed: {name}"

    def _sync_fetch_data(
        self,
        blob_name: str,
        filters: dict[str, Any] | None,
        limit: int,
    ) -> pd.DataFrame:
        client = self._client()
        bucket = client.get_bucket(self._bucket_name())
        blob = bucket.blob(blob_name)
        data = blob.download_as_bytes()
        df = _parse_blob(data, blob_name)

        if filters:
            for col, val in filters.items():
                if col in df.columns:
                    df = df[df[col] == val]

        return df.head(limit)

    def _sync_list_resources(self) -> list[str]:
        client = self._client()
        prefix = self.config.get("prefix", None)
        blobs = client.list_blobs(self._bucket_name(), prefix=prefix)

        names: list[str] = []
        for blob in blobs:
            if blob.name.lower().endswith(_DATA_EXTENSIONS):
                names.append(blob.name)

        return sorted(names)

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
        blob_name = query or table or self.config.get("blob_name", "")
        if not blob_name:
            raise ValueError(
                "Provide the GCS object name via 'query', 'table', or config 'blob_name'"
            )
        return await asyncio.to_thread(self._sync_fetch_data, blob_name, filters, limit)

    async def list_resources(self) -> list[str]:
        return await asyncio.to_thread(self._sync_list_resources)
