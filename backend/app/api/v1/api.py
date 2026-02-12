"""
API v1 Router - Aggregates all endpoint routers
"""
from fastapi import APIRouter

from app.api.v1.endpoints import auth, admin, users, groups, connectors, tenants, platform_auth, datasets, preprocessing, forecast

api_router = APIRouter()

# Platform Admin Authentication (separate from tenant auth)
api_router.include_router(platform_auth.router, prefix="/platform", tags=["Platform Admin Authentication"])

# Tenant User Authentication
api_router.include_router(auth.router, prefix="/auth", tags=["Tenant Authentication"])

# Platform Admin Management (requires platform admin token)
api_router.include_router(admin.router, prefix="/admin", tags=["Platform Admin Management"])

# Tenant Admin Endpoints (requires tenant user token with admin role)
api_router.include_router(users.router, prefix="/users", tags=["Users - Tenant Admin"])
api_router.include_router(groups.router, prefix="/groups", tags=["Groups - Tenant Admin"])
api_router.include_router(connectors.router, prefix="/connectors", tags=["Connectors - Tenant Admin"])

# Public Endpoints
api_router.include_router(tenants.router, prefix="/tenants", tags=["Tenants - Public"])

# Data Module Endpoints (Phase 3)
api_router.include_router(datasets.router, prefix="/datasets", tags=["Datasets"])

# Preprocessing Module Endpoints (Phase 4)
api_router.include_router(preprocessing.router, prefix="/preprocessing", tags=["Preprocessing"])

# Forecasting Module Endpoints (Phase 5)
api_router.include_router(forecast.router, prefix="/forecast", tags=["Forecast"])
