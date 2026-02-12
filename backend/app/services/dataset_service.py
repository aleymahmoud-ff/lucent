"""
Dataset Service - File upload, validation, and data processing
"""
import pandas as pd
import numpy as np
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta
from io import BytesIO, StringIO
import json
import uuid
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from sqlalchemy.orm import selectinload

from app.models.dataset import Dataset
from app.models.user import User
from app.schemas.datasets import (
    ColumnInfo, ColumnType, DateRange, DataSummaryResponse,
    MissingValueInfo, DataStructureResponse, DataPreviewResponse
)
from app.db.redis_client import get_redis
from app.config import settings

logger = logging.getLogger(__name__)

# Redis key prefix for dataset data
REDIS_DATASET_PREFIX = "dataset:"
REDIS_DATASET_META_PREFIX = "dataset_meta:"
REDIS_DATASET_TTL = 3600 * 4  # 4 hours


class DatasetService:
    """Service for handling dataset operations"""

    def __init__(self, db: AsyncSession, tenant_id: str, user_id: Optional[str] = None):
        self.db = db
        self.tenant_id = tenant_id
        self.user_id = user_id

    # ============================================
    # File Upload & Parsing
    # ============================================

    async def upload_file(
        self,
        file_content: bytes,
        filename: str,
        content_type: str
    ) -> Tuple[Dataset, pd.DataFrame]:
        """Upload and parse a file (CSV or Excel). Returns dataset and DataFrame."""

        # Determine file type
        file_type = self._get_file_type(filename, content_type)
        if file_type not in ["csv", "xlsx", "xls"]:
            raise ValueError(f"Unsupported file type: {file_type}. Supported types: csv, xlsx, xls")

        # Parse the file
        df = self._parse_file(file_content, file_type)

        # Validate basic structure
        if df.empty:
            raise ValueError("The uploaded file is empty")

        if len(df.columns) < 4:
            raise ValueError("File must have at least 4 columns: Date, Entity_ID, Entity_Name, Volume")

        # Validate required columns
        is_valid, missing_cols = self.validate_required_columns(df)
        if not is_valid:
            raise ValueError(
                f"Missing required columns: {', '.join(missing_cols)}. "
                f"Required columns are: Date, Entity_ID, Entity_Name, Volume. "
                f"Found columns: {', '.join(df.columns.tolist())}"
            )

        # Create dataset record
        dataset = Dataset(
            id=str(uuid.uuid4()),
            tenant_id=self.tenant_id,
            name=self._generate_name(filename),
            filename=filename,
            file_size=len(file_content),
            file_type=file_type,
            row_count=len(df),
            column_count=len(df.columns),
            columns=df.columns.tolist(),
            column_types=self._detect_column_types(df),
            uploaded_by=self.user_id,
            uploaded_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(hours=4),  # Session-based expiry
        )

        # Store data in Redis for session-based access
        redis_key = f"{REDIS_DATASET_PREFIX}{dataset.id}"
        dataset.redis_key = redis_key
        await self._store_data_in_redis(redis_key, df)

        # Analyze data structure and auto-detect columns
        structure = self._analyze_structure(df)
        dataset.date_column = structure.get("date_column")
        dataset.entity_column = structure.get("entity_column")
        dataset.value_column = structure.get("value_column")

        # Extract entities and date range if columns detected
        if dataset.date_column and dataset.value_column:
            if dataset.entity_column:
                dataset.entities = df[dataset.entity_column].unique().tolist()[:100]  # Limit to 100 entities
            dataset.date_range = self._get_date_range(df, dataset.date_column)

        # Compute and cache summary
        dataset.summary = self._compute_summary(df)
        dataset.is_processed = True

        # Store metadata in Redis only (no database - session-based data)
        await self._store_metadata_in_redis(dataset.id, {
            "id": dataset.id,
            "tenant_id": dataset.tenant_id,
            "name": dataset.name,
            "filename": dataset.filename,
            "redis_key": dataset.redis_key,
            "date_column": dataset.date_column,
            "entity_column": dataset.entity_column,
            "value_column": dataset.value_column,
            "entities": dataset.entities,
            "date_range": dataset.date_range,
            "columns": dataset.columns,
            "column_types": dataset.column_types,
            "row_count": dataset.row_count,
            "column_count": dataset.column_count,
            "summary": dataset.summary,
            "is_active": True,
            "file_size": dataset.file_size,
            "file_type": dataset.file_type,
            "uploaded_at": dataset.uploaded_at.isoformat() if dataset.uploaded_at else None,
        })

        return dataset

    def _get_file_type(self, filename: str, content_type: str) -> str:
        """Determine file type from filename or content type"""
        filename_lower = filename.lower()
        if filename_lower.endswith(".csv"):
            return "csv"
        elif filename_lower.endswith(".xlsx"):
            return "xlsx"
        elif filename_lower.endswith(".xls"):
            return "xls"
        elif "csv" in content_type:
            return "csv"
        elif "excel" in content_type or "spreadsheet" in content_type:
            return "xlsx"
        else:
            # Try to infer from extension
            ext = filename.split(".")[-1].lower() if "." in filename else ""
            return ext if ext in ["csv", "xlsx", "xls"] else "unknown"

    def _parse_file(self, file_content: bytes, file_type: str) -> pd.DataFrame:
        """Parse file content into DataFrame"""
        buffer = BytesIO(file_content)

        try:
            if file_type == "csv":
                # Try different encodings
                for encoding in ["utf-8", "latin-1", "cp1252"]:
                    try:
                        buffer.seek(0)
                        df = pd.read_csv(buffer, encoding=encoding)
                        break
                    except UnicodeDecodeError:
                        continue
                else:
                    raise ValueError("Could not decode CSV file. Please use UTF-8 encoding.")
            elif file_type in ["xlsx", "xls"]:
                df = pd.read_excel(buffer)
            else:
                raise ValueError(f"Unsupported file type: {file_type}")

            # Clean column names
            df.columns = df.columns.str.strip()

            return df

        except Exception as e:
            logger.error(f"Error parsing file: {str(e)}")
            raise ValueError(f"Error parsing file: {str(e)}")

    def _generate_name(self, filename: str) -> str:
        """Generate user-friendly name from filename"""
        name = filename.rsplit(".", 1)[0]
        name = name.replace("_", " ").replace("-", " ")
        return name.title()

    def validate_required_columns(self, df: pd.DataFrame) -> Tuple[bool, List[str]]:
        """Validate data has required columns: Date, Entity_ID, Entity_Name, Volume"""
        required = ['Date', 'Entity_ID', 'Entity_Name', 'Volume']
        # Check for exact match (case-sensitive)
        missing = [col for col in required if col not in df.columns]
        return len(missing) == 0, missing

    def _detect_column_types(self, df: pd.DataFrame) -> Dict[str, str]:
        """Detect column types"""
        types = {}
        for col in df.columns:
            if pd.api.types.is_datetime64_any_dtype(df[col]):
                types[col] = "datetime"
            elif pd.api.types.is_integer_dtype(df[col]):
                types[col] = "integer"
            elif pd.api.types.is_float_dtype(df[col]):
                types[col] = "float"
            elif pd.api.types.is_bool_dtype(df[col]):
                types[col] = "boolean"
            else:
                # Check if it looks like a date
                if self._is_date_column(df[col]):
                    types[col] = "date"
                else:
                    types[col] = "string"
        return types

    def _is_date_column(self, series: pd.Series) -> bool:
        """Check if a column looks like dates"""
        if series.dtype == object:
            # Sample some values
            sample = series.dropna().head(20)
            if len(sample) == 0:
                return False

            date_patterns = [
                r"\d{4}-\d{2}-\d{2}",  # YYYY-MM-DD
                r"\d{2}/\d{2}/\d{4}",  # MM/DD/YYYY
                r"\d{2}-\d{2}-\d{4}",  # DD-MM-YYYY
            ]
            import re
            for val in sample:
                if isinstance(val, str):
                    for pattern in date_patterns:
                        if re.match(pattern, val):
                            return True
        return False

    def _analyze_structure(self, df: pd.DataFrame) -> Dict[str, Optional[str]]:
        """Detect date, entity, and value columns.

        Uses exact required column names first (Date, Entity_ID, Volume),
        then falls back to auto-detection for backwards compatibility.
        """
        result = {
            "date_column": None,
            "entity_column": None,
            "value_column": None,
        }

        # Check for exact required column names first (preferred)
        if "Date" in df.columns:
            result["date_column"] = "Date"
        if "Entity_ID" in df.columns:
            result["entity_column"] = "Entity_ID"
        if "Volume" in df.columns:
            result["value_column"] = "Volume"

        # If all required columns found, return early
        if all(result.values()):
            return result

        # Fall back to auto-detection for legacy/flexible uploads
        # Look for date column
        if not result["date_column"]:
            date_keywords = ["date", "time", "timestamp", "day", "month", "year", "period"]
            for col in df.columns:
                col_lower = col.lower()
                if any(kw in col_lower for kw in date_keywords):
                    result["date_column"] = col
                    break
                # Also check type
                if pd.api.types.is_datetime64_any_dtype(df[col]):
                    result["date_column"] = col
                    break
                if self._is_date_column(df[col]):
                    result["date_column"] = col
                    break

        # Look for entity column
        if not result["entity_column"]:
            entity_priority = ["entity_id", "entity"]
            entity_keywords = ["product", "item", "sku", "category", "store", "location", "region"]

            # First check for priority columns (exact match)
            for priority_col in entity_priority:
                if priority_col in [c.lower() for c in df.columns]:
                    col = [c for c in df.columns if c.lower() == priority_col][0]
                    if col != result["date_column"]:
                        unique_ratio = df[col].nunique() / len(df)
                        if unique_ratio < 0.5:
                            result["entity_column"] = col
                            break

            # Then check for keyword matches
            if not result["entity_column"]:
                for col in df.columns:
                    if col == result["date_column"]:
                        continue
                    col_lower = col.lower()
                    # Skip entity_name to prefer entity_id
                    if col_lower == "entity_name":
                        continue
                    # Check for keywords
                    if any(kw in col_lower for kw in entity_keywords):
                        unique_ratio = df[col].nunique() / len(df)
                        if unique_ratio < 0.5:
                            result["entity_column"] = col
                            break
                    # Check if column is string/object with reasonable cardinality
                    if df[col].dtype == object:
                        unique_ratio = df[col].nunique() / len(df)
                        if 0.001 < unique_ratio < 0.5:
                            result["entity_column"] = col
                            break

        # Look for value column (numeric)
        if not result["value_column"]:
            value_keywords = ["value", "sales", "amount", "quantity", "count", "revenue", "price", "demand", "forecast", "volume"]
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

            for col in numeric_cols:
                if col == result["date_column"]:
                    continue
                col_lower = col.lower()
                if any(kw in col_lower for kw in value_keywords):
                    result["value_column"] = col
                    break

            # If no value column found by keyword, use first numeric column
            if not result["value_column"] and numeric_cols:
                for col in numeric_cols:
                    if col != result["date_column"]:
                        result["value_column"] = col
                        break

        return result

    def _get_date_range(self, df: pd.DataFrame, date_column: str) -> Dict[str, str]:
        """Get date range from DataFrame"""
        try:
            dates = pd.to_datetime(df[date_column], errors="coerce")
            valid_dates = dates.dropna()
            if len(valid_dates) > 0:
                return {
                    "start": valid_dates.min().strftime("%Y-%m-%d"),
                    "end": valid_dates.max().strftime("%Y-%m-%d"),
                }
        except Exception:
            pass
        return {"start": None, "end": None}

    def _compute_summary(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Compute summary statistics for caching"""
        missing_total = df.isnull().sum().sum()
        total_cells = df.size

        return {
            "total_rows": len(df),
            "total_columns": len(df.columns),
            "missing_values": int(missing_total),
            "missing_percentage": round((missing_total / total_cells) * 100, 2) if total_cells > 0 else 0,
            "memory_usage_mb": round(df.memory_usage(deep=True).sum() / (1024 * 1024), 2),
        }

    async def _store_data_in_redis(self, key: str, df: pd.DataFrame) -> None:
        """Store DataFrame in Redis"""
        try:
            redis = await get_redis()
            if redis is None:
                logger.warning("Redis client not available, skipping cache storage")
                return
            # Convert to JSON-serializable format
            data = df.to_json(orient="split", date_format="iso")
            await redis.set(key, data, ex=REDIS_DATASET_TTL)
            logger.info(f"Stored dataset in Redis: {key}")
        except Exception as e:
            logger.error(f"Error storing data in Redis: {str(e)}")
            # Continue even if Redis storage fails
            pass

    async def _get_data_from_redis(self, key: str) -> Optional[pd.DataFrame]:
        """Retrieve DataFrame from Redis"""
        try:
            redis = await get_redis()
            if redis is None:
                logger.warning("Redis client not available")
                return None
            data = await redis.get(key)
            if data:
                # Handle both string and bytes (redis client may return string if decode_responses=True)
                if isinstance(data, str):
                    return pd.read_json(StringIO(data), orient="split")
                else:
                    return pd.read_json(BytesIO(data), orient="split")
        except Exception as e:
            logger.error(f"Error retrieving data from Redis: {str(e)}")
        return None

    async def _store_metadata_in_redis(self, dataset_id: str, metadata: Dict[str, Any]) -> None:
        """Store dataset metadata in Redis for fast access"""
        try:
            redis = await get_redis()
            if redis is None:
                return
            key = f"{REDIS_DATASET_META_PREFIX}{dataset_id}"
            await redis.set(key, json.dumps(metadata, default=str), ex=REDIS_DATASET_TTL)
            logger.info(f"Stored dataset metadata in Redis: {key}")
        except Exception as e:
            logger.error(f"Error storing metadata in Redis: {str(e)}")

    async def _get_metadata_from_redis(self, dataset_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve dataset metadata from Redis"""
        try:
            redis = await get_redis()
            if redis is None:
                return None
            key = f"{REDIS_DATASET_META_PREFIX}{dataset_id}"
            data = await redis.get(key)
            if data:
                if isinstance(data, bytes):
                    data = data.decode('utf-8')
                return json.loads(data)
        except Exception as e:
            logger.error(f"Error retrieving metadata from Redis: {str(e)}")
        return None

    # ============================================
    # Dataset CRUD Operations
    # ============================================

    async def get_dataset(self, dataset_id: str, use_cache: bool = True) -> Optional[Dataset]:
        """Get a single dataset by ID - tries Redis cache first, then DB"""
        # Try Redis cache first (much faster)
        if use_cache:
            cached = await self._get_metadata_from_redis(dataset_id)
            if cached and cached.get("tenant_id") == self.tenant_id and cached.get("is_active", True):
                # Create a Dataset object from cached data
                dataset = Dataset(
                    id=cached["id"],
                    tenant_id=cached["tenant_id"],
                    name=cached["name"],
                    filename=cached["filename"],
                    redis_key=cached.get("redis_key"),
                    date_column=cached.get("date_column"),
                    entity_column=cached.get("entity_column"),
                    value_column=cached.get("value_column"),
                    entities=cached.get("entities"),
                    date_range=cached.get("date_range"),
                    columns=cached.get("columns"),
                    column_types=cached.get("column_types"),
                    row_count=cached.get("row_count"),
                    column_count=cached.get("column_count"),
                    summary=cached.get("summary"),
                    is_active=cached.get("is_active", True),
                    file_size=cached.get("file_size"),
                    file_type=cached.get("file_type"),
                )
                return dataset

        # No database fallback - session data only lives in Redis
        return None

    async def list_datasets(
        self,
        skip: int = 0,
        limit: int = 50,
        search: Optional[str] = None
    ) -> Tuple[List[Dataset], int]:
        """List all datasets for the tenant from Redis"""
        logger.info(f"Listing datasets for tenant: {self.tenant_id}")
        try:
            redis = await get_redis()
            if redis is None:
                logger.warning("Redis not available for list_datasets")
                return [], 0

            # Scan for all dataset metadata keys
            datasets = []
            cursor = 0
            pattern = f"{REDIS_DATASET_META_PREFIX}*"

            while True:
                cursor, keys = await redis.scan(cursor, match=pattern, count=100)
                logger.info(f"Found {len(keys)} dataset keys in Redis scan")
                for key in keys:
                    data = await redis.get(key)
                    if data:
                        if isinstance(data, bytes):
                            data = data.decode('utf-8')
                        cached = json.loads(data)

                        # Filter by tenant
                        cached_tenant = cached.get("tenant_id")
                        logger.debug(f"Dataset {cached.get('name')}: tenant={cached_tenant}, current={self.tenant_id}")
                        if cached_tenant != self.tenant_id:
                            logger.debug(f"Skipping dataset {cached.get('name')} - tenant mismatch")
                            continue
                        if not cached.get("is_active", True):
                            continue

                        # Apply search filter
                        if search and search.lower() not in cached.get("name", "").lower():
                            continue

                        # Parse uploaded_at from cached data
                        uploaded_at = None
                        if cached.get("uploaded_at"):
                            try:
                                uploaded_at = datetime.fromisoformat(cached["uploaded_at"])
                            except (ValueError, TypeError):
                                uploaded_at = datetime.utcnow()
                        else:
                            uploaded_at = datetime.utcnow()

                        dataset = Dataset(
                            id=cached["id"],
                            tenant_id=cached["tenant_id"],
                            name=cached["name"],
                            filename=cached["filename"],
                            redis_key=cached.get("redis_key"),
                            row_count=cached.get("row_count"),
                            column_count=cached.get("column_count"),
                            columns=cached.get("columns") or [],
                            entities=cached.get("entities") or [],
                            file_size=cached.get("file_size") or 0,
                            file_type=cached.get("file_type") or "csv",
                            date_range=cached.get("date_range") or {},
                            is_processed=cached.get("is_processed", False),
                            is_active=True,
                            uploaded_at=uploaded_at,
                        )
                        datasets.append(dataset)

                if cursor == 0:
                    break

            # Sort by uploaded_at (newest first) - we don't have this field so sort by name
            total = len(datasets)
            logger.info(f"Found {total} datasets for tenant {self.tenant_id}")

            # Apply pagination
            datasets = datasets[skip:skip + limit]

            return datasets, total

        except Exception as e:
            logger.error(f"Error listing datasets from Redis: {str(e)}")
            return [], 0

    async def delete_dataset(self, dataset_id: str) -> bool:
        """Delete a dataset from Redis"""
        dataset = await self.get_dataset(dataset_id)
        if not dataset:
            return False

        try:
            redis = await get_redis()
            if redis:
                # Delete data
                if dataset.redis_key:
                    await redis.delete(dataset.redis_key)
                # Delete metadata
                await redis.delete(f"{REDIS_DATASET_META_PREFIX}{dataset_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting dataset: {str(e)}")
            return False

    # ============================================
    # Data Preview & Statistics
    # ============================================

    async def get_preview(
        self,
        dataset_id: str,
        page: int = 1,
        page_size: int = 100
    ) -> DataPreviewResponse:
        """Get paginated data preview"""
        dataset = await self.get_dataset(dataset_id)
        if not dataset:
            raise ValueError("Dataset not found")

        # Get data from Redis
        df = await self._get_data_from_redis(dataset.redis_key)
        if df is None:
            raise ValueError("Dataset data has expired. Please re-upload the file.")

        # Paginate
        total_rows = len(df)
        total_pages = (total_rows + page_size - 1) // page_size
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size

        # Get page data
        page_df = df.iloc[start_idx:end_idx]

        # Convert to records, handling NaN values
        records = page_df.replace({np.nan: None}).to_dict(orient="records")

        return DataPreviewResponse(
            columns=df.columns.tolist(),
            data=records,
            total_rows=total_rows,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    async def get_summary(self, dataset_id: str) -> DataSummaryResponse:
        """Get detailed summary statistics"""
        dataset = await self.get_dataset(dataset_id)
        if not dataset:
            raise ValueError("Dataset not found")

        # Get data from Redis
        df = await self._get_data_from_redis(dataset.redis_key)
        if df is None:
            # Use cached summary if data expired
            if dataset.summary:
                return DataSummaryResponse(
                    total_rows=dataset.summary.get("total_rows", 0),
                    total_columns=dataset.summary.get("total_columns", 0),
                    missing_values=dataset.summary.get("missing_values", 0),
                    missing_percentage=dataset.summary.get("missing_percentage", 0),
                    date_range=DateRange(**dataset.date_range) if dataset.date_range else DateRange(),
                    entity_count=len(dataset.entities) if dataset.entities else 0,
                    columns=[],
                    missing_by_column=[],
                    memory_usage_mb=dataset.summary.get("memory_usage_mb", 0),
                )
            raise ValueError("Dataset data has expired. Please re-upload the file.")

        # Compute column info
        columns_info = []
        missing_by_column = []

        for col in df.columns:
            col_data = df[col]
            missing_count = int(col_data.isnull().sum())
            unique_count = int(col_data.nunique())

            col_info = ColumnInfo(
                name=col,
                type=self._get_column_type(col_data),
                missing_count=missing_count,
                unique_count=unique_count,
                sample_values=col_data.dropna().head(5).tolist(),
            )

            # Add numeric statistics
            if pd.api.types.is_numeric_dtype(col_data):
                col_info.min = float(col_data.min()) if not pd.isna(col_data.min()) else None
                col_info.max = float(col_data.max()) if not pd.isna(col_data.max()) else None
                col_info.mean = float(col_data.mean()) if not pd.isna(col_data.mean()) else None
                col_info.std = float(col_data.std()) if not pd.isna(col_data.std()) else None

            columns_info.append(col_info)

            if missing_count > 0:
                missing_by_column.append(MissingValueInfo(
                    column=col,
                    count=missing_count,
                    percentage=round((missing_count / len(df)) * 100, 2),
                ))

        # Total missing
        total_missing = df.isnull().sum().sum()
        total_cells = df.size

        return DataSummaryResponse(
            total_rows=len(df),
            total_columns=len(df.columns),
            missing_values=int(total_missing),
            missing_percentage=round((total_missing / total_cells) * 100, 2) if total_cells > 0 else 0,
            date_range=DateRange(**dataset.date_range) if dataset.date_range else DateRange(),
            entity_count=len(dataset.entities) if dataset.entities else 0,
            columns=columns_info,
            missing_by_column=missing_by_column,
            memory_usage_mb=round(df.memory_usage(deep=True).sum() / (1024 * 1024), 2),
        )

    async def get_structure(self, dataset_id: str) -> DataStructureResponse:
        """Get data structure analysis"""
        dataset = await self.get_dataset(dataset_id)
        if not dataset:
            raise ValueError("Dataset not found")

        # Get data from Redis
        df = await self._get_data_from_redis(dataset.redis_key)
        if df is None:
            raise ValueError("Dataset data has expired. Please re-upload the file.")

        # Compute column info
        columns_info = []
        for col in df.columns:
            col_data = df[col]
            col_info = ColumnInfo(
                name=col,
                type=self._get_column_type(col_data),
                missing_count=int(col_data.isnull().sum()),
                unique_count=int(col_data.nunique()),
                sample_values=col_data.dropna().head(5).tolist(),
            )

            if pd.api.types.is_numeric_dtype(col_data):
                col_info.min = float(col_data.min()) if not pd.isna(col_data.min()) else None
                col_info.max = float(col_data.max()) if not pd.isna(col_data.max()) else None
                col_info.mean = float(col_data.mean()) if not pd.isna(col_data.mean()) else None
                col_info.std = float(col_data.std()) if not pd.isna(col_data.std()) else None

            columns_info.append(col_info)

        # Detect frequency if date column exists
        detected_frequency = None
        if dataset.date_column:
            detected_frequency = self._detect_frequency(df, dataset.date_column)

        return DataStructureResponse(
            columns=columns_info,
            date_column=dataset.date_column,
            entity_column=dataset.entity_column,
            value_column=dataset.value_column,
            detected_frequency=detected_frequency,
            suggested_columns={
                "date": dataset.date_column,
                "entity": dataset.entity_column,
                "value": dataset.value_column,
            },
        )

    async def get_missing_values(self, dataset_id: str) -> Dict[str, Any]:
        """Get missing values analysis"""
        dataset = await self.get_dataset(dataset_id)
        if not dataset:
            raise ValueError("Dataset not found")

        df = await self._get_data_from_redis(dataset.redis_key)
        if df is None:
            raise ValueError("Dataset data has expired. Please re-upload the file.")

        missing_data = []
        for col in df.columns:
            missing_count = int(df[col].isnull().sum())
            if missing_count > 0:
                missing_data.append({
                    "column": col,
                    "missing_count": missing_count,
                    "missing_percentage": round((missing_count / len(df)) * 100, 2),
                    "total_rows": len(df),
                })

        return {
            "total_missing": int(df.isnull().sum().sum()),
            "total_cells": df.size,
            "missing_percentage": round((df.isnull().sum().sum() / df.size) * 100, 2),
            "by_column": missing_data,
        }

    def _get_column_type(self, series: pd.Series) -> ColumnType:
        """Get column type enum"""
        if pd.api.types.is_datetime64_any_dtype(series):
            return ColumnType.DATETIME
        elif pd.api.types.is_integer_dtype(series):
            return ColumnType.INTEGER
        elif pd.api.types.is_float_dtype(series):
            return ColumnType.FLOAT
        elif pd.api.types.is_bool_dtype(series):
            return ColumnType.BOOLEAN
        elif self._is_date_column(series):
            return ColumnType.DATE
        else:
            return ColumnType.STRING

    def _detect_frequency(self, df: pd.DataFrame, date_column: str) -> Optional[str]:
        """Detect time series frequency"""
        try:
            dates = pd.to_datetime(df[date_column], errors="coerce").dropna().sort_values()
            if len(dates) < 2:
                return None

            # Calculate mode of differences
            diffs = dates.diff().dropna()
            mode_diff = diffs.mode()
            if len(mode_diff) == 0:
                return None

            days = mode_diff.iloc[0].days

            if days == 1:
                return "daily"
            elif days == 7:
                return "weekly"
            elif 28 <= days <= 31:
                return "monthly"
            elif 89 <= days <= 92:
                return "quarterly"
            elif 364 <= days <= 366:
                return "yearly"
            else:
                return f"{days} days"
        except Exception:
            return None

    # ============================================
    # Column Mapping
    # ============================================

    async def update_column_mapping(
        self,
        dataset_id: str,
        date_column: str,
        value_column: str,
        entity_column: Optional[str] = None
    ) -> Dataset:
        """Update column mapping for a dataset"""
        dataset = await self.get_dataset(dataset_id)
        if not dataset:
            raise ValueError("Dataset not found")

        # Validate columns exist
        if date_column not in dataset.columns:
            raise ValueError(f"Date column '{date_column}' not found in dataset")
        if value_column not in dataset.columns:
            raise ValueError(f"Value column '{value_column}' not found in dataset")
        if entity_column and entity_column not in dataset.columns:
            raise ValueError(f"Entity column '{entity_column}' not found in dataset")

        # Update dataset
        dataset.date_column = date_column
        dataset.value_column = value_column
        dataset.entity_column = entity_column

        # Re-extract entities and date range
        df = await self._get_data_from_redis(dataset.redis_key)
        if df is not None:
            if entity_column:
                dataset.entities = df[entity_column].unique().tolist()[:100]
            else:
                dataset.entities = []
            dataset.date_range = self._get_date_range(df, date_column)

        # Update metadata in Redis
        await self._store_metadata_in_redis(dataset.id, {
            "id": dataset.id,
            "tenant_id": dataset.tenant_id,
            "name": dataset.name,
            "filename": dataset.filename,
            "redis_key": dataset.redis_key,
            "date_column": dataset.date_column,
            "entity_column": dataset.entity_column,
            "value_column": dataset.value_column,
            "entities": dataset.entities,
            "date_range": dataset.date_range,
            "columns": dataset.columns,
            "column_types": dataset.column_types,
            "row_count": dataset.row_count,
            "column_count": dataset.column_count,
            "summary": dataset.summary,
            "is_active": True,
            "file_size": dataset.file_size,
            "file_type": dataset.file_type,
        })

        return dataset

    # ============================================
    # Sample Data
    # ============================================

    async def load_sample_data(self, sample_type: str = "default") -> Dataset:
        """Load sample dataset"""
        # Generate sample data based on type
        if sample_type == "sales":
            df = self._generate_sales_data()
            name = "Sample Sales Data"
        elif sample_type == "energy":
            df = self._generate_energy_data()
            name = "Sample Energy Data"
        elif sample_type == "stock":
            df = self._generate_stock_data()
            name = "Sample Stock Data"
        else:
            df = self._generate_default_data()
            name = "Sample Forecast Data"

        # Create dataset
        dataset = Dataset(
            id=str(uuid.uuid4()),
            tenant_id=self.tenant_id,
            name=name,
            filename=f"{sample_type}_sample.csv",
            file_size=len(df.to_csv().encode()),
            file_type="csv",
            row_count=len(df),
            column_count=len(df.columns),
            columns=df.columns.tolist(),
            column_types=self._detect_column_types(df),
            uploaded_by=self.user_id,
            uploaded_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(hours=4),
        )

        # Store in Redis
        redis_key = f"{REDIS_DATASET_PREFIX}{dataset.id}"
        dataset.redis_key = redis_key
        await self._store_data_in_redis(redis_key, df)

        # Analyze structure
        structure = self._analyze_structure(df)
        dataset.date_column = structure.get("date_column")
        dataset.entity_column = structure.get("entity_column")
        dataset.value_column = structure.get("value_column")

        if dataset.date_column and dataset.value_column:
            if dataset.entity_column:
                dataset.entities = df[dataset.entity_column].unique().tolist()
            dataset.date_range = self._get_date_range(df, dataset.date_column)

        dataset.summary = self._compute_summary(df)
        dataset.is_processed = True

        # Store metadata in Redis only (no database - session-based data)
        await self._store_metadata_in_redis(dataset.id, {
            "id": dataset.id,
            "tenant_id": dataset.tenant_id,
            "name": dataset.name,
            "filename": dataset.filename,
            "redis_key": dataset.redis_key,
            "date_column": dataset.date_column,
            "entity_column": dataset.entity_column,
            "value_column": dataset.value_column,
            "entities": dataset.entities,
            "date_range": dataset.date_range,
            "columns": dataset.columns,
            "column_types": dataset.column_types,
            "row_count": dataset.row_count,
            "column_count": dataset.column_count,
            "summary": dataset.summary,
            "is_active": True,
            "file_size": dataset.file_size,
            "file_type": dataset.file_type,
            "uploaded_at": dataset.uploaded_at.isoformat() if dataset.uploaded_at else None,
        })

        return dataset

    def _generate_default_data(self) -> pd.DataFrame:
        """Generate default sample data with required columns: Date, Entity_ID, Entity_Name, Volume"""
        np.random.seed(42)
        dates = pd.date_range(start="2023-01-01", periods=365, freq="D")
        entities = [
            {"Entity_ID": "PRD-001", "Entity_Name": "Product A"},
            {"Entity_ID": "PRD-002", "Entity_Name": "Product B"},
            {"Entity_ID": "PRD-003", "Entity_Name": "Product C"},
        ]

        data = []
        for entity in entities:
            base = np.random.randint(100, 500)
            trend = np.linspace(0, 50, 365)
            seasonality = 30 * np.sin(2 * np.pi * np.arange(365) / 365)
            noise = np.random.normal(0, 10, 365)
            values = base + trend + seasonality + noise

            for i, date in enumerate(dates):
                data.append({
                    "Date": date,
                    "Entity_ID": entity["Entity_ID"],
                    "Entity_Name": entity["Entity_Name"],
                    "Volume": max(0, round(values[i], 2)),
                })

        return pd.DataFrame(data)

    def _generate_sales_data(self) -> pd.DataFrame:
        """Generate sales sample data with required columns: Date, Entity_ID, Entity_Name, Volume"""
        np.random.seed(42)
        dates = pd.date_range(start="2023-01-01", periods=365, freq="D")
        products = [
            {"Entity_ID": "WGT-A", "Entity_Name": "Widget A"},
            {"Entity_ID": "WGT-B", "Entity_Name": "Widget B"},
            {"Entity_ID": "GDG-X", "Entity_Name": "Gadget X"},
            {"Entity_ID": "GDG-Y", "Entity_Name": "Gadget Y"},
        ]

        data = []
        for product in products:
            base = np.random.randint(500, 2000)
            trend = np.linspace(0, 200, 365)
            weekly = 100 * np.sin(2 * np.pi * np.arange(365) / 7)
            yearly = 150 * np.sin(2 * np.pi * np.arange(365) / 365)
            noise = np.random.normal(0, 50, 365)
            sales = base + trend + weekly + yearly + noise

            for i, date in enumerate(dates):
                data.append({
                    "Date": date,
                    "Entity_ID": product["Entity_ID"],
                    "Entity_Name": product["Entity_Name"],
                    "Volume": max(0, round(sales[i], 2)),
                })

        return pd.DataFrame(data)

    def _generate_energy_data(self) -> pd.DataFrame:
        """Generate energy consumption sample data with required columns: Date, Entity_ID, Entity_Name, Volume"""
        np.random.seed(42)
        dates = pd.date_range(start="2023-01-01", periods=365 * 24, freq="H")
        locations = [
            {"Entity_ID": "BLD-A", "Entity_Name": "Building A"},
            {"Entity_ID": "BLD-B", "Entity_Name": "Building B"},
        ]

        data = []
        for location in locations:
            base = np.random.randint(100, 300)
            daily = 50 * np.sin(2 * np.pi * np.arange(len(dates)) / 24)
            weekly = 30 * np.sin(2 * np.pi * np.arange(len(dates)) / (24 * 7))
            noise = np.random.normal(0, 10, len(dates))
            consumption = base + daily + weekly + noise

            for i, date in enumerate(dates):
                data.append({
                    "Date": date,
                    "Entity_ID": location["Entity_ID"],
                    "Entity_Name": location["Entity_Name"],
                    "Volume": max(0, round(consumption[i], 2)),
                })

        # Sample to reduce size
        df = pd.DataFrame(data)
        return df.sample(n=min(5000, len(df)), random_state=42).sort_values("Date")

    def _generate_stock_data(self) -> pd.DataFrame:
        """Generate stock price sample data with required columns: Date, Entity_ID, Entity_Name, Volume"""
        np.random.seed(42)
        dates = pd.date_range(start="2023-01-01", periods=252, freq="B")  # Business days
        stocks = [
            {"Entity_ID": "ACME", "Entity_Name": "ACME Corp"},
            {"Entity_ID": "TECH", "Entity_Name": "Tech Industries"},
            {"Entity_ID": "RETAIL", "Entity_Name": "Retail Holdings"},
        ]

        data = []
        for stock in stocks:
            base_price = np.random.randint(50, 200)
            returns = np.random.normal(0.0005, 0.02, len(dates))
            prices = [base_price]
            for r in returns[1:]:
                prices.append(prices[-1] * (1 + r))

            for i, date in enumerate(dates):
                data.append({
                    "Date": date,
                    "Entity_ID": stock["Entity_ID"],
                    "Entity_Name": stock["Entity_Name"],
                    "Volume": round(prices[i], 2),
                })

        return pd.DataFrame(data)
