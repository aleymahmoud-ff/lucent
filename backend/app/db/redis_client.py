# ============================================
# Redis Connection & Client Management
# ============================================

import redis.asyncio as redis
import logging
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

# Global Redis client
redis_client: Optional[redis.Redis] = None


async def init_redis():
    """Initialize Redis connection"""
    global redis_client
    try:
        redis_client = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=5,
            socket_keepalive=True,
        )
        # Test connection
        await redis_client.ping()
        logger.info("✅ Redis connection established")
    except Exception as e:
        logger.warning(f"⚠️ Redis connection failed (non-fatal): {e}")
        redis_client = None


async def close_redis():
    """Close Redis connection"""
    global redis_client
    if redis_client:
        await redis_client.close()
        logger.info("Redis connection closed")


async def get_redis() -> redis.Redis:
    """
    Dependency for getting Redis client

    Usage:
        @app.get("/cache")
        async def get_cached_data(redis: Redis = Depends(get_redis)):
            value = await redis.get("key")
            return {"value": value}
    """
    return redis_client


# Cache helper functions
async def cache_set(key: str, value: str, expire: int = 3600) -> bool:
    """Set value in cache with expiration"""
    try:
        await redis_client.setex(key, expire, value)
        return True
    except Exception as e:
        logger.error(f"Cache set error: {e}")
        return False


async def cache_get(key: str) -> Optional[str]:
    """Get value from cache"""
    try:
        return await redis_client.get(key)
    except Exception as e:
        logger.error(f"Cache get error: {e}")
        return None


async def cache_delete(key: str) -> bool:
    """Delete value from cache"""
    try:
        await redis_client.delete(key)
        return True
    except Exception as e:
        logger.error(f"Cache delete error: {e}")
        return False


async def cache_exists(key: str) -> bool:
    """Check if key exists in cache"""
    try:
        return await redis_client.exists(key) > 0
    except Exception as e:
        logger.error(f"Cache exists error: {e}")
        return False
