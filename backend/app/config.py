# ============================================
# LUCENT Backend - Configuration & Settings
# ============================================

from pydantic_settings import BaseSettings
from typing import Optional
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Application
    APP_NAME: str = "LUCENT"
    APP_ENV: str = "development"
    DEBUG: bool = True

    # API
    API_VERSION: str = "v1"
    API_PREFIX: str = "/api/v1"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001"

    # Security
    SECRET_KEY: str
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = 24

    # Database - PostgreSQL
    DATABASE_URL: str
    DATABASE_URL_UNPOOLED: Optional[str] = None
    PGHOST: Optional[str] = None
    PGUSER: Optional[str] = None
    PGDATABASE: Optional[str] = None
    PGPASSWORD: Optional[str] = None
    PGSSLMODE: str = "require"

    # Redis
    REDIS_URL: str
    KV_REST_API_URL: Optional[str] = None
    KV_REST_API_TOKEN: Optional[str] = None

    # Celery
    CELERY_BROKER_URL: Optional[str] = None
    CELERY_RESULT_BACKEND: Optional[str] = None

    # File Upload
    MAX_UPLOAD_SIZE_MB: int = 100
    UPLOAD_DIR: str = "./uploads"

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_PER_MINUTE: int = 60

    # Multi-Tenant Limits
    DEFAULT_MAX_USERS: int = 10
    DEFAULT_MAX_FILE_SIZE_MB: int = 100
    DEFAULT_MAX_ENTITIES_PER_BATCH: int = 50
    DEFAULT_MAX_CONCURRENT_FORECASTS: int = 3
    DEFAULT_MAX_FORECAST_HORIZON: int = 365
    DEFAULT_RATE_LIMIT_FORECASTS_PER_HOUR: int = 20

    # Data Retention
    RETENTION_CLEANUP_INTERVAL_HOURS: int = 24   # How often the cleanup runs (informational; actual schedule is crontab in celery_app.py)
    RETENTION_BATCH_SIZE: int = 100              # Number of expired snapshots processed per batch

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "./logs/lucent.log"

    # Stack Auth
    STACK_PROJECT_ID: Optional[str] = None
    STACK_PUBLISHABLE_CLIENT_KEY: Optional[str] = None
    STACK_SECRET_SERVER_KEY: Optional[str] = None

    # S3 / Object Storage (CranL Storage Bucket)
    # Endpoint format for CranL: https://storage-{bucket-name}.cranl.net
    # Set STORAGE_BACKEND=s3 and all four S3_* vars to enable S3 mode.
    # Leave unset (or STORAGE_BACKEND=local) for local filesystem (development).
    S3_BUCKET: Optional[str] = None
    S3_ACCESS_KEY: Optional[str] = None
    S3_SECRET_KEY: Optional[str] = None
    S3_ENDPOINT_URL: Optional[str] = None       # e.g. https://storage-lucent-data.cranl.net
    S3_REGION: str = "us-east-1"
    STORAGE_BACKEND: str = "local"              # "s3" or "local"
    LOCAL_STORAGE_PATH: str = "./storage"

    @property
    def cors_origins_list(self) -> list[str]:
        """Convert CORS_ORIGINS string to list"""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    @property
    def celery_broker(self) -> str:
        """Get Celery broker URL (fallback to Redis)"""
        return self.CELERY_BROKER_URL or self.REDIS_URL

    @property
    def celery_backend(self) -> str:
        """Get Celery result backend (fallback to Redis)"""
        return self.CELERY_RESULT_BACKEND or self.REDIS_URL

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


# Export settings instance
settings = get_settings()
