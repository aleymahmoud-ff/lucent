"""
Redis-backed rate limiter for expensive API endpoints.

Usage as a FastAPI dependency:

    from app.core.rate_limit import RateLimitForecast

    @router.post("/run")
    async def run_forecast(
        _rl: None = Depends(RateLimitForecast),
        current_user: User = Depends(get_current_user),
        ...
    ):
        ...

The dependency inspects the current authenticated user (via the same JWT
flow used by ``get_current_user``) and increments a per-user counter in
Redis.  When the counter exceeds the configured threshold the request is
rejected with HTTP 429.
"""
import logging
from fastapi import Depends, HTTPException, status
from app.core.deps import get_current_user
from app.db.redis_client import get_redis
from app.models.user import User
from app.config import settings

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Generic rate-limit checker
# ------------------------------------------------------------------

async def _check_rate_limit(
    user: User,
    action: str,
    max_requests: int,
    window_seconds: int = 3600,
) -> None:
    """
    Increment a Redis counter keyed by ``rate_limit:{action}:{user_id}``
    and reject the request when *max_requests* has been exceeded within
    the rolling *window_seconds* window.

    If Redis is unavailable the request is allowed through (fail-open)
    so that the platform degrades gracefully.
    """
    redis = await get_redis()
    if redis is None:
        # Redis not available -- fail open rather than block all requests
        return

    key = f"rate_limit:{action}:{user.id}"
    try:
        current = await redis.incr(key)
        if current == 1:
            # First request in the window -- set the expiry
            await redis.expire(key, window_seconds)

        if current > max_requests:
            ttl = await redis.ttl(key)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Rate limit exceeded for '{action}'. "
                    f"Maximum {max_requests} requests per hour. "
                    f"Try again in {max(ttl, 0)} seconds."
                ),
                headers={"Retry-After": str(max(ttl, 0))},
            )
    except HTTPException:
        raise
    except Exception as exc:
        # Redis error -- fail open
        logger.warning("Rate limiter Redis error (fail-open): %s", exc)


# ------------------------------------------------------------------
# Pre-built FastAPI dependencies for forecast endpoints
# ------------------------------------------------------------------

async def RateLimitForecast(
    current_user: User = Depends(get_current_user),
) -> None:
    """
    Rate-limit dependency for single and batch forecast endpoints.

    Enforces ``settings.DEFAULT_RATE_LIMIT_FORECASTS_PER_HOUR`` (default 20)
    requests per user per hour.
    """
    await _check_rate_limit(
        user=current_user,
        action="forecast",
        max_requests=settings.DEFAULT_RATE_LIMIT_FORECASTS_PER_HOUR,
        window_seconds=3600,
    )
