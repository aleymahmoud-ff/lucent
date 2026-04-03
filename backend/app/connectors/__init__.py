"""
LUCENT Data Connectors Package

Provides concrete connector implementations for each supported data source
and a factory function to instantiate the correct connector from a type string.
"""
from .base import BaseConnector
from .postgres_connector import PostgresConnector
from .mysql_connector import MySQLConnector
from .s3_connector import S3Connector
from .azure_blob_connector import AzureBlobConnector
from .gcs_connector import GCSConnector
from .snowflake_connector import SnowflakeConnector
from .sqlserver_connector import SQLServerConnector

__all__ = [
    "BaseConnector",
    "PostgresConnector",
    "MySQLConnector",
    "S3Connector",
    "AzureBlobConnector",
    "GCSConnector",
    "SnowflakeConnector",
    "SQLServerConnector",
    "get_connector",
]

# Map connector type strings (matching ConnectorType enum values) to classes
_CONNECTOR_REGISTRY: dict[str, type[BaseConnector]] = {
    "postgres": PostgresConnector,
    "mysql": MySQLConnector,
    "s3": S3Connector,
    "azure_blob": AzureBlobConnector,
    "gcs": GCSConnector,
    "snowflake": SnowflakeConnector,
    "sqlserver": SQLServerConnector,
}


def get_connector(
    connector_type: str,
    config: dict,
    tenant_id: str,
) -> BaseConnector:
    """
    Factory function — return the appropriate connector instance.

    Args:
        connector_type: Value from ConnectorType enum
                        (e.g. "postgres", "s3", "snowflake")
        config:         Decrypted connector configuration dict
        tenant_id:      Tenant that owns this connector

    Returns:
        Instantiated BaseConnector subclass

    Raises:
        ValueError: If connector_type is unknown or not yet implemented
    """
    cls = _CONNECTOR_REGISTRY.get(connector_type.lower())
    if cls is None:
        supported = ", ".join(sorted(_CONNECTOR_REGISTRY.keys()))
        raise ValueError(
            f"Unsupported connector type '{connector_type}'. "
            f"Supported types: {supported}"
        )
    return cls(config=config, tenant_id=tenant_id)
