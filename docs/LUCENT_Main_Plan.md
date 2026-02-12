# LUCENT Transformation Plan
## R Shiny → Next.js + FastAPI (Multi-Tenant SaaS Architecture)

---

## Executive Summary

Transform LUCENT from a single-user R Shiny application into a **scalable, multi-tenant SaaS platform** with:
- **Frontend:** Next.js 14 + TypeScript + shadcn/ui + Tailwind CSS
- **Backend:** FastAPI + Python
- **Database:** PostgreSQL (multi-tenant)
- **Task Queue:** Celery + Redis
- **Deployment:** Coolify + Docker Compose

### Target Infrastructure
| Resource | Specification |
|----------|---------------|
| CPU | 6 vCPU |
| RAM | 12 GB |
| Storage | 100 GB NVMe |
| Network | 300 Mbit/s |

### Scaling Targets
| Metric | Target Capacity |
|--------|-----------------|
| Tenants (Organizations) | 20-50 |
| Total Users | 200-500 |
| Concurrent Active Users | 30-50 |
| Concurrent Forecasts | 5-8 |
| Max Dataset Size | 2 million rows |

### Storage Mode: Session-Only
| Aspect | Configuration |
|--------|---------------|
| **Data Persistence** | None - session-based only |
| **Database Size** | ~50-500 MB (metadata only) |
| **Redis Role** | Primary temp storage (1-2 GB) |
| **User Workflow** | Upload → Process → Download → Session ends |

### Cloud Services Configuration

#### Neon PostgreSQL (Database)
```bash
# Recommended (with connection pooling)
DATABASE_URL=postgresql://neondb_owner:npg_M5G0ixkwjonq@ep-red-field-ahjnxa6j-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require

# Without pooling (for migrations)
DATABASE_URL_UNPOOLED=postgresql://neondb_owner:npg_M5G0ixkwjonq@ep-red-field-ahjnxa6j.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require

# Individual parameters
PGHOST=ep-red-field-ahjnxa6j-pooler.c-3.us-east-1.aws.neon.tech
PGUSER=neondb_owner
PGDATABASE=neondb
PGPASSWORD=npg_M5G0ixkwjonq
```

#### Upstash Redis (Cache/Sessions)
```bash
# Redis connection
REDIS_URL=rediss://default:AXeTAAIncDJlNDc4MGU2MmVhNjU0MjBiOGJlMGRlZWYyNWI5N2U4YXAyMzA2MTE@secure-seal-30611.upstash.io:6379

# REST API (alternative)
KV_REST_API_URL=https://secure-seal-30611.upstash.io
KV_REST_API_TOKEN=AXeTAAIncDJlNDc4MGU2MmVhNjU0MjBiOGJlMGRlZWYyNWI5N2U4YXAyMzA2MTE
```

#### Neon Auth (Authentication)
```bash
NEXT_PUBLIC_STACK_PROJECT_ID=5120c6db-55e9-4c6c-865f-5681b07326e6
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY=pck_7gm6ah76n80k6rqr78v9p0yh9yye3hmg8m4jqefk4gpn8
STACK_SECRET_SERVER_KEY=ssk_1ebqr9vgf89n1n3fpk7krhnjr1thyaha1amct39tdk4jr
```

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Multi-Tenant Design](#2-multi-tenant-design)
3. [Frontend Architecture](#3-frontend-architecture)
4. [Backend Architecture](#4-backend-architecture)
5. [Database Schema](#5-database-schema)
6. [Data Connectors](#6-data-connectors)
7. [Optimization Levels](#7-optimization-levels)
8. [Module Specifications](#8-module-specifications)
9. [API Endpoints](#9-api-endpoints)
10. [Security & Authentication](#10-security--authentication)
11. [Docker & Deployment](#11-docker--deployment)
12. [Project Structure](#12-project-structure)
13. [Implementation Roadmap](#13-implementation-roadmap)
    - Phase 2: [Multi-Tenant Architecture & RLS](#phase-2-multi-tenant-architecture--rls-week-3-5)

---

## 1. Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         COOLIFY / TRAEFIK                        │
│                    (Reverse Proxy + SSL + Routing)               │
└─────────────────────────────────────────────────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────┐
│     NEXT.JS 14      │ │      FASTAPI        │ │     REDIS       │
│     (Frontend)      │ │     (Backend)       │ │  (Cache/Queue)  │
│                     │ │                     │ │                 │
│ - React 18          │ │ - Python 3.11+      │ │ - Task Queue    │
│ - TypeScript        │ │ - Async/Await       │ │ - Session Cache │
│ - shadcn/ui         │ │ - Pydantic          │ │ - Rate Limiting │
│ - Tailwind CSS      │ │ - SQLAlchemy        │ │                 │
│ - Plotly.js         │ │ - Celery Workers    │ │                 │
└─────────────────────┘ └─────────────────────┘ └─────────────────┘
              │                    │                    │
              └────────────────────┼────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────┐
                    │       POSTGRESQL        │
                    │    (Multi-Tenant DB)    │
                    │                         │
                    │ - Tenant Isolation      │
                    │ - User Management       │
                    │ - Dataset Storage       │
                    │ - Forecast History      │
                    └─────────────────────────┘
```

### Technology Stack Summary

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Frontend Framework** | Next.js | 14.x | React SSR/SSG framework |
| **UI Components** | shadcn/ui | Latest | Accessible component library |
| **Styling** | Tailwind CSS | 3.x | Utility-first CSS |
| **Charts** | Plotly.js | 2.x | Interactive visualizations |
| **State Management** | Zustand | 4.x | Lightweight state management |
| **Data Fetching** | TanStack Query | 5.x | Server state management |
| **Forms** | React Hook Form + Zod | Latest | Form handling + validation |
| **Backend Framework** | FastAPI | 0.109+ | Async Python API |
| **ORM** | SQLAlchemy | 2.x | Database ORM |
| **Validation** | Pydantic | 2.x | Data validation |
| **Task Queue** | Celery | 5.x | Background jobs |
| **Message Broker** | Redis | 7.x | Queue + Cache |
| **Database** | PostgreSQL | 16.x | Primary database |
| **Auth** | NextAuth.js + JWT | 4.x | Authentication |
| **Deployment** | Docker + Coolify | Latest | Container orchestration |

---

## 2. Multi-Tenant Design

### Tenant Isolation Strategy

We will use **Schema-based isolation** with a shared database:

```
PostgreSQL Database: lucent_db
│
├── public (schema)           # Shared tables
│   ├── tenants               # Tenant registry
│   ├── users                 # All users (with tenant_id)
│   └── plans                 # Subscription plans
│
├── tenant_acme (schema)      # Tenant: Acme Corp
│   ├── datasets
│   ├── forecasts
│   ├── preprocess_configs
│   └── audit_logs
│
├── tenant_globex (schema)    # Tenant: Globex Inc
│   ├── datasets
│   ├── forecasts
│   ├── preprocess_configs
│   └── audit_logs
│
└── tenant_xxx (schema)       # More tenants...
```

### Tenant Hierarchy

```
Tenant (Organization)
│
├── Users
│   ├── Admin (full access)
│   ├── Analyst (create/run forecasts)
│   └── Viewer (read-only)
│
├── Datasets
│   ├── Dataset 1
│   │   ├── Entities
│   │   └── Preprocessed versions
│   └── Dataset 2
│
├── Forecasts
│   ├── Forecast runs
│   └── Results & metrics
│
└── Settings
    ├── Default parameters
    ├── Data connectors
    └── Usage limits
```

### Multi-Tenant Middleware (FastAPI)

```python
# middleware/tenant.py
class TenantMiddleware:
    async def __call__(self, request: Request, call_next):
        # Extract tenant from JWT token or subdomain
        tenant_id = extract_tenant(request)

        # Set schema search path for this request
        request.state.tenant_id = tenant_id
        request.state.db_schema = f"tenant_{tenant_id}"

        # Set PostgreSQL search_path
        await set_search_path(request.state.db_schema)

        response = await call_next(request)
        return response
```

### Tenant-Aware Queries

```python
# All queries automatically scoped to tenant
class DatasetService:
    def __init__(self, tenant_id: str):
        self.schema = f"tenant_{tenant_id}"

    async def get_datasets(self) -> List[Dataset]:
        # Automatically queries tenant's schema
        return await Dataset.filter(schema=self.schema).all()
```

---

## 3. Frontend Architecture

### Page Structure (Next.js App Router)

```
app/
├── (auth)/
│   ├── login/page.tsx
│   ├── register/page.tsx
│   └── forgot-password/page.tsx
│
├── (dashboard)/
│   ├── layout.tsx                 # Dashboard layout with sidebar
│   ├── page.tsx                   # Dashboard home
│   │
│   ├── data/
│   │   ├── page.tsx               # Data upload & preview
│   │   ├── [datasetId]/page.tsx   # Dataset details
│   │   └── connectors/page.tsx    # Data connectors setup
│   │
│   ├── preprocessing/
│   │   ├── page.tsx               # Preprocessing main
│   │   └── [datasetId]/page.tsx   # Preprocess specific dataset
│   │
│   ├── forecast/
│   │   ├── page.tsx               # Forecast configuration
│   │   ├── [forecastId]/page.tsx  # Forecast details
│   │   └── batch/page.tsx         # Batch forecasting
│   │
│   ├── results/
│   │   ├── page.tsx               # Results overview
│   │   └── [forecastId]/page.tsx  # Specific forecast results
│   │
│   ├── diagnostics/
│   │   ├── page.tsx               # Diagnostics main
│   │   └── compare/page.tsx       # Model comparison
│   │
│   ├── settings/
│   │   ├── page.tsx               # User settings
│   │   ├── team/page.tsx          # Team management (admin)
│   │   ├── connectors/page.tsx    # Data connectors
│   │   └── billing/page.tsx       # Subscription (if needed)
│   │
│   └── help/page.tsx              # Documentation
│
├── api/                           # API routes (proxy to FastAPI)
│   └── [...path]/route.ts
│
├── layout.tsx                     # Root layout
└── page.tsx                       # Landing page
```

### Component Library Structure

```
components/
├── ui/                            # shadcn/ui components
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   ├── dropdown-menu.tsx
│   ├── input.tsx
│   ├── select.tsx
│   ├── table.tsx
│   ├── tabs.tsx
│   ├── toast.tsx
│   └── ...
│
├── charts/                        # Plotly chart wrappers
│   ├── TimeSeriesChart.tsx
│   ├── ForecastChart.tsx
│   ├── ResidualPlot.tsx
│   ├── ACFPlot.tsx
│   ├── QQPlot.tsx
│   ├── SeasonalityPlot.tsx
│   └── ComparisonChart.tsx
│
├── data/                          # Data module components
│   ├── FileUploader.tsx
│   ├── DataPreview.tsx
│   ├── DataSummary.tsx
│   ├── MissingValuesChart.tsx
│   ├── ConnectorModal.tsx
│   └── SampleDataButton.tsx
│
├── preprocessing/                 # Preprocessing components
│   ├── EntitySelector.tsx
│   ├── StatisticsPanel.tsx
│   ├── MissingValuesHandler.tsx
│   ├── DuplicatesHandler.tsx
│   ├── OutlierHandler.tsx
│   ├── ValueReplacer.tsx
│   ├── TimeAggregator.tsx
│   └── PreprocessingPreview.tsx
│
├── forecast/                      # Forecast components
│   ├── MethodSelector.tsx
│   ├── ARIMASettings.tsx
│   ├── ETSSettings.tsx
│   ├── ProphetSettings.tsx
│   ├── ForecastSettings.tsx
│   ├── CrossValidationSettings.tsx
│   ├── BatchForecastPanel.tsx
│   └── ForecastProgress.tsx
│
├── results/                       # Results components
│   ├── MetricsCards.tsx
│   ├── ForecastPlot.tsx
│   ├── ResultsTable.tsx
│   ├── ForecastStatistics.tsx
│   ├── ModelSummary.tsx
│   ├── ExportPanel.tsx
│   └── CVResults.tsx
│
├── diagnostics/                   # Diagnostics components
│   ├── ResidualAnalysis.tsx
│   ├── ModelParameters.tsx
│   ├── SeasonalityAnalysis.tsx
│   ├── ForecastEvaluation.tsx
│   ├── QualityIndicators.tsx
│   ├── ModelComparison.tsx
│   └── DiagnosticsExport.tsx
│
├── layout/                        # Layout components
│   ├── Sidebar.tsx
│   ├── Header.tsx
│   ├── Footer.tsx
│   ├── Breadcrumbs.tsx
│   └── StatusBar.tsx
│
├── shared/                        # Shared components
│   ├── LoadingSpinner.tsx
│   ├── ErrorBoundary.tsx
│   ├── ConfirmDialog.tsx
│   ├── StatusBadge.tsx
│   ├── ProgressBar.tsx
│   └── Tooltip.tsx
│
└── admin/                         # Admin components
    ├── UserManagement.tsx
    ├── TenantSettings.tsx
    ├── UsageStats.tsx
    └── AuditLog.tsx
```

### State Management (Zustand)

```typescript
// stores/forecastStore.ts
interface ForecastState {
  // Current dataset
  currentDataset: Dataset | null;
  currentEntity: string | null;

  // Preprocessing state
  preprocessConfig: PreprocessConfig;
  preprocessedData: DataFrame | null;

  // Forecast configuration
  forecastMethod: 'arima' | 'ets' | 'prophet';
  forecastHorizon: number;
  confidenceLevel: number;
  methodSettings: MethodSettings;

  // Results
  forecastResults: ForecastResult | null;
  metrics: Metrics | null;

  // Actions
  setDataset: (dataset: Dataset) => void;
  setEntity: (entity: string) => void;
  updatePreprocessConfig: (config: Partial<PreprocessConfig>) => void;
  runForecast: () => Promise<void>;
  // ...
}
```

---

## 4. Backend Architecture

### Application Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app entry
│   ├── config.py                  # Settings & configuration
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── deps.py                # Dependency injection
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── router.py          # Main API router
│   │   │   ├── auth.py            # Authentication endpoints
│   │   │   ├── users.py           # User management
│   │   │   ├── tenants.py         # Tenant management
│   │   │   ├── datasets.py        # Dataset endpoints
│   │   │   ├── preprocessing.py   # Preprocessing endpoints
│   │   │   ├── forecast.py        # Forecast endpoints
│   │   │   ├── results.py         # Results endpoints
│   │   │   ├── diagnostics.py     # Diagnostics endpoints
│   │   │   ├── connectors.py      # Data connectors
│   │   │   └── exports.py         # Export endpoints
│   │   └── websocket.py           # WebSocket for progress
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── security.py            # JWT, password hashing
│   │   ├── permissions.py         # Role-based access
│   │   └── rate_limiter.py        # Rate limiting
│   │
│   ├── db/
│   │   ├── __init__.py
│   │   ├── database.py            # Database connection
│   │   ├── session.py             # Session management
│   │   └── tenant.py              # Tenant schema management
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py                # User model
│   │   ├── tenant.py              # Tenant model
│   │   ├── dataset.py             # Dataset model
│   │   ├── forecast.py            # Forecast model
│   │   └── connector.py           # Connector model
│   │
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── user.py                # User Pydantic schemas
│   │   ├── dataset.py             # Dataset schemas
│   │   ├── preprocessing.py       # Preprocessing schemas
│   │   ├── forecast.py            # Forecast schemas
│   │   └── connector.py           # Connector schemas
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── auth_service.py        # Authentication logic
│   │   ├── user_service.py        # User management
│   │   ├── dataset_service.py     # Dataset operations
│   │   ├── preprocessing_service.py
│   │   ├── forecast_service.py    # Forecasting logic
│   │   ├── diagnostics_service.py
│   │   └── export_service.py      # Report generation
│   │
│   ├── forecasting/
│   │   ├── __init__.py
│   │   ├── base.py                # Base forecaster class
│   │   ├── arima.py               # ARIMA implementation
│   │   ├── ets.py                 # ETS implementation
│   │   ├── prophet_model.py       # Prophet implementation
│   │   ├── cross_validation.py    # CV logic
│   │   └── metrics.py             # MAE, RMSE, MAPE
│   │
│   ├── connectors/
│   │   ├── __init__.py
│   │   ├── base.py                # Base connector class
│   │   ├── postgres.py            # PostgreSQL connector
│   │   ├── mysql.py               # MySQL connector
│   │   ├── snowflake.py           # Snowflake connector
│   │   ├── bigquery.py            # BigQuery connector
│   │   ├── s3.py                  # AWS S3 connector
│   │   ├── azure_blob.py          # Azure Blob connector
│   │   ├── gcs.py                 # Google Cloud Storage
│   │   └── api_connector.py       # Generic REST API
│   │
│   ├── middleware/
│   │   ├── __init__.py
│   │   ├── tenant.py              # Tenant context
│   │   ├── logging.py             # Request logging
│   │   └── error_handler.py       # Global error handling
│   │
│   └── workers/
│       ├── __init__.py
│       ├── celery_app.py          # Celery configuration
│       ├── forecast_tasks.py      # Forecast background tasks
│       └── export_tasks.py        # Export background tasks
│
├── alembic/                       # Database migrations
│   ├── versions/
│   └── env.py
│
├── tests/
│   ├── conftest.py
│   ├── test_auth.py
│   ├── test_datasets.py
│   ├── test_forecast.py
│   └── ...
│
├── requirements.txt
├── Dockerfile
└── celery_worker.sh
```

### Forecasting Service

```python
# services/forecast_service.py
from app.forecasting import ARIMAForecaster, ETSForecaster, ProphetForecaster

class ForecastService:
    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id
        self.forecasters = {
            'arima': ARIMAForecaster,
            'ets': ETSForecaster,
            'prophet': ProphetForecaster
        }

    async def run_forecast(
        self,
        dataset_id: str,
        entity_id: str,
        method: str,
        config: ForecastConfig
    ) -> ForecastResult:
        # Get preprocessed data
        data = await self.get_preprocessed_data(dataset_id, entity_id)

        # Initialize forecaster
        forecaster = self.forecasters[method](config)

        # Fit and predict
        model = forecaster.fit(data)
        predictions = forecaster.predict(config.horizon)

        # Calculate metrics (if historical data available)
        metrics = forecaster.evaluate(data, predictions)

        # Store results
        result = await self.save_forecast(
            dataset_id, entity_id, method, predictions, metrics
        )

        return result

    async def run_batch_forecast(
        self,
        dataset_id: str,
        entity_ids: List[str],
        method: str,
        config: ForecastConfig,
        max_parallel: int = 4
    ) -> List[ForecastResult]:
        # Queue jobs for parallel processing
        tasks = []
        for entity_id in entity_ids:
            task = forecast_task.delay(
                self.tenant_id, dataset_id, entity_id, method, config
            )
            tasks.append(task)

        # Collect results
        results = await gather_results(tasks, max_parallel)
        return results
```

---

## 5. Database Schema (Session-Only Mode)

### Overview

With session-only storage, the database is **minimal** - only storing:
- User accounts & authentication
- Tenant/organization settings
- Data connector configurations
- Audit logs & usage statistics

**All actual data (datasets, forecasts, results) lives in Redis with TTL.**

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      DATA FLOW                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   User Upload ──▶ Memory/Temp ──▶ Redis ──▶ Process        │
│                                      │                       │
│                                      ▼                       │
│                              Redis (Cache)                   │
│                              - Session data (TTL: 30 min)   │
│                              - Uploaded data (TTL: 30 min)  │
│                              - Preprocessed (TTL: 30 min)   │
│                              - Forecast results (TTL: 1 hr) │
│                                      │                       │
│                                      ▼                       │
│                          User Downloads Results              │
│                          (Excel/CSV/PDF)                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema (6 Tables)

```sql
-- =====================================================
-- TENANTS TABLE
-- Stores organization/company information
-- =====================================================
CREATE TABLE tenants (
    id VARCHAR(36) PRIMARY KEY,  -- UUID as string for MySQL compatibility
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    settings JSON DEFAULT '{}',
    limits JSON DEFAULT '{
        "max_users": 10,
        "max_file_size_mb": 100,
        "max_entities_per_batch": 50,
        "max_concurrent_forecasts": 3,
        "max_forecast_horizon": 365,
        "rate_limit_forecasts_per_hour": 20
    }',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,

    INDEX idx_tenants_slug (slug),
    INDEX idx_tenants_active (is_active)
);

-- =====================================================
-- USERS TABLE
-- Stores user accounts with tenant association
-- =====================================================
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role ENUM('admin', 'analyst', 'viewer') DEFAULT 'analyst',
    settings JSON DEFAULT '{}',
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    INDEX idx_users_tenant (tenant_id),
    INDEX idx_users_email (email),
    INDEX idx_users_active (is_active)
);

-- =====================================================
-- CONNECTORS TABLE
-- Stores data connector configurations (encrypted)
-- =====================================================
CREATE TABLE connectors (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type ENUM('postgres', 'mysql', 'sqlserver', 's3', 'azure_blob', 'gcs', 'bigquery', 'snowflake', 'api') NOT NULL,
    config TEXT NOT NULL,  -- Encrypted JSON
    is_active BOOLEAN DEFAULT TRUE,
    last_tested_at TIMESTAMP NULL,
    last_test_status VARCHAR(50),
    created_by VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_connectors_tenant (tenant_id),
    INDEX idx_connectors_type (type)
);

-- =====================================================
-- AUDIT_LOGS TABLE
-- Tracks user actions for security/compliance
-- =====================================================
CREATE TABLE audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    details JSON,
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_audit_tenant (tenant_id),
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_created (created_at),
    INDEX idx_audit_action (action)
);

-- =====================================================
-- USAGE_STATS TABLE
-- Tracks usage for quotas and billing
-- =====================================================
CREATE TABLE usage_stats (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36),
    action ENUM('forecast_run', 'batch_forecast', 'data_upload', 'export', 'connector_fetch') NOT NULL,
    entity_count INT DEFAULT 1,
    processing_time_ms INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_usage_tenant (tenant_id),
    INDEX idx_usage_user (user_id),
    INDEX idx_usage_created (created_at),
    INDEX idx_usage_action (action)
);

-- =====================================================
-- FORECAST_HISTORY TABLE
-- Stores forecast metadata only (not results)
-- For analytics and usage patterns
-- =====================================================
CREATE TABLE forecast_history (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36),
    method ENUM('arima', 'ets', 'prophet') NOT NULL,
    entity_count INT NOT NULL,
    horizon INT NOT NULL,
    frequency VARCHAR(20),
    metrics JSON,  -- Just MAE, RMSE, MAPE values
    processing_time_ms INT,
    status ENUM('completed', 'failed', 'timeout') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_history_tenant (tenant_id),
    INDEX idx_history_user (user_id),
    INDEX idx_history_method (method),
    INDEX idx_history_created (created_at)
);
```

### Redis Key Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    REDIS KEY PATTERNS                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  SESSION DATA                                                │
│  ├── session:{session_id}           TTL: 30 min             │
│  │   └── {user_id, tenant_id, permissions}                  │
│  │                                                           │
│  UPLOADED DATA                                               │
│  ├── data:{session_id}:{dataset_key} TTL: 30 min            │
│  │   └── {dataframe as JSON/msgpack}                        │
│  │                                                           │
│  PREPROCESSED DATA                                           │
│  ├── prep:{session_id}:{entity_id}   TTL: 30 min            │
│  │   └── {preprocessed dataframe}                           │
│  │                                                           │
│  FORECAST RESULTS                                            │
│  ├── forecast:{session_id}:{forecast_id} TTL: 1 hour        │
│  │   └── {predictions, metrics, diagnostics}                │
│  │                                                           │
│  TASK PROGRESS                                               │
│  ├── progress:{task_id}              TTL: 10 min            │
│  │   └── {status, percent, message}                         │
│  │                                                           │
│  RATE LIMITING                                               │
│  ├── rate:{tenant_id}:{action}:{hour} TTL: 1 hour           │
│  │   └── {count}                                            │
│  │                                                           │
│  CACHE                                                       │
│  └── cache:{tenant_id}:{key}         TTL: varies            │
│      └── {cached data}                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Estimated Sizes

| Component | Records (1 year) | Size |
|-----------|------------------|------|
| Tenants | 50 | ~50 KB |
| Users | 500 | ~1 MB |
| Connectors | 100 | ~200 KB |
| Audit Logs | 100,000 | ~50 MB |
| Usage Stats | 500,000 | ~100 MB |
| Forecast History | 10,000 | ~10 MB |
| **Total DB** | | **~160 MB** |
| **Redis (peak)** | | **1-2 GB** |

---

## 6. Data Connectors

### Supported Connectors

| Category | Connector | Features |
|----------|-----------|----------|
| **File Upload** | CSV, Excel | Direct upload, template download |
| **Databases** | PostgreSQL | Query builder, scheduled sync |
| | MySQL | Query builder, scheduled sync |
| | SQL Server | Query builder, scheduled sync |
| | Snowflake | Warehouse integration |
| | BigQuery | Google Cloud integration |
| **Cloud Storage** | AWS S3 | CSV/Parquet files |
| | Azure Blob | CSV/Parquet files |
| | Google Cloud Storage | CSV/Parquet files |
| **APIs** | REST API | Custom endpoint, auth support |
| | GraphQL | Query-based fetch |

### Connector Architecture

```python
# connectors/base.py
from abc import ABC, abstractmethod
from typing import Optional
import pandas as pd

class BaseConnector(ABC):
    """Base class for all data connectors"""

    def __init__(self, config: dict, tenant_id: str):
        self.config = config
        self.tenant_id = tenant_id
        self.connection = None

    @abstractmethod
    async def test_connection(self) -> tuple[bool, str]:
        """Test if connection is valid"""
        pass

    @abstractmethod
    async def fetch_data(
        self,
        query: Optional[str] = None,
        table: Optional[str] = None,
        filters: Optional[dict] = None
    ) -> pd.DataFrame:
        """Fetch data from source"""
        pass

    @abstractmethod
    async def list_tables(self) -> list[str]:
        """List available tables/files"""
        pass

    @abstractmethod
    async def get_schema(self, table: str) -> dict:
        """Get table/file schema"""
        pass

    def validate_data(self, df: pd.DataFrame) -> tuple[bool, list[str]]:
        """Validate data has required columns"""
        required = ['Date', 'Entity_ID', 'Entity_Name', 'Volume']
        missing = [col for col in required if col not in df.columns]
        return len(missing) == 0, missing
```

### Connector Implementation Example

```python
# connectors/postgres.py
import asyncpg
import pandas as pd
from .base import BaseConnector

class PostgreSQLConnector(BaseConnector):
    async def test_connection(self) -> tuple[bool, str]:
        try:
            conn = await asyncpg.connect(
                host=self.config['host'],
                port=self.config['port'],
                user=self.config['user'],
                password=self.config['password'],
                database=self.config['database']
            )
            await conn.close()
            return True, "Connection successful"
        except Exception as e:
            return False, str(e)

    async def fetch_data(
        self,
        query: Optional[str] = None,
        table: Optional[str] = None,
        filters: Optional[dict] = None
    ) -> pd.DataFrame:
        conn = await self._get_connection()
        try:
            if query:
                rows = await conn.fetch(query)
            else:
                sql = f"SELECT * FROM {table}"
                if filters:
                    where_clauses = [f"{k} = ${i+1}" for i, k in enumerate(filters.keys())]
                    sql += " WHERE " + " AND ".join(where_clauses)
                rows = await conn.fetch(sql, *filters.values())

            return pd.DataFrame([dict(r) for r in rows])
        finally:
            await conn.close()

    async def list_tables(self) -> list[str]:
        conn = await self._get_connection()
        try:
            rows = await conn.fetch("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
            """)
            return [r['table_name'] for r in rows]
        finally:
            await conn.close()
```

### Cloud Storage Connector Example

```python
# connectors/s3.py
import boto3
import pandas as pd
from io import BytesIO
from .base import BaseConnector

class S3Connector(BaseConnector):
    async def test_connection(self) -> tuple[bool, str]:
        try:
            client = boto3.client(
                's3',
                aws_access_key_id=self.config['access_key'],
                aws_secret_access_key=self.config['secret_key'],
                region_name=self.config.get('region', 'us-east-1')
            )
            client.head_bucket(Bucket=self.config['bucket'])
            return True, "Connection successful"
        except Exception as e:
            return False, str(e)

    async def fetch_data(
        self,
        query: Optional[str] = None,
        table: Optional[str] = None,  # file path in S3
        filters: Optional[dict] = None
    ) -> pd.DataFrame:
        client = boto3.client('s3', **self._get_credentials())

        obj = client.get_object(
            Bucket=self.config['bucket'],
            Key=table  # file path
        )

        if table.endswith('.csv'):
            df = pd.read_csv(BytesIO(obj['Body'].read()))
        elif table.endswith('.parquet'):
            df = pd.read_parquet(BytesIO(obj['Body'].read()))
        elif table.endswith('.xlsx'):
            df = pd.read_excel(BytesIO(obj['Body'].read()))
        else:
            raise ValueError(f"Unsupported file format: {table}")

        return df

    async def list_tables(self) -> list[str]:
        client = boto3.client('s3', **self._get_credentials())

        response = client.list_objects_v2(
            Bucket=self.config['bucket'],
            Prefix=self.config.get('prefix', '')
        )

        files = []
        for obj in response.get('Contents', []):
            key = obj['Key']
            if key.endswith(('.csv', '.parquet', '.xlsx')):
                files.append(key)

        return files
```

### Connector UI Component

```typescript
// components/data/ConnectorModal.tsx
interface ConnectorConfig {
  type: 'postgres' | 'mysql' | 's3' | 'azure' | 'bigquery' | 'snowflake' | 'api';
  name: string;
  config: Record<string, any>;
}

const connectorFields: Record<string, Field[]> = {
  postgres: [
    { name: 'host', label: 'Host', type: 'text', required: true },
    { name: 'port', label: 'Port', type: 'number', default: 5432 },
    { name: 'database', label: 'Database', type: 'text', required: true },
    { name: 'user', label: 'Username', type: 'text', required: true },
    { name: 'password', label: 'Password', type: 'password', required: true },
  ],
  s3: [
    { name: 'access_key', label: 'Access Key ID', type: 'text', required: true },
    { name: 'secret_key', label: 'Secret Access Key', type: 'password', required: true },
    { name: 'bucket', label: 'Bucket Name', type: 'text', required: true },
    { name: 'region', label: 'Region', type: 'select', options: AWS_REGIONS },
    { name: 'prefix', label: 'Path Prefix', type: 'text' },
  ],
  // ... more connector types
};
```

---

## 7. Optimization Levels

### Level 1: Core Optimizations (Free/Built-in)

| Optimization | Implementation | Impact |
|--------------|----------------|--------|
| **Redis Caching** | Cache preprocessed data, frequent queries | -50% DB load |
| **Swap File** | 4-8 GB swap on Windows | +4-8 GB virtual RAM |
| **Connection Pooling** | SQLAlchemy pool, Redis pool | -30% connection overhead |
| **Gzip Compression** | Compress API responses | -60% bandwidth |
| **Query Optimization** | Indexes, query analysis | -40% query time |
| **Lazy Loading** | Load entities on demand | -50% initial load time |

```python
# Level 1: Redis caching implementation
from redis import asyncio as aioredis
from functools import wraps
import json

class CacheManager:
    def __init__(self, redis_url: str):
        self.redis = aioredis.from_url(redis_url)

    async def get_or_set(
        self,
        key: str,
        factory: Callable,
        ttl: int = 3600
    ):
        """Get from cache or compute and cache"""
        cached = await self.redis.get(key)
        if cached:
            return json.loads(cached)

        result = await factory()
        await self.redis.setex(key, ttl, json.dumps(result))
        return result

    def cache_preprocessed_data(self, ttl: int = 1800):
        """Decorator to cache preprocessed data"""
        def decorator(func):
            @wraps(func)
            async def wrapper(dataset_id: str, entity_id: str, config_hash: str):
                key = f"preprocess:{dataset_id}:{entity_id}:{config_hash}"
                return await self.get_or_set(key, lambda: func(dataset_id, entity_id), ttl)
            return wrapper
        return decorator

# Usage
cache = CacheManager(settings.REDIS_URL)

@cache.cache_preprocessed_data(ttl=1800)
async def get_preprocessed_data(dataset_id: str, entity_id: str):
    # Expensive preprocessing
    ...
```

```python
# Level 1: Connection pooling
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.pool import QueuePool

engine = create_async_engine(
    settings.DATABASE_URL,
    poolclass=QueuePool,
    pool_size=5,           # Base connections
    max_overflow=10,       # Additional connections under load
    pool_timeout=30,       # Wait time for connection
    pool_recycle=1800,     # Recycle connections every 30 min
    pool_pre_ping=True,    # Verify connection before use
)
```

### Level 2: Queue Management

| Feature | Implementation | Impact |
|---------|----------------|--------|
| **Celery Task Queue** | Background forecast jobs | Non-blocking UI |
| **Priority Queues** | Small jobs first | Better responsiveness |
| **Worker Limits** | Max 4 concurrent workers | Prevent RAM exhaustion |
| **Job Timeout** | 5 min max per forecast | Prevent stuck jobs |
| **Retry Logic** | 3 retries with backoff | Handle transient failures |
| **Progress Tracking** | WebSocket updates | Real-time feedback |

```python
# Level 2: Celery configuration
# workers/celery_app.py
from celery import Celery
from kombu import Queue

celery_app = Celery(
    'lucent',
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    # Task settings
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],

    # Worker settings
    worker_concurrency=4,              # Max 4 concurrent tasks
    worker_prefetch_multiplier=1,      # Fetch 1 task at a time
    worker_max_tasks_per_child=50,     # Restart worker after 50 tasks (memory cleanup)

    # Task execution limits
    task_time_limit=300,               # Hard limit: 5 minutes
    task_soft_time_limit=270,          # Soft limit: 4.5 minutes (for cleanup)

    # Retry settings
    task_acks_late=True,               # Acknowledge after completion
    task_reject_on_worker_lost=True,   # Retry if worker dies

    # Priority queues
    task_queues=(
        Queue('high', routing_key='high'),      # Quick jobs
        Queue('default', routing_key='default'), # Normal jobs
        Queue('low', routing_key='low'),        # Batch jobs
    ),
    task_default_queue='default',

    # Rate limiting
    task_annotations={
        'forecast_tasks.run_forecast': {
            'rate_limit': '10/m',  # Max 10 forecasts per minute per worker
        },
        'forecast_tasks.run_batch_forecast': {
            'rate_limit': '2/m',   # Max 2 batch jobs per minute
        },
    }
)

# Priority-based routing
def get_task_priority(entity_count: int) -> str:
    if entity_count == 1:
        return 'high'
    elif entity_count <= 10:
        return 'default'
    else:
        return 'low'
```

```python
# Level 2: Forecast task with progress tracking
# workers/forecast_tasks.py
from celery import shared_task
from app.services.forecast_service import ForecastService
import asyncio

@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
)
def run_forecast_task(
    self,
    tenant_id: str,
    forecast_id: str,
    dataset_id: str,
    entity_id: str,
    method: str,
    config: dict
):
    """Run a single forecast as a background task"""
    try:
        # Update status to running
        update_forecast_status(forecast_id, 'running')

        # Run forecast
        service = ForecastService(tenant_id)
        result = asyncio.run(
            service.run_forecast(dataset_id, entity_id, method, config)
        )

        # Store results
        save_forecast_results(forecast_id, result)
        update_forecast_status(forecast_id, 'completed')

        # Send WebSocket notification
        notify_client(tenant_id, forecast_id, 'completed', result.metrics)

        return {'status': 'success', 'forecast_id': forecast_id}

    except SoftTimeLimitExceeded:
        update_forecast_status(forecast_id, 'timeout')
        notify_client(tenant_id, forecast_id, 'timeout')
        raise

    except Exception as e:
        update_forecast_status(forecast_id, 'failed', str(e))
        notify_client(tenant_id, forecast_id, 'failed', str(e))
        raise


@shared_task(bind=True)
def run_batch_forecast_task(
    self,
    tenant_id: str,
    batch_id: str,
    dataset_id: str,
    entity_ids: list[str],
    method: str,
    config: dict
):
    """Run forecasts for multiple entities"""
    total = len(entity_ids)
    completed = 0
    failed = 0

    for entity_id in entity_ids:
        try:
            # Update progress
            progress = (completed + failed) / total * 100
            self.update_state(
                state='PROGRESS',
                meta={'current': completed + failed, 'total': total, 'percent': progress}
            )
            notify_client(tenant_id, batch_id, 'progress', {'percent': progress})

            # Run individual forecast
            run_forecast_task.delay(
                tenant_id, f"{batch_id}_{entity_id}",
                dataset_id, entity_id, method, config
            )
            completed += 1

        except Exception as e:
            failed += 1
            log_error(f"Batch forecast failed for {entity_id}: {e}")

    return {'completed': completed, 'failed': failed, 'total': total}
```

### Level 3: Smart UI Limits

| Limit | Default Value | Configurable | Purpose |
|-------|---------------|--------------|---------|
| **Max file size** | 100 MB | Per tenant | Prevent memory issues |
| **Max rows per dataset** | 500,000 | Per tenant | Query performance |
| **Max entities per batch** | 50 | Per tenant | Prevent queue flooding |
| **Max forecast horizon** | 365 days | Per method | Accuracy concerns |
| **Rate limit: forecasts** | 20/hour | Per user | Fair usage |
| **Rate limit: uploads** | 10/hour | Per user | Storage management |
| **Concurrent forecasts** | 3 | Per tenant | Resource sharing |
| **Session timeout** | 30 min | Global | Security |

```python
# Level 3: Limit enforcement
# core/limits.py
from dataclasses import dataclass
from typing import Optional

@dataclass
class TenantLimits:
    max_users: int = 10
    max_datasets: int = 50
    max_file_size_mb: int = 100
    max_rows_per_dataset: int = 500_000
    max_entities_per_batch: int = 50
    max_forecast_horizon: int = 365
    max_concurrent_forecasts: int = 3
    rate_limit_forecasts_per_hour: int = 20
    rate_limit_uploads_per_hour: int = 10

class LimitEnforcer:
    def __init__(self, tenant_id: str, redis: Redis):
        self.tenant_id = tenant_id
        self.redis = redis
        self.limits = self._load_tenant_limits()

    async def check_file_upload(self, file_size_bytes: int) -> tuple[bool, str]:
        max_bytes = self.limits.max_file_size_mb * 1024 * 1024
        if file_size_bytes > max_bytes:
            return False, f"File size exceeds limit of {self.limits.max_file_size_mb} MB"

        # Check rate limit
        key = f"rate:upload:{self.tenant_id}:{get_current_hour()}"
        count = await self.redis.incr(key)
        await self.redis.expire(key, 3600)

        if count > self.limits.rate_limit_uploads_per_hour:
            return False, "Upload rate limit exceeded. Try again later."

        return True, "OK"

    async def check_forecast_request(
        self,
        user_id: str,
        entity_count: int,
        horizon: int
    ) -> tuple[bool, str]:
        # Check horizon
        if horizon > self.limits.max_forecast_horizon:
            return False, f"Forecast horizon exceeds limit of {self.limits.max_forecast_horizon} days"

        # Check batch size
        if entity_count > self.limits.max_entities_per_batch:
            return False, f"Batch size exceeds limit of {self.limits.max_entities_per_batch} entities"

        # Check concurrent forecasts
        running = await self._count_running_forecasts()
        if running >= self.limits.max_concurrent_forecasts:
            return False, f"Maximum concurrent forecasts ({self.limits.max_concurrent_forecasts}) reached. Please wait."

        # Check rate limit
        key = f"rate:forecast:{user_id}:{get_current_hour()}"
        count = await self.redis.incr(key)
        await self.redis.expire(key, 3600)

        if count > self.limits.rate_limit_forecasts_per_hour:
            return False, "Forecast rate limit exceeded. Try again later."

        return True, "OK"
```

```typescript
// Level 3: Frontend limit enforcement
// hooks/useLimits.ts
import { useQuery } from '@tanstack/react-query';

interface TenantLimits {
  maxFileSizeMb: number;
  maxRowsPerDataset: number;
  maxEntitiesPerBatch: number;
  maxForecastHorizon: number;
  maxConcurrentForecasts: number;
  currentConcurrentForecasts: number;
}

export function useLimits() {
  const { data: limits } = useQuery<TenantLimits>({
    queryKey: ['tenant-limits'],
    queryFn: () => api.get('/api/v1/tenant/limits'),
    staleTime: 60000, // Refresh every minute
  });

  const validateFileUpload = (file: File): ValidationResult => {
    if (!limits) return { valid: true };

    const maxBytes = limits.maxFileSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      return {
        valid: false,
        error: `File size (${formatBytes(file.size)}) exceeds limit of ${limits.maxFileSizeMb} MB`,
      };
    }
    return { valid: true };
  };

  const validateBatchForecast = (entityCount: number): ValidationResult => {
    if (!limits) return { valid: true };

    if (entityCount > limits.maxEntitiesPerBatch) {
      return {
        valid: false,
        error: `Cannot forecast ${entityCount} entities. Maximum is ${limits.maxEntitiesPerBatch}.`,
      };
    }

    if (limits.currentConcurrentForecasts >= limits.maxConcurrentForecasts) {
      return {
        valid: false,
        error: `Maximum concurrent forecasts (${limits.maxConcurrentForecasts}) reached. Please wait for current jobs to complete.`,
      };
    }

    return { valid: true };
  };

  const validateHorizon = (horizon: number): ValidationResult => {
    if (!limits) return { valid: true };

    if (horizon > limits.maxForecastHorizon) {
      return {
        valid: false,
        error: `Forecast horizon cannot exceed ${limits.maxForecastHorizon} days`,
      };
    }
    return { valid: true };
  };

  return {
    limits,
    validateFileUpload,
    validateBatchForecast,
    validateHorizon,
  };
}
```

```typescript
// Level 3: UI components with limit indicators
// components/forecast/BatchForecastPanel.tsx
export function BatchForecastPanel() {
  const { limits, validateBatchForecast } = useLimits();
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);

  const validation = validateBatchForecast(selectedEntities.length);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Batch Forecast</CardTitle>
        {limits && (
          <div className="text-sm text-muted-foreground">
            {limits.currentConcurrentForecasts} / {limits.maxConcurrentForecasts} concurrent forecasts running
          </div>
        )}
      </CardHeader>
      <CardContent>
        <EntitySelector
          maxSelectable={limits?.maxEntitiesPerBatch}
          selected={selectedEntities}
          onChange={setSelectedEntities}
        />

        {!validation.valid && (
          <Alert variant="destructive">
            <AlertDescription>{validation.error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Selected: {selectedEntities.length}</span>
          <span>/</span>
          <span>Max: {limits?.maxEntitiesPerBatch || 50}</span>
        </div>

        <Button
          disabled={!validation.valid || selectedEntities.length === 0}
          onClick={handleBatchForecast}
        >
          Run Batch Forecast
        </Button>
      </CardContent>
    </Card>
  );
}
```

---

## 8. Module Specifications

### Module 1: Data Tab

#### Features (Frontend)
| Feature | Component | Description |
|---------|-----------|-------------|
| Status Dashboard | `StatusCards` | Data loaded, items count, date range, forecast status |
| File Upload | `FileUploader` | Drag & drop CSV/Excel, validation, progress |
| Sample Data | `SampleDataButton` | Load demo dataset |
| Template Download | `TemplateDownload` | Download format template |
| Data Preview | `DataTable` | Sortable, filterable table with pagination |
| Data Summary | `DataSummaryTabs` | Statistics, structure, missing values |
| Data Connectors | `ConnectorPanel` | Connect to external sources |

#### API Endpoints
```
POST   /api/v1/datasets/upload          # Upload file
POST   /api/v1/datasets/sample          # Load sample data
GET    /api/v1/datasets                 # List datasets
GET    /api/v1/datasets/{id}            # Get dataset details
GET    /api/v1/datasets/{id}/preview    # Preview data (paginated)
GET    /api/v1/datasets/{id}/summary    # Get summary statistics
GET    /api/v1/datasets/{id}/structure  # Get data structure
GET    /api/v1/datasets/{id}/missing    # Get missing values analysis
DELETE /api/v1/datasets/{id}            # Delete dataset
GET    /api/v1/templates/download       # Download template
```

### Module 2: Preprocessing Tab

#### Features (Frontend)
| Feature | Component | Description |
|---------|-----------|-------------|
| Entity Selector | `EntitySelector` | Dropdown + "all items" toggle |
| Statistics Panel | `StatisticsCards` | Obs count, mean, std, missing, outliers |
| Status Sidebar | `PreprocessStatus` | Current status, applied operations |
| Time Series Plot | `TimeSeriesChart` | Line/Bar/Point/Area with outlier highlighting |
| Missing Values Handler | `MissingValuesHandler` | 6 interpolation methods |
| Duplicates Handler | `DuplicatesHandler` | 5 handling methods |
| Outlier Handler | `OutlierHandler` | IQR/Z-Score detection, 4 actions |
| Value Replacer | `ValueReplacer` | Conditional replacement |
| Time Aggregation | `TimeAggregator` | Daily→Weekly→Monthly + custom |
| Actions | `PreprocessActions` | Apply, Reset, Download |

#### API Endpoints
```
GET    /api/v1/preprocessing/{dataset_id}/entities           # List entities
GET    /api/v1/preprocessing/{dataset_id}/{entity}/stats     # Entity statistics
GET    /api/v1/preprocessing/{dataset_id}/{entity}/data      # Get entity data
POST   /api/v1/preprocessing/{dataset_id}/{entity}/missing   # Handle missing values
POST   /api/v1/preprocessing/{dataset_id}/{entity}/duplicates # Handle duplicates
POST   /api/v1/preprocessing/{dataset_id}/{entity}/outliers  # Handle outliers
POST   /api/v1/preprocessing/{dataset_id}/{entity}/replace   # Replace values
POST   /api/v1/preprocessing/{dataset_id}/{entity}/aggregate # Time aggregation
POST   /api/v1/preprocessing/{dataset_id}/{entity}/apply     # Apply all changes
POST   /api/v1/preprocessing/{dataset_id}/{entity}/reset     # Reset to original
GET    /api/v1/preprocessing/{dataset_id}/{entity}/download  # Download processed
POST   /api/v1/preprocessing/{dataset_id}/configs            # Save config
GET    /api/v1/preprocessing/{dataset_id}/configs            # List configs
```

### Module 3: Forecast Tab

#### Features (Frontend)
| Feature | Component | Description |
|---------|-----------|-------------|
| Entity Selector | `EntitySelector` | Single or "forecast all" |
| Forecast Settings | `ForecastSettings` | Horizon, frequency, intervals |
| Method Selector | `MethodCards` | ARIMA, ETS, Prophet cards |
| ARIMA Settings | `ARIMASettings` | Auto/Manual p,d,q,P,D,Q,S |
| ETS Settings | `ETSSettings` | Model type, smoothing params |
| Prophet Settings | `ProphetSettings` | Changepoints, seasonality, regressors |
| Cross-Validation | `CVSettings` | Folds, method, metrics |
| Preview Chart | `ForecastPreview` | Quick preview before run |
| Run Button | `ForecastRunner` | Execute with progress |
| Parallel Settings | `ParallelSettings` | Core allocation for batch |

#### API Endpoints
```
POST   /api/v1/forecast/run                     # Run single forecast
POST   /api/v1/forecast/batch                   # Run batch forecast
GET    /api/v1/forecast/status/{forecast_id}    # Get forecast status
POST   /api/v1/forecast/preview                 # Preview forecast (quick)
GET    /api/v1/forecast/methods                 # List available methods
POST   /api/v1/forecast/auto-params/{method}    # Auto-detect parameters
WS     /api/v1/forecast/progress/{forecast_id}  # WebSocket for progress
```

### Module 4: Results Tab

#### Features (Frontend)
| Feature | Component | Description |
|---------|-----------|-------------|
| Entity Selector | `EntitySelector` | Select forecast to view |
| Metrics Cards | `MetricsCards` | MAE, RMSE, MAPE with color coding |
| Forecast Plot | `ForecastChart` | Interactive with prediction intervals |
| Results Table | `ResultsTable` | Forecast data with views |
| Forecast Statistics | `ForecastStats` | Distribution, summary |
| Model Summary | `ModelSummary` | Coefficients, AIC, BIC |
| CV Results | `CVResults` | Cross-validation metrics |
| Export Panel | `ExportPanel` | Multiple formats |

#### API Endpoints
```
GET    /api/v1/results/{forecast_id}            # Get forecast results
GET    /api/v1/results/{forecast_id}/data       # Get result data (paginated)
GET    /api/v1/results/{forecast_id}/metrics    # Get metrics
GET    /api/v1/results/{forecast_id}/summary    # Get model summary
GET    /api/v1/results/{forecast_id}/cv         # Get CV results
GET    /api/v1/results/entity/{dataset_id}/{entity}  # Results by entity
GET    /api/v1/results/download/{forecast_id}   # Download results
POST   /api/v1/results/export/{forecast_id}     # Export report
```

### Module 5: Diagnostics Tab

#### Features (Frontend)
| Feature | Component | Description |
|---------|-----------|-------------|
| Entity/Model Selector | `DiagnosticsSelector` | Select entity and model |
| Residual Analysis | `ResidualAnalysis` | Time series, histogram, QQ, ACF |
| Model Parameters | `ModelParameters` | Values, errors, significance |
| Seasonality Analysis | `SeasonalityAnalysis` | Patterns, strength |
| Forecast Evaluation | `ForecastEvaluation` | Error analysis, distribution |
| Quality Indicators | `QualityIndicators` | 4 progress bars |
| Model Comparison | `ModelComparison` | Side-by-side comparison |
| Export Report | `DiagnosticsExport` | PDF, HTML, Word |

#### API Endpoints
```
GET    /api/v1/diagnostics/{forecast_id}                 # Full diagnostics
GET    /api/v1/diagnostics/{forecast_id}/residuals       # Residual analysis
GET    /api/v1/diagnostics/{forecast_id}/parameters      # Model parameters
GET    /api/v1/diagnostics/{forecast_id}/seasonality     # Seasonality analysis
GET    /api/v1/diagnostics/{forecast_id}/evaluation      # Forecast evaluation
GET    /api/v1/diagnostics/{forecast_id}/quality         # Quality indicators
POST   /api/v1/diagnostics/compare                       # Compare models
POST   /api/v1/diagnostics/export/{forecast_id}          # Export report
```

### Module 6: Settings/Admin

#### Features (Frontend)
| Feature | Component | Description |
|---------|-----------|-------------|
| User Profile | `UserProfile` | Personal settings |
| Team Management | `TeamManagement` | Users, roles (admin only) |
| Data Connectors | `ConnectorsManagement` | Configure connectors |
| Tenant Settings | `TenantSettings` | Organization settings |
| Usage Statistics | `UsageStats` | Quotas, usage graphs |
| Audit Log | `AuditLog` | Activity history |

#### API Endpoints
```
# User endpoints
GET    /api/v1/users/me                    # Current user
PUT    /api/v1/users/me                    # Update profile
PUT    /api/v1/users/me/password           # Change password

# Team management (admin)
GET    /api/v1/users                       # List users
POST   /api/v1/users                       # Create user
PUT    /api/v1/users/{id}                  # Update user
DELETE /api/v1/users/{id}                  # Delete user
PUT    /api/v1/users/{id}/role             # Change role

# Connectors
GET    /api/v1/connectors                  # List connectors
POST   /api/v1/connectors                  # Create connector
PUT    /api/v1/connectors/{id}             # Update connector
DELETE /api/v1/connectors/{id}             # Delete connector
POST   /api/v1/connectors/{id}/test        # Test connection
POST   /api/v1/connectors/{id}/fetch       # Fetch data

# Tenant
GET    /api/v1/tenant                      # Get tenant info
PUT    /api/v1/tenant                      # Update tenant
GET    /api/v1/tenant/limits               # Get current limits
GET    /api/v1/tenant/usage                # Get usage stats

# Audit
GET    /api/v1/audit                       # Get audit logs
```

---

## 9. API Endpoints

### Complete API Summary

| Category | Count | Base Path |
|----------|-------|-----------|
| Auth | 5 | `/api/v1/auth` |
| Datasets | 10 | `/api/v1/datasets` |
| Preprocessing | 12 | `/api/v1/preprocessing` |
| Forecast | 7 | `/api/v1/forecast` |
| Results | 8 | `/api/v1/results` |
| Diagnostics | 8 | `/api/v1/diagnostics` |
| Users | 7 | `/api/v1/users` |
| Connectors | 6 | `/api/v1/connectors` |
| Tenant | 4 | `/api/v1/tenant` |
| Audit | 1 | `/api/v1/audit` |
| **Total** | **68** | |

### Authentication Endpoints

```
POST   /api/v1/auth/register     # Register new user (with tenant creation)
POST   /api/v1/auth/login        # Login, returns JWT
POST   /api/v1/auth/logout       # Logout, invalidate token
POST   /api/v1/auth/refresh      # Refresh JWT token
POST   /api/v1/auth/forgot       # Request password reset
POST   /api/v1/auth/reset        # Reset password with token
```

---

## 10. Security & Authentication

### Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Next.js   │────▶│  NextAuth   │────▶│  FastAPI    │
│   Client    │◀────│  (JWT)      │◀────│  /auth      │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │                   │                   ▼
       │                   │           ┌─────────────┐
       │                   └──────────▶│ PostgreSQL  │
       │                               │ (users)     │
       │                               └─────────────┘
       │                                      │
       ▼                                      │
┌─────────────┐                               │
│  API Calls  │─────────────────────────────▶│
│  (JWT in    │                               │
│   header)   │                               │
└─────────────┘                               │
```

### JWT Token Structure

```json
{
  "sub": "user_uuid",
  "tenant_id": "tenant_uuid",
  "role": "admin|analyst|viewer",
  "email": "user@example.com",
  "iat": 1704067200,
  "exp": 1704153600
}
```

### Role-Based Access Control

| Role | Datasets | Preprocessing | Forecast | Results | Diagnostics | Settings | Team |
|------|----------|---------------|----------|---------|-------------|----------|------|
| **Admin** | CRUD | CRUD | CRUD | Read | Read | CRUD | CRUD |
| **Analyst** | CRU | CRUD | CRUD | Read | Read | Read | - |
| **Viewer** | Read | Read | Read | Read | Read | Read | - |

```python
# core/permissions.py
from enum import Enum
from functools import wraps

class Role(str, Enum):
    ADMIN = "admin"
    ANALYST = "analyst"
    VIEWER = "viewer"

class Permission(str, Enum):
    # Dataset permissions
    DATASET_CREATE = "dataset:create"
    DATASET_READ = "dataset:read"
    DATASET_UPDATE = "dataset:update"
    DATASET_DELETE = "dataset:delete"

    # Forecast permissions
    FORECAST_CREATE = "forecast:create"
    FORECAST_READ = "forecast:read"

    # Admin permissions
    USER_MANAGE = "user:manage"
    TENANT_MANAGE = "tenant:manage"
    CONNECTOR_MANAGE = "connector:manage"

ROLE_PERMISSIONS = {
    Role.ADMIN: [p for p in Permission],  # All permissions
    Role.ANALYST: [
        Permission.DATASET_CREATE,
        Permission.DATASET_READ,
        Permission.DATASET_UPDATE,
        Permission.FORECAST_CREATE,
        Permission.FORECAST_READ,
        Permission.CONNECTOR_MANAGE,
    ],
    Role.VIEWER: [
        Permission.DATASET_READ,
        Permission.FORECAST_READ,
    ],
}

def require_permission(permission: Permission):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, current_user: User = Depends(get_current_user), **kwargs):
            user_permissions = ROLE_PERMISSIONS.get(current_user.role, [])
            if permission not in user_permissions:
                raise HTTPException(
                    status_code=403,
                    detail=f"Permission denied: {permission.value}"
                )
            return await func(*args, current_user=current_user, **kwargs)
        return wrapper
    return decorator
```

### Security Measures

| Measure | Implementation |
|---------|----------------|
| **Password Hashing** | bcrypt with salt |
| **JWT Signing** | RS256 algorithm |
| **Token Expiry** | Access: 24h, Refresh: 7d |
| **Rate Limiting** | Redis-based, per user/IP |
| **CORS** | Strict origin whitelist |
| **SQL Injection** | SQLAlchemy ORM, parameterized queries |
| **XSS Prevention** | React escaping, CSP headers |
| **CSRF** | SameSite cookies, CSRF tokens |
| **Secrets Encryption** | Fernet encryption for connector credentials |
| **Audit Logging** | All sensitive operations logged |

---

## 11. Docker & Deployment

### Docker Compose Configuration

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Frontend - Next.js
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    environment:
      - NEXT_PUBLIC_API_URL=/api
      - NEXTAUTH_URL=${APP_URL}
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend.rule=Host(`${APP_DOMAIN}`)"
      - "traefik.http.routers.frontend.entrypoints=websecure"
      - "traefik.http.routers.frontend.tls.certresolver=letsencrypt"
      - "traefik.http.services.frontend.loadbalancer.server.port=3000"
    depends_on:
      - backend
    restart: unless-stopped
    networks:
      - lucent-network

  # Backend - FastAPI
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      - DATABASE_URL=postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
      - REDIS_URL=redis://redis:6379/0
      - SECRET_KEY=${SECRET_KEY}
      - CORS_ORIGINS=${APP_URL}
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.backend.rule=Host(`${APP_DOMAIN}`) && PathPrefix(`/api`)"
      - "traefik.http.routers.backend.entrypoints=websecure"
      - "traefik.http.routers.backend.tls.certresolver=letsencrypt"
      - "traefik.http.services.backend.loadbalancer.server.port=8000"
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    networks:
      - lucent-network
    volumes:
      - uploads:/app/uploads

  # Celery Worker
  celery-worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: celery -A app.workers.celery_app worker --loglevel=info --concurrency=4
    environment:
      - DATABASE_URL=postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - postgres
      - redis
      - backend
    restart: unless-stopped
    networks:
      - lucent-network
    volumes:
      - uploads:/app/uploads
    deploy:
      resources:
        limits:
          memory: 4G  # Limit memory for forecasting

  # Celery Beat (Scheduler)
  celery-beat:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: celery -A app.workers.celery_app beat --loglevel=info
    environment:
      - DATABASE_URL=postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - redis
    restart: unless-stopped
    networks:
      - lucent-network

  # PostgreSQL
  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=${DB_NAME}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    restart: unless-stopped
    networks:
      - lucent-network
    deploy:
      resources:
        limits:
          memory: 1G

  # Redis
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data
    restart: unless-stopped
    networks:
      - lucent-network

volumes:
  postgres-data:
  redis-data:
  uploads:

networks:
  lucent-network:
    driver: bridge
```

### Frontend Dockerfile

```dockerfile
# frontend/Dockerfile
FROM node:20-alpine AS base

# Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
```

### Backend Dockerfile

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Environment Variables

```bash
# .env.example
# App
APP_URL=https://lucent.yourdomain.com
APP_DOMAIN=lucent.yourdomain.com

# Database
DB_USER=lucent
DB_PASSWORD=your-secure-password
DB_NAME=lucent_db

# Security
SECRET_KEY=your-secret-key-min-32-chars
NEXTAUTH_SECRET=your-nextauth-secret

# Redis
REDIS_URL=redis://redis:6379/0

# Limits (optional overrides)
MAX_UPLOAD_SIZE_MB=100
MAX_CONCURRENT_FORECASTS=4
```

---

## 12. Project Structure

### Complete Project Structure

```
lucent/
├── frontend/                          # Next.js application
│   ├── app/                           # App router pages
│   │   ├── (auth)/                    # Auth pages
│   │   ├── (dashboard)/               # Dashboard pages
│   │   ├── api/                       # API route handlers
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/                    # React components
│   │   ├── ui/                        # shadcn/ui components
│   │   ├── charts/                    # Chart components
│   │   ├── data/                      # Data module
│   │   ├── preprocessing/             # Preprocessing module
│   │   ├── forecast/                  # Forecast module
│   │   ├── results/                   # Results module
│   │   ├── diagnostics/               # Diagnostics module
│   │   ├── layout/                    # Layout components
│   │   ├── shared/                    # Shared components
│   │   └── admin/                     # Admin components
│   ├── hooks/                         # Custom React hooks
│   ├── lib/                           # Utilities
│   │   ├── api.ts                     # API client
│   │   ├── utils.ts                   # Helper functions
│   │   └── validations.ts             # Zod schemas
│   ├── stores/                        # Zustand stores
│   ├── styles/                        # Global styles
│   ├── types/                         # TypeScript types
│   ├── public/                        # Static assets
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── package.json
│   └── Dockerfile
│
├── backend/                           # FastAPI application
│   ├── app/
│   │   ├── api/                       # API endpoints
│   │   │   ├── v1/                    # API version 1
│   │   │   └── websocket.py
│   │   ├── core/                      # Core utilities
│   │   ├── db/                        # Database
│   │   ├── models/                    # SQLAlchemy models
│   │   ├── schemas/                   # Pydantic schemas
│   │   ├── services/                  # Business logic
│   │   ├── forecasting/               # Forecasting engines
│   │   ├── connectors/                # Data connectors
│   │   ├── middleware/                # Middleware
│   │   ├── workers/                   # Celery tasks
│   │   ├── main.py                    # App entry
│   │   └── config.py                  # Settings
│   ├── alembic/                       # Migrations
│   ├── tests/                         # Tests
│   ├── requirements.txt
│   └── Dockerfile
│
├── docs/                              # Documentation
│   ├── LUCENT App Documentation.md
│   ├── LUCENT_Transformation_Plan.md
│   └── API.md
│
├── docker-compose.yml                 # Docker Compose
├── .env.example                       # Environment template
├── .gitignore
└── README.md
```

---

## 13. Implementation Roadmap

### Phase 1: Foundation (Week 1-2) - ✅ COMPLETE

| Task | Priority | Status | Progress |
|------|----------|--------|----------|
| Project setup (Next.js + FastAPI) | High | ✅ Done | 100% |
| Frontend configuration (/lucent base path) | High | ✅ Done | 100% |
| Database environment setup | High | ✅ Done | 100% |
| Docker Compose configuration | High | ⏸️ Deferred | 0% (Windows) |
| Database schema + migrations | High | ✅ Done | 100% |
| Multi-tenant middleware (basic) | High | ✅ Done | 100% |
| Authentication (JWT) | High | ✅ Done | 100% |
| Basic UI layout (shadcn/ui) | High | ✅ Done | 100% |
| Login/Register pages | High | ✅ Done | 100% |
| User approval workflow | High | ✅ Done | 100% |
| CI/CD pipeline (optional) | Medium | ⏳ Pending | 0% |

**Progress: 100% Complete** (see [PHASE_1_FINAL.md](../PHASE_1_FINAL.md))

**Completed:**
- ✅ Next.js 14 project with TypeScript
- ✅ shadcn/ui component library (10 components)
- ✅ Tailwind CSS + styling
- ✅ Zustand state management
- ✅ TanStack Query + Axios API client
- ✅ Plotly.js charts integration
- ✅ Complete TypeScript type definitions
- ✅ API endpoint functions (68 endpoints defined)
- ✅ Dashboard layout (Sidebar + Header)
- ✅ Main dashboard page with stats
- ✅ Base path configuration (/lucent)
- ✅ Frontend running: http://localhost:3000/lucent
- ✅ Backend .env with Neon PostgreSQL credentials
- ✅ Backend .env with Upstash Redis credentials
- ✅ FastAPI backend with all 6 core models
- ✅ Alembic migrations - 6 tables created in Neon PostgreSQL
- ✅ JWT authentication (register, login, me, logout)
- ✅ Password hashing with bcrypt
- ✅ Login/Register UI pages with validation
- ✅ AuthContext for frontend auth state management
- ✅ Protected dashboard routes (redirect to login)
- ✅ User approval workflow (is_approved field)
- ✅ Admin endpoints (pending-users, approve-user, reject-user)

**Deferred:**
- ⏸️ Docker setup (Windows version incompatible - will use local development)

### Phase 2: Multi-Tenant Architecture & RLS (Week 3-5) - 🚧 IN PROGRESS

Implement comprehensive multi-tenant architecture with Super Admin, Tenant Admin roles, and Row-Level Security for database connectors.

#### Phase 2.1: Database Models & Migrations - ✅ COMPLETE

| Task | Priority | Status |
|------|----------|--------|
| Create UserGroup model | High | ✅ Done |
| Create UserGroupMembership model | High | ✅ Done |
| Create ConnectorRLS model | High | ✅ Done |
| Add is_super_admin to User model | High | ✅ Done |
| Add SUPER_ADMIN role to UserRole enum | High | ✅ Done |
| Generate Alembic migrations | High | ✅ Done |

**Files Created:**
- `backend/app/models/user_group.py`
- `backend/app/models/user_group_membership.py`
- `backend/app/models/connector_rls.py`
- `backend/alembic/versions/b44a58c5806a_add_user_groups_and_rls.py`

#### Phase 2.2: Backend API - Super Admin - ✅ COMPLETE

| Task | Priority | Status |
|------|----------|--------|
| Create admin.py endpoints | High | ✅ Done |
| GET/POST/PUT/DELETE /admin/tenants | High | ✅ Done |
| POST /admin/tenants/{id}/admin | High | ✅ Done |
| GET /admin/users (all tenants) | High | ✅ Done |
| Super Admin authentication middleware | High | ✅ Done |

**Files Created:**
- `backend/app/schemas/admin.py`
- `backend/app/api/v1/endpoints/admin.py`

**Endpoints:**
- `GET /api/v1/admin/stats` - Platform statistics
- `GET /api/v1/admin/tenants` - List all tenants
- `POST /api/v1/admin/tenants` - Create tenant
- `GET /api/v1/admin/tenants/{id}` - Get tenant
- `PUT /api/v1/admin/tenants/{id}` - Update tenant
- `DELETE /api/v1/admin/tenants/{id}` - Delete tenant
- `POST /api/v1/admin/tenants/{id}/admin` - Create tenant admin
- `GET /api/v1/admin/users` - List all users
- `PUT /api/v1/admin/users/{id}/approve` - Approve user
- `PUT /api/v1/admin/users/{id}/toggle-active` - Toggle user active
- `DELETE /api/v1/admin/users/{id}` - Delete user

#### Phase 2.3: Backend API - Tenant Admin & Groups - ✅ COMPLETE

| Task | Priority | Status |
|------|----------|--------|
| Update users.py for tenant user CRUD | High | ✅ Done |
| Create groups.py endpoints | High | ✅ Done |
| GET/POST/PUT/DELETE /groups | High | ✅ Done |
| POST/DELETE /groups/{id}/members | High | ✅ Done |
| Add RLS endpoints to connectors.py | High | ✅ Done |

**Implemented Endpoints:**

**Users API** (`/api/v1/users`)
- `GET /users/stats` - Tenant statistics
- `GET /users` - List tenant users
- `POST /users` - Create user
- `GET /users/{id}` - Get user
- `PUT /users/{id}` - Update user
- `DELETE /users/{id}` - Delete user
- `PUT /users/{id}/approve` - Approve user
- `PUT /users/{id}/toggle-active` - Toggle active status

**Groups API** (`/api/v1/groups`)
- `GET /groups` - List groups
- `POST /groups` - Create group
- `GET /groups/{id}` - Get group with members
- `PUT /groups/{id}` - Update group
- `DELETE /groups/{id}` - Delete group
- `POST /groups/{id}/members` - Add member
- `POST /groups/{id}/members/bulk` - Add multiple members
- `DELETE /groups/{id}/members/{user_id}` - Remove member
- `DELETE /groups/{id}/members` - Remove all members

**Connectors RLS API** (`/api/v1/connectors`)
- `GET /connectors` - List connectors with RLS config
- `GET /connectors/{id}` - Get connector
- `GET /connectors/{id}/rls` - Get RLS config
- `POST /connectors/{id}/rls` - Create RLS config
- `PUT /connectors/{id}/rls` - Update RLS config
- `DELETE /connectors/{id}/rls` - Delete RLS config
- `PUT /connectors/{id}/rls/toggle` - Toggle RLS enabled

#### Phase 2.4: Frontend - Super Admin Panel - ✅ COMPLETE

| Task | Priority | Status |
|------|----------|--------|
| Create /admin layout with role check | High | ✅ Done |
| Create /admin/page.tsx dashboard | High | ✅ Done |
| Create /admin/tenants/page.tsx | High | ✅ Done |
| Create tenant create/edit modals | High | ✅ Done |
| Create /admin/tenants/[id]/page.tsx | High | ✅ Done |
| Create /admin/users/page.tsx | High | ✅ Done |

**Implemented Pages:**
- `/admin` - Platform dashboard with stats (tenants, users, pending approvals)
- `/admin/tenants` - Tenant list with search, create/edit/delete modals
- `/admin/tenants/[id]` - Tenant detail with user list
- `/admin/users` - All users with filters (tenant, status, approval)

**Features:**
- Role-based access control (only super admins)
- Create/edit tenant modals
- Add admin user to tenant
- Approve/deactivate users
- Delete tenants and users
- Sidebar link for super admins

#### Phase 2.5: Frontend - Tenant Admin Panel - ✅ COMPLETE

| Task | Priority | Status |
|------|----------|--------|
| Create /settings/users/page.tsx | High | ✅ Done |
| Create /settings/groups/page.tsx | High | ✅ Done |
| Add user create/edit modals | High | ✅ Done |
| Add group membership UI | High | ✅ Done |
| Add RLS values assignment | High | ✅ Done |

**Implemented Pages:**
- `/dashboard/settings/users` - Tenant user management with CRUD
- `/dashboard/settings/groups` - User groups with RLS values and membership

**Features:**
- User management: Create, edit, delete, approve, toggle active
- Filter users by status, approval, role
- Group management: Create, edit, delete with RLS values
- Group membership: Add/remove users via dual-column interface
- RLS values: Add/remove values per group with visual tags
- Admin section in sidebar for tenant admins

#### Phase 2.6: RLS Implementation - ✅ COMPLETE

| Task | Priority | Status |
|------|----------|--------|
| Add RLS config to connector form | High | ✅ Done |
| Implement column selector after connection test | High | ✅ Done |
| Add data filtering based on user groups | High | ✅ Done |
| Test RLS end-to-end | High | ✅ Done |

**Files Created:**
- `frontend/src/app/(dashboard)/dashboard/settings/connectors/page.tsx` - Connector RLS management UI
- `backend/app/services/__init__.py` - Services module
- `backend/app/services/connector_service.py` - Database column discovery for multiple DB types
- `backend/app/services/rls_service.py` - RLS filtering service with RLSContext

**Files Modified:**
- `frontend/src/lib/api/endpoints.ts` - Added getConnectorColumns API
- `frontend/src/components/layout/Sidebar.tsx` - Added Connectors link in admin nav
- `backend/app/api/v1/endpoints/connectors.py` - Added GET /{id}/columns endpoint
- `backend/app/schemas/connectors.py` - Added ConnectorColumnsResponse

**Deliverables:**
- ✅ Platform-level Super Admin can manage all tenants
- ✅ Tenant Admin can manage users and groups within tenant
- ✅ User Groups with RLS value assignments
- ✅ Row-Level Security filtering on database connectors
- ✅ Users can belong to multiple groups
- ✅ Connector RLS management UI with column selector
- ✅ Column discovery for PostgreSQL, MySQL, SQL Server, BigQuery, Snowflake
- ✅ RLS service with query and DataFrame filtering
- ✅ RLSContext for request-scoped RLS handling

#### Database Schema - New Models

**UserGroup** (`backend/app/models/user_group.py`)
```python
class UserGroup(Base):
    __tablename__ = "user_groups"
    id = Column(String(36), primary_key=True)
    tenant_id = Column(String(36), ForeignKey("tenants.id"))
    name = Column(String(255), nullable=False)  # e.g., "Store A Team"
    description = Column(Text)
    rls_values = Column(JSON, default=[])  # e.g., ["Store A", "Store B"]
    created_at = Column(DateTime)
```

**UserGroupMembership** (`backend/app/models/user_group_membership.py`)
```python
class UserGroupMembership(Base):
    __tablename__ = "user_group_memberships"
    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id"))
    group_id = Column(String(36), ForeignKey("user_groups.id"))
    created_at = Column(DateTime)
```

**ConnectorRLS** (`backend/app/models/connector_rls.py`)
```python
class ConnectorRLS(Base):
    __tablename__ = "connector_rls_configs"
    id = Column(String(36), primary_key=True)
    connector_id = Column(String(36), ForeignKey("connectors.id"))
    rls_column = Column(String(255), nullable=False)  # e.g., "store_name"
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime)
```

**Modify User Model** (`backend/app/models/user.py`)
```python
class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"  # Platform-level
    ADMIN = "admin"              # Tenant Admin
    ANALYST = "analyst"
    VIEWER = "viewer"

# Add field:
is_super_admin = Column(Boolean, default=False, index=True)
```

#### API Endpoints

**Super Admin** (`/api/v1/admin/`)
- `GET /tenants` - List all tenants
- `POST /tenants` - Create new tenant
- `PUT /tenants/{id}` - Update tenant
- `DELETE /tenants/{id}` - Delete tenant
- `POST /tenants/{id}/admin` - Create tenant admin user
- `GET /users` - List all users across all tenants

**Tenant Admin** (`/api/v1/tenant/`)
- `GET /users` - List tenant users
- `POST /users` - Create user in tenant
- `PUT /users/{id}` - Update user
- `DELETE /users/{id}` - Delete user
- `GET /groups` - List user groups
- `POST /groups` - Create user group
- `PUT /groups/{id}` - Update group (including RLS values)
- `DELETE /groups/{id}` - Delete group
- `POST /groups/{id}/members` - Add user to group
- `DELETE /groups/{id}/members/{user_id}` - Remove user from group

**Connector RLS** (`/api/v1/connectors/`)
- `GET /{id}/rls` - Get RLS config for connector
- `PUT /{id}/rls` - Configure RLS column
- `POST /{id}/rls/test` - Test RLS filtering

#### Critical Files to Modify/Create

**Backend (Create):**
- `backend/app/models/user_group.py`
- `backend/app/models/user_group_membership.py`
- `backend/app/models/connector_rls.py`
- `backend/app/api/v1/endpoints/admin.py`
- `backend/app/api/v1/endpoints/groups.py`
- `backend/alembic/versions/xxx_add_groups_and_rls.py`

**Backend (Modify):**
- `backend/app/models/user.py` - Add super_admin role
- `backend/app/models/__init__.py` - Export new models
- `backend/app/api/v1/api.py` - Register new routes
- `backend/app/api/v1/endpoints/connectors.py` - Add RLS endpoints

**Frontend (Create):**
- `frontend/src/app/(dashboard)/admin/page.tsx`
- `frontend/src/app/(dashboard)/admin/tenants/page.tsx`
- `frontend/src/app/(dashboard)/admin/layout.tsx`
- `frontend/src/app/(dashboard)/settings/users/page.tsx`
- `frontend/src/app/(dashboard)/settings/groups/page.tsx`
- `frontend/src/lib/api/admin.ts` - Admin API functions

**Frontend (Modify):**
- `frontend/src/lib/api/endpoints.ts` - Add new endpoints
- `frontend/src/types/index.ts` - Add new types
- `frontend/src/components/layout/Sidebar.tsx` - Add admin links

#### Verification Plan

1. **Database**: Run migrations and verify tables created
2. **Super Admin**:
   - Mark existing user as super_admin in DB
   - Test creating new tenant
   - Test creating tenant admin
3. **Tenant Admin**:
   - Login as tenant admin
   - Create user groups with RLS values
   - Create users and assign to groups
4. **RLS**:
   - Configure RLS column on connector
   - Verify data filtering based on user's group membership
5. **Build**: Run `npm run build` and `uvicorn` without errors

### Phase 3: Data Module (Week 6-7)

| Task | Priority | Effort |
|------|----------|--------|
| File upload API | High | 1 day |
| Data validation service | High | 2 days |
| File upload UI (drag & drop) | High | 1 day |
| Data preview table | High | 1 day |
| Data summary statistics | High | 2 days |
| Sample data loader | Medium | 0.5 day |
| Template download | Low | 0.5 day |
| Missing values visualization | Medium | 1 day |

**Deliverables:**
- ✅ Upload CSV/Excel files
- ✅ Preview and explore data
- ✅ View summary statistics

### Phase 4: Preprocessing Module (Week 8-9)

| Task | Priority | Effort |
|------|----------|--------|
| Entity selection API | High | 1 day |
| Missing values handler | High | 2 days |
| Duplicates handler | High | 1 day |
| Outlier detection/handling | High | 2 days |
| Custom value replacement | Medium | 1 day |
| Time aggregation | High | 2 days |
| Preprocessing UI components | High | 2 days |
| Apply/Reset/Download actions | High | 1 day |
| Preprocessing config save/load | Medium | 1 day |

**Deliverables:**
- ✅ Full preprocessing pipeline
- ✅ Interactive preprocessing UI
- ✅ Save/load configurations

### Phase 5: Forecasting Module (Week 10-12)

| Task | Priority | Effort |
|------|----------|--------|
| ARIMA implementation | High | 3 days |
| ETS implementation | High | 2 days |
| Prophet implementation | High | 3 days |
| Cross-validation logic | High | 2 days |
| Metrics calculation | High | 1 day |
| Celery task setup | High | 2 days |
| Forecast API endpoints | High | 2 days |
| Forecast UI (method cards) | High | 2 days |
| Method-specific settings UI | High | 2 days |
| Batch forecasting | High | 2 days |
| Progress WebSocket | Medium | 1 day |

**Deliverables:**
- ✅ All 3 forecasting methods working
- ✅ Single and batch forecasting
- ✅ Background job processing
- ✅ Real-time progress updates

### Phase 6: Results Module (Week 13-14)

| Task | Priority | Effort |
|------|----------|--------|
| Results storage/retrieval | High | 1 day |
| Forecast plot (Plotly) | High | 2 days |
| Metrics display | High | 1 day |
| Results table with views | High | 1 day |
| Model summary display | High | 1 day |
| CV results display | Medium | 1 day |
| Export to Excel/CSV | High | 1 day |
| Export to PDF report | Medium | 2 days |

**Deliverables:**
- ✅ Interactive forecast visualization
- ✅ Full results analysis
- ✅ Multiple export formats

### Phase 7: Diagnostics Module (Week 15-16)

| Task | Priority | Effort |
|------|----------|--------|
| Residual analysis | High | 2 days |
| ACF/PACF plots | High | 1 day |
| QQ plot | Medium | 1 day |
| Model parameters display | High | 1 day |
| Seasonality analysis | Medium | 2 days |
| Quality indicators | High | 1 day |
| Model comparison | High | 2 days |
| Diagnostics export | Medium | 2 days |

**Deliverables:**
- ✅ Full diagnostic suite
- ✅ Model comparison tool
- ✅ Diagnostic reports

### Phase 8: Data Connectors (Week 17-18)

| Task | Priority | Effort |
|------|----------|--------|
| Connector base class | High | 1 day |
| PostgreSQL connector | High | 1 day |
| MySQL connector | Medium | 1 day |
| S3 connector | Medium | 2 days |
| Azure Blob connector | Low | 1 day |
| BigQuery connector | Low | 2 days |
| Snowflake connector | Low | 2 days |
| Connector UI | High | 2 days |
| Connection testing | High | 1 day |
| Scheduled sync (optional) | Low | 2 days |

**Deliverables:**
- ✅ Multiple data source support
- ✅ Connector management UI
- ✅ Connection testing

### Phase 9: Admin & Polish (Week 19-20)

| Task | Priority | Effort |
|------|----------|--------|
| Usage statistics | Medium | 2 days |
| Audit logging | Medium | 1 day |
| Help/Documentation page | Medium | 2 days |
| Performance optimization | High | 2 days |
| Security audit | High | 1 day |
| Bug fixes & polish | High | 3 days |

**Deliverables:**
- ✅ Admin functionality complete
- ✅ Application polished and optimized
- ✅ Production-ready

### Phase 10: Optimization Levels (Week 21)

| Task | Priority | Effort |
|------|----------|--------|
| Level 1: Redis caching | High | 2 days |
| Level 1: Connection pooling | High | 0.5 day |
| Level 1: Gzip compression | Medium | 0.5 day |
| Level 2: Queue priority setup | High | 1 day |
| Level 2: Worker limits | High | 0.5 day |
| Level 2: Progress tracking | Medium | 1 day |
| Level 3: Smart limits implementation | High | 1 day |
| Level 3: Limit UI indicators | Medium | 1 day |
| Testing under load | High | 1 day |

**Deliverables:**
- ✅ All optimization levels implemented
- ✅ System performs well under load
- ✅ Fair resource usage across tenants

---

## Summary

### Total Estimated Timeline: 21 weeks

### Key Metrics

| Metric | Value |
|--------|-------|
| Total API Endpoints | ~68 |
| React Components | ~80 |
| Database Tables | ~12 |
| Docker Services | 6 |
| Forecasting Methods | 3 |
| Data Connectors | 7+ |
| User Roles | 3 |

### Scalability Targets

| Metric | Target |
|--------|--------|
| Tenants | 20-50 |
| Total Users | 200-500 |
| Concurrent Users | 30-50 |
| Concurrent Forecasts | 5-8 |
| Max Dataset Size | 2M rows |
| Max Entities/Batch | 50 |

---

---

## 📊 Project Status

**Last Updated:** 2026-01-26
**Current Phase:** Phase 5 IN PROGRESS (Backend ~70% done)
**Frontend Status:** ✅ Running at http://localhost:3000
**Backend Status:** ✅ Running at http://localhost:8000
**Overall Progress:** ~60% of total project

**Phase 3 Progress (Data Module) - 100% COMPLETE:**
- ✅ Phase 3.1: Dataset Model & Schema - COMPLETE
- ✅ Phase 3.2: Data Validation Service - COMPLETE
- ✅ Phase 3.3: File Upload API - COMPLETE
- ✅ Phase 3.4: Dataset Endpoints (preview, summary, structure, missing) - COMPLETE
- ✅ Phase 3.5: File Upload UI (drag & drop) - COMPLETE
- ✅ Phase 3.6: Data Preview Table - COMPLETE
- ✅ Phase 3.7: Data Summary Statistics - COMPLETE
- ✅ Phase 3.8: Sample Data Loader - COMPLETE
- ✅ Phase 3.9: Template Download Component - COMPLETE
- ✅ Phase 3.10: StatusCards Dashboard Component - COMPLETE
- ✅ Phase 3.11: ConnectorPanel UI Component - COMPLETE (Backend pending)

**Phase 4 Progress (Preprocessing Module) - 100% COMPLETE:**
- ✅ Phase 4.1: Entity selection API - COMPLETE
- ✅ Phase 4.2: Missing values handler - COMPLETE (9 methods: drop, fill_zero, fill_mean, fill_median, fill_mode, forward_fill, backward_fill, linear_interpolate, spline_interpolate)
- ✅ Phase 4.3: Duplicates handler - COMPLETE (first, last, drop_all methods)
- ✅ Phase 4.4: Outlier detection/handling - COMPLETE (IQR, Z-score, Percentile methods with cap/remove/replace actions)
- ✅ Phase 4.5: Custom value replacement - COMPLETE
- ✅ Phase 4.6: Time aggregation - COMPLETE (D, W, M, Q, Y frequencies with sum/mean/median/min/max/first/last methods)
- ✅ Phase 4.7: Preprocessing UI components - COMPLETE (EntitySelector, MissingValuesHandler, OutlierHandler, TimeAggregator, DuplicateHandler)
- ✅ Phase 4.8: Apply/Reset/Download actions - COMPLETE

**Phase 5 Progress (Forecasting Module) - IN PROGRESS (~70%):**
- ✅ Phase 5.1: Forecast schemas (ForecastRequest, ForecastResultResponse, etc.) - COMPLETE
- ✅ Phase 5.2: Base forecaster class (base.py) - COMPLETE
- ✅ Phase 5.3: ARIMA forecaster (arima.py) - COMPLETE
- ✅ Phase 5.4: ETS forecaster (ets.py) - COMPLETE
- ✅ Phase 5.5: Prophet forecaster (prophet_forecaster.py) - COMPLETE
- ✅ Phase 5.6: Metrics calculation (metrics.py) - COMPLETE
- ✅ Phase 5.7: Forecast service with fallback logic (preprocessed -> raw data) - COMPLETE
- ⏳ Phase 5.8: Forecast API endpoints - PENDING
- ⏳ Phase 5.9: Forecasting UI components - PENDING

**Phase 2 Progress:
- ✅ Phase 2.1: Database Models & Migrations - COMPLETE
- ✅ Phase 2.2: Backend API - Super Admin - COMPLETE
- ✅ Phase 2.3: Backend API - Tenant Admin & Groups - COMPLETE
- ✅ Phase 2.4: Frontend - Super Admin Panel - COMPLETE
- ✅ Phase 2.5: Frontend - Tenant Admin Panel - COMPLETE
- ✅ Phase 2.6: RLS Implementation - COMPLETE
- ✅ Phase 2.7: Tenant-Based URL Routing - COMPLETE
- ✅ Phase 2.8: Platform Admin Separation - COMPLETE
- ✅ Phase 2.9: Tenant Branding - COMPLETE

**Recent Milestones:**
- ✅ Phase 1 Complete (100%)
- ✅ Phase 2.1: Created UserGroup, UserGroupMembership, ConnectorRLS models
- ✅ Phase 2.1: Added SUPER_ADMIN role and is_super_admin field
- ✅ Phase 2.1: Migration run - 3 new tables created
- ✅ Phase 2.2: Super Admin API endpoints (11 endpoints)
- ✅ Phase 2.2: Super Admin authentication middleware
- ✅ Phase 2.3: Tenant User CRUD endpoints (/api/v1/users)
- ✅ Phase 2.3: User Groups CRUD endpoints (/api/v1/groups)
- ✅ Phase 2.3: Group membership endpoints (add/remove members)
- ✅ Phase 2.3: Connector RLS endpoints (/api/v1/connectors/{id}/rls)
- ✅ Phase 2.4: Super Admin Panel layout with role check
- ✅ Phase 2.4: Platform dashboard (/admin)
- ✅ Phase 2.4: Tenant management page (/admin/tenants)
- ✅ Phase 2.4: Tenant detail page (/admin/tenants/[id])
- ✅ Phase 2.4: User management page (/admin/users)
- ✅ Phase 2.4: Create/Edit tenant modals
- ✅ Phase 2.4: Add admin user to tenant functionality
- ✅ Phase 2.4: Super Admin API integration in frontend
- ✅ Phase 2.5: Tenant Admin API integration in frontend
- ✅ Phase 2.5: User management page (/dashboard/settings/users)
- ✅ Phase 2.5: Groups management page (/dashboard/settings/groups)
- ✅ Phase 2.5: Group membership UI with add/remove
- ✅ Phase 2.5: RLS values assignment to groups
- ✅ Phase 2.5: Admin navigation in sidebar
- ✅ Phase 2.6: Connector RLS management page (/dashboard/settings/connectors)
- ✅ Phase 2.6: Column selector endpoint (GET /connectors/{id}/columns)
- ✅ Phase 2.6: Connector service for database column discovery
- ✅ Phase 2.6: RLS service for data filtering (rls_service.py)
- ✅ Phase 2.6: RLSContext class for request-scoped RLS handling
- ✅ Phase 2.6: DataFrame and SQL query RLS filtering functions

**Next Steps:**
1. ✅ Phase 2.8: Platform Admin Separation - COMPLETE
2. ✅ Phase 2.9: Tenant Branding - COMPLETE
3. ✅ Phase 3: Data Module - COMPLETE
4. ✅ Phase 4: Preprocessing Module - COMPLETE
5. ⏳ Phase 5: Forecasting Module - IN PROGRESS
6. ⏳ Phase 6: Results Module
7. ⏳ Phase 7: Diagnostics Module
8. ⏳ Connector Backend Implementation (PostgreSQL, MySQL, S3, etc.)

---

## Phase 2.7: Tenant-Based URL Routing - ✅ COMPLETE

### Problem Statement
Currently the app uses `/dashboard` for all tenants. The correct architecture requires each tenant to have its own URL namespace (e.g., `/acme-corp/dashboard`).

### Current State (Incorrect)
```
/login                      → Login page
/dashboard                  → Generic dashboard (no tenant context in URL)
/dashboard/settings/users   → User management
/admin                      → Super admin portal
```

### Target State (Correct)
```
/login                          → Global login page
/register                       → Register new tenant + first admin

/admin                          → Super Admin portal (platform level)
/admin/tenants                  → Manage all tenants
/admin/users                    → Manage all platform users

/{tenant-slug}/dashboard        → Tenant's dashboard (e.g., /acme-corp/dashboard)
/{tenant-slug}/data             → Tenant's data page
/{tenant-slug}/forecast         → Tenant's forecast page
/{tenant-slug}/settings/users   → Tenant admin: manage users
/{tenant-slug}/settings/groups  → Tenant admin: manage groups
/{tenant-slug}/settings/connectors → Tenant admin: manage RLS
```

### Changes Required

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| Add tenant_slug to UserResponse/AuthResponse | High | 0.5 day | Pending |
| Create `[tenant]` dynamic route folder structure | High | 1 day | Pending |
| Create TenantContext provider | High | 0.5 day | Pending |
| Create tenant validation middleware | High | 0.5 day | Pending |
| Update login to redirect to `/{tenant-slug}/dashboard` | High | 0.5 day | Pending |
| Update Sidebar navigation to use tenant slug | High | 0.5 day | Pending |
| Update all internal links to include tenant slug | Medium | 1 day | Pending |
| Remove `/lucent` basePath from next.config | Medium | 0.5 day | Pending |
| Add 404 handling for invalid tenant slugs | Medium | 0.5 day | Pending |
| Test tenant isolation in URLs | High | 0.5 day | Pending |

### Technical Implementation

**1. Backend Changes:**
- Add `tenant_slug` to `UserResponse` schema
- Add endpoint `GET /api/v1/tenants/{slug}` to validate tenant exists

**2. Frontend Route Structure:**
```
app/
├── (auth)/
│   ├── login/page.tsx           # Global login
│   └── register/page.tsx        # Register tenant + admin
├── (admin)/
│   └── admin/                   # Super admin portal (unchanged)
│       ├── page.tsx
│       ├── tenants/
│       └── users/
├── [tenant]/                    # Dynamic tenant routes
│   ├── layout.tsx               # Tenant layout with validation
│   ├── dashboard/page.tsx
│   ├── data/page.tsx
│   ├── forecast/page.tsx
│   ├── results/page.tsx
│   ├── diagnostics/page.tsx
│   └── settings/
│       ├── users/page.tsx
│       ├── groups/page.tsx
│       └── connectors/page.tsx
```

**3. TenantContext Provider:**
```typescript
// Provides tenant info to all components within [tenant] routes
interface TenantContextType {
  tenant: { id: string; slug: string; name: string };
  isValidating: boolean;
}
```

**4. Login Flow:**
```
User logs in → API returns user with tenant_slug
            → Redirect to /{tenant_slug}/dashboard
```

### Deliverables
- [ ] Users access app via `/{tenant-slug}/*` URLs
- [ ] Login redirects to correct tenant URL
- [ ] Invalid tenant slugs show 404
- [ ] Super admin portal remains at `/admin`
- [ ] All navigation uses tenant-aware URLs

---

## Phase 2.8: Platform Admin Separation - ✅ COMPLETE

### Overview
Separating platform administrators from tenant users into distinct authentication flows and database tables.

### Architecture
| System | Table | Login URL | Dashboard URL |
|--------|-------|-----------|---------------|
| Platform Admin | `platform_admins` | `/lucent/login` | `/lucent/admin` |
| Tenant User | `users` | `/lucent/{tenant}/login` | `/lucent/{tenant}/dashboard` |

### Key Principles
1. Platform admins have NO access to tenant dashboards by default
2. To access a tenant, a platform admin must have a separate user account in that tenant
3. Tenant admins can only manage users within their tenant
4. Password resets in tenant context only affect tenant user table

### Tasks

#### Backend - ✅ COMPLETE
- [x] Create `platform_admins` table model
- [x] Create platform admin auth endpoints (`/platform/login`, `/platform/me`)
- [x] Update dependencies with `get_current_platform_admin`
- [x] Update admin endpoints to use platform admin auth
- [x] Create Alembic migration (migrates super admins, drops `is_super_admin`)
- [x] Remove `is_super_admin` from User model and UserRole enum
- [x] Run migrations (`alembic upgrade head`)
- [x] Update `auth.py` schemas/endpoints - remove `is_super_admin`
- [x] Seed platform admin (admin@lucent.com / Admin123!)

#### Frontend - ✅ COMPLETE
- [x] Update `/lucent/login` for platform admin only
- [x] Create `/lucent/{tenant}/login` for tenant users
- [x] Update admin layout (uses `platform_token`, no "Back to App")
- [x] Update AuthContext (removed `is_super_admin`)
- [x] Update Sidebar - remove Super Admin link
- [x] Update API client - tenant-specific 401 redirect
- [x] Create tenant register page (`/{tenant}/register`)
- [x] Update admin dashboard pages to use platform auth
- [x] Remove all `is_super_admin` references from frontend
- [x] Build and test - All passing

#### Security Enhancement - ✅ COMPLETE
- [x] Add tenant validation to login endpoint (`/auth/tenant/{tenant_slug}/login`)
  - Backend validates user belongs to specified tenant before issuing token
  - Frontend updated to use tenant-specific endpoint
  - Added `authApi.tenantLogin()` helper function

### Detailed Plan
See: [PLATFORM_ADMIN_SEPARATION_PLAN.md](PLATFORM_ADMIN_SEPARATION_PLAN.md)

---

## Phase 2.9: Tenant Branding - ✅ COMPLETE

### Overview
Allow tenant admins to customize their organization's branding (logo, colors, etc.) for a white-label experience.

### Features
| Feature | Storage Location | Description |
|---------|------------------|-------------|
| Logo | `settings.branding.logo_url` | Custom tenant logo (header/sidebar) |
| Primary Color | `settings.branding.colors.primary` | Theme accent color |
| Secondary Color | `settings.branding.colors.secondary` | Secondary theme color |
| Accent Color | `settings.branding.colors.accent` | Highlight color |
| Favicon | `settings.branding.favicon_url` | Custom browser tab icon |
| Login Background | `settings.branding.login_bg_url` | Custom login page background |
| Login Message | `settings.branding.login_message` | Custom welcome message on login |

### Architecture
- Uses existing `tenants.settings` JSONB column
- TenantContext provides branding to all components
- CSS variables for dynamic theming (`--brand-primary`, `--brand-secondary`, `--brand-accent`)

### Tasks

#### Backend - ✅ COMPLETE
- [x] Create branding schema (`schemas/branding.py`)
- [x] Add GET `/tenants/{slug}/branding` endpoint (public)
- [x] Add PUT `/tenants/{slug}/branding` endpoint (tenant admin only)

#### Frontend - ✅ COMPLETE
- [x] Create branding settings page (`/[tenant]/settings/branding`)
- [x] Update TenantContext to include branding data
- [x] Apply branding to Header (tenant logo + name in header bar)
- [x] Apply branding to Login page (background, message, colors)
- [x] Add color picker component for theme customization
- [x] Add logo/background URL inputs
- [x] Add Branding link to admin navigation
- [x] Create Textarea UI component
- [x] Create Settings page (`/[tenant]/settings`) with admin menu
- [x] Keep LUCENT branding in Sidebar (consistent app identity)
- [x] Tenant logo + name in Header (clickable, links to dashboard)

#### Platform Admin - ⏳ DEFERRED
- [ ] Allow platform admin to set default branding
- [ ] Allow platform admin to reset tenant branding

---

## Phase 2 Summary - ✅ FULLY COMPLETE

Phase 2 (Multi-Tenant Architecture & RLS) is now complete. All sub-phases delivered:

| Sub-Phase | Description | Status |
|-----------|-------------|--------|
| 2.1 | Database Models & Migrations | ✅ Complete |
| 2.2 | Backend API - Super Admin | ✅ Complete |
| 2.3 | Backend API - Tenant Admin & Groups | ✅ Complete |
| 2.4 | Frontend - Super Admin Panel | ✅ Complete |
| 2.5 | Frontend - Tenant Admin Panel | ✅ Complete |
| 2.6 | RLS Implementation | ✅ Complete |
| 2.7 | Tenant-Based URL Routing | ✅ Complete |
| 2.8 | Platform Admin Separation | ✅ Complete |
| 2.9 | Tenant Branding | ✅ Complete |

### Key Achievements
- Full multi-tenant isolation with tenant-specific URLs (`/{tenant-slug}/dashboard`)
- Separate Platform Admin portal (`/admin/*`) vs Tenant Admin (`/{tenant}/settings/*`)
- Row-Level Security (RLS) for data filtering by user groups
- Tenant branding customization (logo, colors, login page)
- User and group management within tenants
- Connector management with RLS configuration

### Current URLs Structure
```
Platform Admin:
  /admin                    → Platform dashboard
  /admin/tenants            → Manage all tenants
  /admin/tenants/[id]       → Tenant details
  /admin/users              → All platform users

Tenant Users:
  /{tenant}/login           → Tenant-specific login
  /{tenant}/register        → Request access to tenant
  /{tenant}/dashboard       → Tenant dashboard
  /{tenant}/settings        → Settings menu (admin only)
  /{tenant}/settings/users  → Manage tenant users
  /{tenant}/settings/groups → Manage user groups
  /{tenant}/settings/connectors → Manage RLS
  /{tenant}/settings/branding → Customize branding
```

---

*Document Version: 1.8*
*Created: 2026-01-07*
*Updated: 2026-01-11*
*Based on: LUCENT R Shiny Application*
