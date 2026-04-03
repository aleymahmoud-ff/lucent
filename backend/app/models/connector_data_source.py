"""
ConnectorDataSource Model - Wizard-saved config for re-fetching data from a connector.
Stores the "recipe" (table name, column mapping, date range, selected entities)
so imports can be replayed or scheduled without user re-input.
"""
from sqlalchemy import Column, String, Boolean, JSON, DateTime, Integer, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import uuid

from app.db.database import Base


class ConnectorDataSource(Base):
    __tablename__ = "connector_data_sources"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    connector_id = Column(String(36), ForeignKey("connectors.id", ondelete="CASCADE"), nullable=False, index=True)

    # User-friendly name for this saved import configuration
    name = Column(String(255), nullable=False)

    # Source table/view in the remote database, e.g. "dbo.DailySales"
    source_table = Column(String(500), nullable=False)

    # Maps LUCENT columns to remote column names:
    # {"date": "sale_date", "entity_id": "store_id", "entity_name": "store_name", "volume": "quantity_sold"}
    column_map = Column(JSON, nullable=False)

    # Optional date range filter applied during import
    date_range_start = Column(DateTime, nullable=True)
    date_range_end = Column(DateTime, nullable=True)

    # Subset of entity IDs to import — empty list means "all entities"
    # e.g. ["S001", "S002", "S003"]
    selected_entity_ids = Column(JSON, default=list)

    # Tracks the most recent successful import
    last_imported_at = Column(DateTime, nullable=True)
    last_import_row_count = Column(Integer, nullable=True)

    # The most recent dataset created from this data source (soft reference, no FK constraint)
    last_dataset_id = Column(String(36), nullable=True)

    # Soft-delete / enable-disable without removing the record
    is_active = Column(Boolean, default=True)

    # Creator (nullable so admin deletes don't break the record)
    created_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())

    # Relationships
    tenant = relationship("Tenant", backref="connector_data_sources")
    connector = relationship("Connector", backref="data_sources")
    creator = relationship("User", backref="created_data_sources", foreign_keys=[created_by])

    def __repr__(self):
        return f"<ConnectorDataSource(id={self.id}, name={self.name}, connector_id={self.connector_id})>"
