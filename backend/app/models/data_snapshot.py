"""
DataSnapshot Model - S3 pointer for data reproducibility.
Every forecast run references a snapshot so results can always be traced
back to the exact data that produced them.
"""
from sqlalchemy import Column, String, Integer, BigInteger, DateTime, ForeignKey, Enum, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import uuid
import enum

from app.db.database import Base


class SnapshotStatus(str, enum.Enum):
    PENDING = "pending"
    UPLOADING = "uploading"
    READY = "ready"
    EXPIRED = "expired"
    FAILED = "failed"


class DataSnapshot(Base):
    __tablename__ = "data_snapshots"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    # Source references — at least one should be set, both can be null for ad-hoc uploads
    dataset_id = Column(String(36), nullable=True)                    # Original dataset if from file upload
    connector_data_source_id = Column(String(36), nullable=True)     # Connector recipe if from connector

    # S3 object location, format: "{tenant_id}/snapshots/{hash}.parquet.gz"
    s3_key = Column(String(1000), nullable=False)

    # SHA-256 hash of the raw data for deduplication; indexed for fast lookups
    data_hash = Column(String(64), nullable=False, index=True)

    # Data dimensions
    row_count = Column(Integer, nullable=False)
    column_count = Column(Integer, nullable=True)

    # Storage metadata
    file_size_bytes = Column(BigInteger, nullable=True)
    compression = Column(String(20), default="gzip")
    format = Column(String(20), default="parquet")

    # Lifecycle
    status = Column(Enum(SnapshotStatus), default=SnapshotStatus.PENDING, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=True, index=True)  # Null means "never expire"

    # Creator (nullable so admin deletes don't orphan the record)
    created_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())

    # Relationships
    creator = relationship("User", backref="created_snapshots", foreign_keys=[created_by])

    # Composite index: fast dedup check scoped to tenant
    __table_args__ = (
        Index("ix_data_snapshots_tenant_data_hash", "tenant_id", "data_hash"),
    )

    def __repr__(self):
        return f"<DataSnapshot(id={self.id}, status={self.status}, row_count={self.row_count})>"
