"""
Azure Blob Storage Connector — uses azure-storage-blob (sync), wrapped in asyncio.to_thread
"""
import asyncio
import io
import logging
from typing import Any

import pandas as pd
from azure.core.exceptions import AzureError, ResourceNotFoundError, ClientAuthenticationError
from azure.storage.blob import BlobServiceClient

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


class AzureBlobConnector(BaseConnector):
    """Connect to Azure Blob Storage using azure-storage-blob."""

    def _service_client(self) -> BlobServiceClient:
        cfg = self.config
        # Prefer connection string if provided
        conn_str = cfg.get("connection_string")
        if conn_str:
            return BlobServiceClient.from_connection_string(conn_str)
        # Fall back to account name + key
        account_name = cfg.get("account_name", "")
        account_key = cfg.get("account_key", "")
        account_url = cfg.get("account_url") or f"https://{account_name}.blob.core.windows.net"
        return BlobServiceClient(account_url=account_url, credential=account_key or None)

    def _container(self) -> str:
        return self.config.get("container", "")

    # ------------------------------------------------------------------
    # Sync helpers
    # ------------------------------------------------------------------

    def _sync_test_connection(self) -> tuple[bool, str]:
        try:
            client = self._service_client()
            container_client = client.get_container_client(self._container())
            container_client.get_container_properties()
            return True, "Connection successful"
        except ClientAuthenticationError:
            return False, "Authentication failed — check account key or connection string"
        except ResourceNotFoundError:
            return False, f"Container '{self._container()}' not found"
        except AzureError as exc:
            return False, f"Azure error: {type(exc).__name__}"
        except Exception as exc:
            logger.debug("Azure Blob test_connection error: %s", exc)
            return False, f"Connection failed: {type(exc).__name__}"

    def _sync_fetch_data(
        self,
        blob_name: str,
        filters: dict[str, Any] | None,
        limit: int,
    ) -> pd.DataFrame:
        client = self._service_client()
        blob_client = client.get_blob_client(
            container=self._container(), blob=blob_name
        )
        data = blob_client.download_blob().readall()
        df = _parse_blob(data, blob_name)

        if filters:
            for col, val in filters.items():
                if col in df.columns:
                    df = df[df[col] == val]

        return df.head(limit)

    def _sync_list_resources(self) -> list[str]:
        client = self._service_client()
        container_client = client.get_container_client(self._container())
        prefix = self.config.get("prefix", None)

        names: list[str] = []
        for blob in container_client.list_blobs(name_starts_with=prefix):
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
                "Provide the blob name via 'query', 'table', or config 'blob_name'"
            )
        return await asyncio.to_thread(self._sync_fetch_data, blob_name, filters, limit)

    async def list_resources(self) -> list[str]:
        return await asyncio.to_thread(self._sync_list_resources)
