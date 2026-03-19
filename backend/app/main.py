# ============================================
# LUCENT Backend - FastAPI Main Application
# ============================================

import sys
import asyncio

# Use SelectorEventLoop on Windows for better asyncpg compatibility
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
import logging

from app.config import settings
from app.db.database import init_db, close_db
from app.db.redis_client import init_redis, close_redis
from app.api.v1.api import api_router

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown events"""
    # Startup
    logger.info("🚀 Starting LUCENT Backend...")
    await init_db()
    logger.info("✅ Database initialized")
    await init_redis()
    logger.info("✅ Redis initialized")

    yield

    # Shutdown
    logger.info("👋 Shutting down LUCENT Backend...")
    await close_db()
    await close_redis()
    logger.info("✅ Connections closed")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    description="Multi-Tenant SaaS Platform for Time Series Forecasting",
    version="0.1.0",
    docs_url=f"{settings.API_PREFIX}/docs",
    redoc_url=f"{settings.API_PREFIX}/redoc",
    openapi_url=f"{settings.API_PREFIX}/openapi.json",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
)


# ------------------------------------------------------------------
# Security Headers Middleware
# ------------------------------------------------------------------

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Inject standard security headers into every HTTP response.

    These headers mitigate common browser-side attacks such as
    click-jacking, MIME-type sniffing, and information leakage.
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
        # Prevent caching of API responses that may contain sensitive data
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
        return response


app.add_middleware(SecurityHeadersMiddleware)


# Log validation errors for debugging
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(
        "Validation error on %s %s: %s",
        request.method, request.url.path, exc.errors()
    )
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": settings.APP_NAME,
        "version": "0.1.0",
        "status": "running",
        "environment": settings.APP_ENV,
        "docs": f"{settings.API_PREFIX}/docs"
    }


# Health check endpoint
@app.get(f"{settings.API_PREFIX}/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "environment": settings.APP_ENV,
        "version": "0.1.0"
    }


# API routes
app.include_router(api_router, prefix=settings.API_PREFIX)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower()
    )
