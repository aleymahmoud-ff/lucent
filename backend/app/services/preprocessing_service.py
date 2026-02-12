"""
Preprocessing Service - Data cleaning and transformation operations
"""
import pandas as pd
import numpy as np
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
import json
import logging

from app.db.redis_client import get_redis
from app.schemas.preprocessing import (
    MissingValueMethod, DuplicateMethod, OutlierMethod, OutlierAction,
    AggregationFrequency, AggregationMethod,
    MissingValuesRequest, DuplicatesRequest, OutlierRequest,
    ValueReplacementRequest, TimeAggregationRequest,
    EntityInfo, EntityStatsResponse, MissingValuesAnalysis,
    OutlierInfo, PreprocessingResultResponse
)

logger = logging.getLogger(__name__)

# Redis key prefixes
REDIS_PREPROCESSED_PREFIX = "preprocessed:"
REDIS_PREPROCESSED_TTL = 3600 * 2  # 2 hours


class PreprocessingService:
    """Service for handling preprocessing operations on datasets"""

    def __init__(self, tenant_id: str, user_id: Optional[str] = None):
        self.tenant_id = tenant_id
        self.user_id = user_id

    # ============================================
    # Data Retrieval
    # ============================================

    async def get_dataset_dataframe(self, dataset_id: str) -> Optional[pd.DataFrame]:
        """Retrieve dataset as DataFrame from Redis"""
        try:
            redis = await get_redis()
            if redis is None:
                return None

            # Try preprocessed data first
            preprocessed_key = f"{REDIS_PREPROCESSED_PREFIX}{dataset_id}"
            data = await redis.get(preprocessed_key)

            if not data:
                # Fall back to original dataset
                original_key = f"dataset:{dataset_id}"
                data = await redis.get(original_key)

            if data:
                if isinstance(data, bytes):
                    data = data.decode('utf-8')
                df_dict = json.loads(data)

                # Handle both 'split' and 'dict' orientations
                if isinstance(df_dict, dict) and 'columns' in df_dict and 'data' in df_dict:
                    # Data is in 'split' orientation
                    from io import StringIO
                    return pd.read_json(StringIO(data), orient='split')
                else:
                    # Data is in 'dict' orientation (column names as keys)
                    return pd.DataFrame(df_dict)

            return None
        except Exception as e:
            logger.error(f"Error retrieving dataset: {e}")
            return None

    async def save_preprocessed_data(
        self,
        dataset_id: str,
        df: pd.DataFrame,
        entity_id: Optional[str] = None
    ) -> bool:
        """Save preprocessed DataFrame to Redis"""
        try:
            redis = await get_redis()
            if redis is None:
                return False

            key = f"{REDIS_PREPROCESSED_PREFIX}{dataset_id}"
            if entity_id:
                key = f"{key}:{entity_id}"

            # Convert DataFrame to JSON-serializable format
            data = df.to_dict(orient='records')
            await redis.set(key, json.dumps(data, default=str), ex=REDIS_PREPROCESSED_TTL)
            return True
        except Exception as e:
            logger.error(f"Error saving preprocessed data: {e}")
            return False

    # ============================================
    # Entity Operations
    # ============================================

    async def get_entities(
        self,
        dataset_id: str,
        entity_column: Optional[str] = None
    ) -> Tuple[List[EntityInfo], Optional[str]]:
        """Get list of entities in a dataset"""
        df = await self.get_dataset_dataframe(dataset_id)
        if df is None:
            return [], None

        # Try to detect entity column if not provided
        if not entity_column:
            entity_column = self._detect_entity_column(df)

        if not entity_column or entity_column not in df.columns:
            # No entity column - treat entire dataset as single entity
            return [EntityInfo(
                name="All Data",
                row_count=len(df),
                has_missing=df.isnull().any().any(),
                missing_count=int(df.isnull().sum().sum())
            )], None

        entities = []
        for entity_name in df[entity_column].unique():
            entity_df = df[df[entity_column] == entity_name]
            date_col = self._detect_date_column(entity_df)
            date_range = None
            if date_col:
                try:
                    dates = pd.to_datetime(entity_df[date_col], errors='coerce')
                    valid_dates = dates.dropna()
                    if len(valid_dates) > 0:
                        date_range = {
                            "start": valid_dates.min().strftime("%Y-%m-%d"),
                            "end": valid_dates.max().strftime("%Y-%m-%d")
                        }
                except Exception:
                    pass

            entities.append(EntityInfo(
                name=str(entity_name),
                row_count=len(entity_df),
                date_range=date_range,
                has_missing=entity_df.isnull().any().any(),
                missing_count=int(entity_df.isnull().sum().sum())
            ))

        return entities, entity_column

    async def get_entity_data(
        self,
        dataset_id: str,
        entity_id: str,
        entity_column: Optional[str] = None
    ) -> Optional[pd.DataFrame]:
        """Get data for a specific entity"""
        df = await self.get_dataset_dataframe(dataset_id)
        if df is None:
            return None

        if entity_id == "All Data" or not entity_column:
            return df

        if entity_column not in df.columns:
            return df

        return df[df[entity_column] == entity_id].copy()

    async def get_entity_stats(
        self,
        dataset_id: str,
        entity_id: str,
        entity_column: Optional[str] = None
    ) -> Optional[EntityStatsResponse]:
        """Get statistics for a specific entity"""
        df = await self.get_entity_data(dataset_id, entity_id, entity_column)
        if df is None:
            return None

        # Compute statistics
        stats = {}
        missing = {}
        outliers = {}

        for col in df.columns:
            col_data = df[col]
            missing[col] = int(col_data.isnull().sum())

            if pd.api.types.is_numeric_dtype(col_data):
                valid_data = col_data.dropna()
                if len(valid_data) > 0:
                    stats[col] = {
                        "mean": float(valid_data.mean()),
                        "std": float(valid_data.std()) if len(valid_data) > 1 else 0,
                        "min": float(valid_data.min()),
                        "max": float(valid_data.max()),
                        "median": float(valid_data.median()),
                        "q1": float(valid_data.quantile(0.25)),
                        "q3": float(valid_data.quantile(0.75)),
                    }
                    # Count outliers using IQR
                    q1 = valid_data.quantile(0.25)
                    q3 = valid_data.quantile(0.75)
                    iqr = q3 - q1
                    outliers[col] = int(((valid_data < q1 - 1.5 * iqr) | (valid_data > q3 + 1.5 * iqr)).sum())
                else:
                    stats[col] = {"mean": None, "std": None, "min": None, "max": None}
                    outliers[col] = 0
            else:
                stats[col] = {
                    "unique_count": int(col_data.nunique()),
                    "top_value": str(col_data.mode().iloc[0]) if len(col_data.mode()) > 0 else None,
                }
                outliers[col] = 0

        # Get date range
        date_col = self._detect_date_column(df)
        date_range = None
        if date_col:
            try:
                dates = pd.to_datetime(df[date_col], errors='coerce')
                valid_dates = dates.dropna()
                if len(valid_dates) > 0:
                    date_range = {
                        "start": valid_dates.min().strftime("%Y-%m-%d"),
                        "end": valid_dates.max().strftime("%Y-%m-%d")
                    }
            except Exception:
                pass

        return EntityStatsResponse(
            entity=entity_id,
            row_count=len(df),
            column_count=len(df.columns),
            date_range=date_range,
            statistics=stats,
            missing_values=missing,
            outlier_count=outliers
        )

    # ============================================
    # Missing Values
    # ============================================

    async def analyze_missing_values(
        self,
        dataset_id: str,
        entity_id: Optional[str] = None,
        entity_column: Optional[str] = None
    ) -> Dict[str, Any]:
        """Analyze missing values in dataset"""
        if entity_id:
            df = await self.get_entity_data(dataset_id, entity_id, entity_column)
        else:
            df = await self.get_dataset_dataframe(dataset_id)

        if df is None:
            return {"columns": [], "total_missing": 0, "total_cells": 0, "overall_percentage": 0}

        columns = []
        total_rows = len(df)

        for col in df.columns:
            missing_count = int(df[col].isnull().sum())
            columns.append(MissingValuesAnalysis(
                column=col,
                missing_count=missing_count,
                missing_percentage=round((missing_count / total_rows) * 100, 2) if total_rows > 0 else 0,
                total_rows=total_rows
            ))

        total_missing = int(df.isnull().sum().sum())
        total_cells = df.size

        return {
            "columns": [c.model_dump() for c in columns],
            "total_missing": total_missing,
            "total_cells": total_cells,
            "overall_percentage": round((total_missing / total_cells) * 100, 2) if total_cells > 0 else 0
        }

    async def handle_missing_values(
        self,
        dataset_id: str,
        request: MissingValuesRequest,
        entity_id: Optional[str] = None,
        entity_column: Optional[str] = None
    ) -> PreprocessingResultResponse:
        """Handle missing values in dataset"""
        if entity_id:
            df = await self.get_entity_data(dataset_id, entity_id, entity_column)
        else:
            df = await self.get_dataset_dataframe(dataset_id)

        if df is None:
            return PreprocessingResultResponse(
                success=False, message="Dataset not found",
                rows_before=0, rows_after=0, rows_affected=0
            )

        rows_before = len(df)
        columns = request.columns or df.columns.tolist()

        try:
            if request.method == MissingValueMethod.DROP:
                df = df.dropna(subset=columns)
            elif request.method == MissingValueMethod.FILL_ZERO:
                df[columns] = df[columns].fillna(0)
            elif request.method == MissingValueMethod.FILL_MEAN:
                for col in columns:
                    if pd.api.types.is_numeric_dtype(df[col]):
                        df[col] = df[col].fillna(df[col].mean())
            elif request.method == MissingValueMethod.FILL_MEDIAN:
                for col in columns:
                    if pd.api.types.is_numeric_dtype(df[col]):
                        df[col] = df[col].fillna(df[col].median())
            elif request.method == MissingValueMethod.FILL_MODE:
                for col in columns:
                    mode_val = df[col].mode()
                    if len(mode_val) > 0:
                        df[col] = df[col].fillna(mode_val.iloc[0])
            elif request.method == MissingValueMethod.FORWARD_FILL:
                df[columns] = df[columns].ffill()
            elif request.method == MissingValueMethod.BACKWARD_FILL:
                df[columns] = df[columns].bfill()
            elif request.method == MissingValueMethod.LINEAR_INTERPOLATE:
                for col in columns:
                    if pd.api.types.is_numeric_dtype(df[col]):
                        df[col] = df[col].interpolate(method='linear')
            elif request.method == MissingValueMethod.SPLINE_INTERPOLATE:
                for col in columns:
                    if pd.api.types.is_numeric_dtype(df[col]):
                        df[col] = df[col].interpolate(method='spline', order=2)

            rows_after = len(df)
            rows_affected = rows_before - rows_after if request.method == MissingValueMethod.DROP else int(df.isnull().sum().sum())

            # Save preprocessed data
            await self.save_preprocessed_data(dataset_id, df, entity_id)

            return PreprocessingResultResponse(
                success=True,
                message=f"Missing values handled using {request.method.value}",
                rows_before=rows_before,
                rows_after=rows_after,
                rows_affected=rows_affected,
                preview_data=df.head(10).to_dict(orient='records')
            )
        except Exception as e:
            logger.error(f"Error handling missing values: {e}")
            return PreprocessingResultResponse(
                success=False, message=str(e),
                rows_before=rows_before, rows_after=rows_before, rows_affected=0
            )

    # ============================================
    # Duplicates
    # ============================================

    async def analyze_duplicates(
        self,
        dataset_id: str,
        subset: Optional[List[str]] = None,
        entity_id: Optional[str] = None,
        entity_column: Optional[str] = None
    ) -> Dict[str, Any]:
        """Analyze duplicates in dataset"""
        if entity_id:
            df = await self.get_entity_data(dataset_id, entity_id, entity_column)
        else:
            df = await self.get_dataset_dataframe(dataset_id)

        if df is None:
            return {"duplicate_count": 0, "duplicate_percentage": 0}

        duplicates = df.duplicated(subset=subset, keep=False)
        duplicate_count = int(duplicates.sum())

        return {
            "duplicate_count": duplicate_count,
            "duplicate_percentage": round((duplicate_count / len(df)) * 100, 2) if len(df) > 0 else 0,
            "duplicate_rows": df[duplicates].index.tolist()[:100]  # Limit to 100
        }

    async def handle_duplicates(
        self,
        dataset_id: str,
        request: DuplicatesRequest,
        entity_id: Optional[str] = None,
        entity_column: Optional[str] = None
    ) -> PreprocessingResultResponse:
        """Handle duplicates in dataset"""
        if entity_id:
            df = await self.get_entity_data(dataset_id, entity_id, entity_column)
        else:
            df = await self.get_dataset_dataframe(dataset_id)

        if df is None:
            return PreprocessingResultResponse(
                success=False, message="Dataset not found",
                rows_before=0, rows_after=0, rows_affected=0
            )

        rows_before = len(df)

        try:
            if request.method == DuplicateMethod.DROP_FIRST:
                df = df.drop_duplicates(subset=request.subset, keep='last')
            elif request.method == DuplicateMethod.DROP_LAST:
                df = df.drop_duplicates(subset=request.subset, keep='first')
            elif request.method == DuplicateMethod.DROP_ALL:
                df = df.drop_duplicates(subset=request.subset, keep=False)
            elif request.method == DuplicateMethod.KEEP_FIRST:
                df = df.drop_duplicates(subset=request.subset, keep='first')
            elif request.method == DuplicateMethod.KEEP_LAST:
                df = df.drop_duplicates(subset=request.subset, keep='last')
            elif request.method == DuplicateMethod.AVERAGE:
                if request.subset:
                    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
                    df = df.groupby(request.subset, as_index=False)[numeric_cols].mean()

            rows_after = len(df)
            await self.save_preprocessed_data(dataset_id, df, entity_id)

            return PreprocessingResultResponse(
                success=True,
                message=f"Duplicates handled using {request.method.value}",
                rows_before=rows_before,
                rows_after=rows_after,
                rows_affected=rows_before - rows_after,
                preview_data=df.head(10).to_dict(orient='records')
            )
        except Exception as e:
            logger.error(f"Error handling duplicates: {e}")
            return PreprocessingResultResponse(
                success=False, message=str(e),
                rows_before=rows_before, rows_after=rows_before, rows_affected=0
            )

    # ============================================
    # Outliers
    # ============================================

    async def detect_outliers(
        self,
        dataset_id: str,
        request: OutlierRequest,
        entity_id: Optional[str] = None,
        entity_column: Optional[str] = None
    ) -> Dict[str, Any]:
        """Detect outliers in dataset"""
        if entity_id:
            df = await self.get_entity_data(dataset_id, entity_id, entity_column)
        else:
            df = await self.get_dataset_dataframe(dataset_id)

        if df is None:
            return {"method": request.method.value, "threshold": request.threshold, "columns": [], "total_outliers": 0, "total_rows": 0}

        total_rows = len(df)
        columns = request.columns or df.select_dtypes(include=[np.number]).columns.tolist()
        outlier_info = []
        total_outliers = 0

        for col in columns:
            if col not in df.columns or not pd.api.types.is_numeric_dtype(df[col]):
                continue

            col_data = df[col].dropna()
            if len(col_data) == 0:
                continue

            if request.method == OutlierMethod.IQR:
                q1 = col_data.quantile(0.25)
                q3 = col_data.quantile(0.75)
                iqr = q3 - q1
                lower_bound = q1 - request.threshold * iqr
                upper_bound = q3 + request.threshold * iqr
            elif request.method == OutlierMethod.ZSCORE:
                mean = col_data.mean()
                std = col_data.std()
                lower_bound = mean - request.threshold * std
                upper_bound = mean + request.threshold * std
            else:  # percentile
                lower_bound = col_data.quantile(request.lower_percentile)
                upper_bound = col_data.quantile(request.upper_percentile)

            outlier_mask = (df[col] < lower_bound) | (df[col] > upper_bound)
            outlier_count = int(outlier_mask.sum())
            total_outliers += outlier_count

            outlier_info.append(OutlierInfo(
                column=col,
                outlier_count=outlier_count,
                outlier_percentage=round((outlier_count / len(df)) * 100, 2),
                lower_bound=float(lower_bound),
                upper_bound=float(upper_bound),
                outlier_indices=df[outlier_mask].index.tolist()[:50]
            ).model_dump())

        return {
            "method": request.method.value,
            "threshold": request.threshold,
            "columns": outlier_info,
            "total_outliers": total_outliers,
            "total_rows": total_rows
        }

    async def handle_outliers(
        self,
        dataset_id: str,
        request: OutlierRequest,
        entity_id: Optional[str] = None,
        entity_column: Optional[str] = None
    ) -> PreprocessingResultResponse:
        """Handle outliers in dataset"""
        if entity_id:
            df = await self.get_entity_data(dataset_id, entity_id, entity_column)
        else:
            df = await self.get_dataset_dataframe(dataset_id)

        if df is None:
            return PreprocessingResultResponse(
                success=False, message="Dataset not found",
                rows_before=0, rows_after=0, rows_affected=0
            )

        rows_before = len(df)
        columns = request.columns or df.select_dtypes(include=[np.number]).columns.tolist()
        rows_affected = 0

        try:
            for col in columns:
                if col not in df.columns or not pd.api.types.is_numeric_dtype(df[col]):
                    continue

                col_data = df[col].dropna()
                if len(col_data) == 0:
                    continue

                if request.method == OutlierMethod.IQR:
                    q1 = col_data.quantile(0.25)
                    q3 = col_data.quantile(0.75)
                    iqr = q3 - q1
                    lower_bound = q1 - request.threshold * iqr
                    upper_bound = q3 + request.threshold * iqr
                elif request.method == OutlierMethod.ZSCORE:
                    mean = col_data.mean()
                    std = col_data.std()
                    lower_bound = mean - request.threshold * std
                    upper_bound = mean + request.threshold * std
                else:
                    lower_bound = col_data.quantile(request.lower_percentile)
                    upper_bound = col_data.quantile(request.upper_percentile)

                outlier_mask = (df[col] < lower_bound) | (df[col] > upper_bound)
                rows_affected += int(outlier_mask.sum())

                if request.action == OutlierAction.REMOVE:
                    df = df[~outlier_mask]
                elif request.action == OutlierAction.CAP:
                    df.loc[df[col] < lower_bound, col] = lower_bound
                    df.loc[df[col] > upper_bound, col] = upper_bound
                elif request.action == OutlierAction.REPLACE_MEAN:
                    df.loc[outlier_mask, col] = col_data.mean()
                elif request.action == OutlierAction.REPLACE_MEDIAN:
                    df.loc[outlier_mask, col] = col_data.median()
                # FLAG_ONLY does nothing to the data

            rows_after = len(df)
            await self.save_preprocessed_data(dataset_id, df, entity_id)

            return PreprocessingResultResponse(
                success=True,
                message=f"Outliers handled using {request.method.value} + {request.action.value}",
                rows_before=rows_before,
                rows_after=rows_after,
                rows_affected=rows_affected,
                preview_data=df.head(10).to_dict(orient='records')
            )
        except Exception as e:
            logger.error(f"Error handling outliers: {e}")
            return PreprocessingResultResponse(
                success=False, message=str(e),
                rows_before=rows_before, rows_after=rows_before, rows_affected=0
            )

    # ============================================
    # Time Aggregation
    # ============================================

    async def aggregate_time(
        self,
        dataset_id: str,
        request: TimeAggregationRequest,
        entity_id: Optional[str] = None,
        entity_column: Optional[str] = None
    ) -> PreprocessingResultResponse:
        """Aggregate data by time frequency"""
        if entity_id:
            df = await self.get_entity_data(dataset_id, entity_id, entity_column)
        else:
            df = await self.get_dataset_dataframe(dataset_id)

        if df is None:
            return PreprocessingResultResponse(
                success=False, message="Dataset not found",
                rows_before=0, rows_after=0, rows_affected=0
            )

        rows_before = len(df)

        try:
            # Convert date column
            df[request.date_column] = pd.to_datetime(df[request.date_column], errors='coerce')

            # Set date as index
            df = df.set_index(request.date_column)

            # Get value columns
            value_cols = request.value_columns or df.select_dtypes(include=[np.number]).columns.tolist()

            # Get aggregation function
            agg_func = request.method.value

            # Resample and aggregate
            if entity_column and entity_column in df.columns:
                # Group by entity then resample
                df = df.groupby(entity_column).resample(request.frequency.value)[value_cols].agg(agg_func)
                df = df.reset_index()
            else:
                df = df.resample(request.frequency.value)[value_cols].agg(agg_func)
                df = df.reset_index()

            rows_after = len(df)
            await self.save_preprocessed_data(dataset_id, df, entity_id)

            return PreprocessingResultResponse(
                success=True,
                message=f"Data aggregated to {request.frequency.value} using {request.method.value}",
                rows_before=rows_before,
                rows_after=rows_after,
                rows_affected=rows_before - rows_after,
                preview_data=df.head(10).to_dict(orient='records')
            )
        except Exception as e:
            logger.error(f"Error aggregating time: {e}")
            return PreprocessingResultResponse(
                success=False, message=str(e),
                rows_before=rows_before, rows_after=rows_before, rows_affected=0
            )

    # ============================================
    # Value Replacement
    # ============================================

    async def replace_values(
        self,
        dataset_id: str,
        request: ValueReplacementRequest,
        entity_id: Optional[str] = None,
        entity_column: Optional[str] = None
    ) -> PreprocessingResultResponse:
        """Replace values in a column based on match criteria"""
        if entity_id:
            df = await self.get_entity_data(dataset_id, entity_id, entity_column)
        else:
            df = await self.get_dataset_dataframe(dataset_id)

        if df is None:
            return PreprocessingResultResponse(
                success=False, message="Dataset not found",
                rows_before=0, rows_after=0, rows_affected=0
            )

        rows_before = len(df)

        if request.column not in df.columns:
            return PreprocessingResultResponse(
                success=False, message=f"Column '{request.column}' not found",
                rows_before=rows_before, rows_after=rows_before, rows_affected=0
            )

        try:
            col = request.column
            old_val = request.old_value
            new_val = request.new_value

            if request.match_type == "exact":
                # Exact match replacement
                mask = df[col] == old_val
                rows_affected = int(mask.sum())
                df.loc[mask, col] = new_val
            elif request.match_type == "contains":
                # String contains replacement
                if df[col].dtype == 'object':
                    mask = df[col].astype(str).str.contains(str(old_val), na=False)
                    rows_affected = int(mask.sum())
                    df.loc[mask, col] = df.loc[mask, col].astype(str).str.replace(str(old_val), str(new_val), regex=False)
                else:
                    return PreprocessingResultResponse(
                        success=False, message="'contains' match type only works with string columns",
                        rows_before=rows_before, rows_after=rows_before, rows_affected=0
                    )
            elif request.match_type == "regex":
                # Regex replacement
                if df[col].dtype == 'object':
                    mask = df[col].astype(str).str.contains(str(old_val), na=False, regex=True)
                    rows_affected = int(mask.sum())
                    df[col] = df[col].astype(str).str.replace(str(old_val), str(new_val), regex=True)
                else:
                    return PreprocessingResultResponse(
                        success=False, message="'regex' match type only works with string columns",
                        rows_before=rows_before, rows_after=rows_before, rows_affected=0
                    )
            else:
                rows_affected = 0

            await self.save_preprocessed_data(dataset_id, df, entity_id)

            return PreprocessingResultResponse(
                success=True,
                message=f"Replaced {rows_affected} values in column '{col}'",
                rows_before=rows_before,
                rows_after=len(df),
                rows_affected=rows_affected,
                preview_data=df.head(10).to_dict(orient='records')
            )
        except Exception as e:
            logger.error(f"Error replacing values: {e}")
            return PreprocessingResultResponse(
                success=False, message=str(e),
                rows_before=rows_before, rows_after=rows_before, rows_affected=0
            )

    # ============================================
    # Reset & Download
    # ============================================

    async def reset_preprocessing(
        self,
        dataset_id: str,
        entity_id: Optional[str] = None
    ) -> bool:
        """Reset preprocessing by deleting cached preprocessed data"""
        try:
            redis = await get_redis()
            if redis is None:
                return False

            key = f"{REDIS_PREPROCESSED_PREFIX}{dataset_id}"
            if entity_id:
                key = f"{key}:{entity_id}"

            await redis.delete(key)
            return True
        except Exception as e:
            logger.error(f"Error resetting preprocessing: {e}")
            return False

    async def get_preprocessed_data(
        self,
        dataset_id: str,
        entity_id: Optional[str] = None,
        entity_column: Optional[str] = None,
        page: int = 1,
        page_size: int = 100
    ) -> Dict[str, Any]:
        """Get preprocessed data with pagination"""
        if entity_id:
            df = await self.get_entity_data(dataset_id, entity_id, entity_column)
        else:
            df = await self.get_dataset_dataframe(dataset_id)

        if df is None:
            return {"columns": [], "data": [], "total_rows": 0, "page": page, "page_size": page_size, "total_pages": 0}

        total_rows = len(df)
        total_pages = (total_rows + page_size - 1) // page_size

        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        page_data = df.iloc[start_idx:end_idx]

        return {
            "columns": df.columns.tolist(),
            "data": page_data.to_dict(orient='records'),
            "total_rows": total_rows,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages
        }

    # ============================================
    # Helper Methods
    # ============================================

    def _detect_entity_column(self, df: pd.DataFrame) -> Optional[str]:
        """Auto-detect entity column"""
        entity_keywords = ["entity", "product", "item", "sku", "category", "store", "location", "id"]

        for col in df.columns:
            col_lower = col.lower()
            if any(kw in col_lower for kw in entity_keywords):
                if df[col].dtype == 'object' or df[col].nunique() < len(df) * 0.5:
                    return col
        return None

    def _detect_date_column(self, df: pd.DataFrame) -> Optional[str]:
        """Auto-detect date column"""
        date_keywords = ["date", "time", "timestamp", "period", "day", "month", "year"]

        for col in df.columns:
            col_lower = col.lower()
            if any(kw in col_lower for kw in date_keywords):
                return col

            # Try parsing as date
            try:
                pd.to_datetime(df[col].iloc[:10], errors='raise')
                return col
            except Exception:
                continue

        return None
