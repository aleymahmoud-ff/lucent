# LUCENT — SQL Server Connector Wizard + Forecast Permanence + CranL Migration

## Context

LUCENT is a multi-tenant SaaS for time series forecasting. Four critical problems exist today:

1. **Forecast results vanish** — stored in Redis with 1hr TTL. No audit trail, no reproducibility.
2. **No data accountability** — when a forecast runs, the source data isn't preserved. Can't prove what data produced what result.
3. **SQL Server connector incomplete** — enum exists but no implementation. No step-by-step import wizard for any connector.
4. **Platform migration needed** — moving to CranL (managed PostgreSQL + Redis + S3-compatible storage).

---

## CranL Platform Summary

| Service | CranL Solution | How |
|---------|---------------|-----|
| **Frontend (Next.js)** | nixpacks auto-build | `cranl apps create --build-type nixpacks` |
| **Backend (FastAPI)** | Dockerfile build | `cranl apps create --build-type dockerfile --build-path /backend` |
| **PostgreSQL** | Managed database | `cranl db create --type pg --inject <backend-app-id>` |
| **Redis** | Managed database | `cranl db create --type redis --inject <backend-app-id>` |
| **S3 Storage** | CranL Storage Bucket | S3-compatible, works with boto3, CDN at `storage-{name}.cranl.net` |

**Why Dockerfile for backend?** Two system-level packages that pip can't install:
- `msodbcsql17` — Microsoft ODBC Driver 17 (for SQL Server connector via `aioodbc`)
- `cmdstan` — C++ math backend (for Prophet forecasting)

Everything else (FastAPI, pandas, boto3, etc.) installs via pip normally.

---

## Two-Role Architecture (NEW)

```
TENANT ADMIN (setup, one-time per data source)
══════════════════════════════════════════════
  Step 1: Select DB connection (existing connector)
  Step 2: Select table → system lists available tables with row counts
  Step 3: Map columns → Date, Entity_ID, Entity_Name, Volume
  Step 4: Preview → TOP 100 rows with mapped columns
  Step 5: Confirm → system auto-extracts ALL unique entities
          → saves ConnectorDataSource "recipe"
          → auto-creates ConnectorRLS with rls_column = Entity_ID column
          → returns entity list for RLS assignment

TENANT ADMIN (RLS assignment, after wizard)
═══════════════════════════════════════════
  Uses existing RLS + Groups UI:
  - ConnectorRLS.rls_column = the Entity_ID column from column_map
  - UserGroup.rls_values = subset of extracted entities assigned to each group
  - UserGroupMembership = which users belong to which group

REGULAR USER (daily usage)
═══════════════════════════
  Step 1: Sees only their RLS-allowed entities (filtered by group membership)
  Step 2: Selects date range for their allowed data
  Step 3: Imports/forecasts on filtered subset
```

### How RLS Integrates with the Wizard

1. **Admin runs wizard** → system extracts all unique entities from Entity_ID column
2. **Wizard auto-creates** `ConnectorRLS` record with `rls_column = column_map["entity_id"]`
3. **Admin assigns entities to groups** via existing Groups UI (`UserGroup.rls_values`)
4. **User imports data** → backend filters by:
   - User's group → `UserGroup.rls_values` (allowed entity IDs)
   - User's selected date range
5. **User runs forecast** → only sees their allowed entities

---

## What Data We Keep

### PERMANENT (PostgreSQL — never deleted)

| Data | Table | What's Stored | Why |
|------|-------|---------------|-----|
| Tenant config | `tenants` | Name, slug, settings, limits (incl. `data_retention_days`) | Core identity |
| Users & groups | `users`, `user_groups`, `user_group_memberships` | Accounts, roles, RLS groups | Access control |
| Connector credentials | `connectors` | Encrypted connection configs (server, user, password) | Re-connect anytime |
| Connector RLS | `connector_rls_configs` | Which column filters data per group | Security |
| **Data source recipes** | **`connector_data_sources` (NEW)** | **Table, column mapping, all extracted entities — the "recipe" to re-fetch** | **Re-import without re-configuring wizard** |
| Dataset metadata | `datasets` | Filename, columns, row count, date range, entity list | Registry of all imports |
| **Forecast runs** | `forecast_history` (enhanced) | **Who ran it, when, which method, config, snapshot_id** | **Full audit trail** |
| **Forecast predictions** | **`forecast_predictions` (NEW)** | **Predicted values, confidence bounds, metrics (MAE/RMSE/MAPE), model summary per entity** | **Permanent results — never lost** |
| **Snapshot metadata** | **`data_snapshots` (NEW)** | **S3 key, data hash, row count, file size, expiry date** | **Pointer to the exact data used** |
| Audit logs | `audit_logs` | Action, user, resource, IP, timestamp | Compliance |
| Usage stats | `usage_stats` | Forecast runs, uploads, exports per user | Billing/quotas |
| Platform admins | `platform_admins` | System-level admin accounts | Platform management |

### RETAINED WITH EXPIRY (CranL S3 — configurable per tenant)

| Data | S3 Path | Format | Retention | Why |
|------|---------|--------|-----------|-----|
| **Data snapshots** | `{tenant}/snapshots/{hash}.parquet.gz` | Compressed Parquet | **30/90/180/365 days** (tenant setting) | Reproduce any forecast within retention window |

When a snapshot expires:
- S3 file is **deleted** (saves storage)
- `data_snapshots.status` set to `"expired"` (metadata stays in PostgreSQL)
- `forecast_history` and `forecast_predictions` are **NOT touched** — results are permanent
- User sees: "Snapshot expired. Predictions preserved. Re-fetch from source to reproduce."

### EPHEMERAL (CranL Redis — working session cache)

| Data | Redis Key | TTL | Purpose |
|------|-----------|-----|---------|
| Working dataset | `dataset:{id}` | 4 hours | Active session data from upload or connector |
| Dataset metadata cache | `dataset_meta:{id}` | 4 hours | Fast metadata lookup |
| Preprocessed data | `preprocessed:{id}` | 2 hours | Cleaned data during session |
| Forecast hot cache | `forecast:{id}` | 1 hour | Fast access to recent results (PostgreSQL is fallback) |
| Batch progress | `forecast_batch:{id}` | 1 hour | Real-time progress tracking |
| Rate limits | `rate_limit:{action}:{user_id}` | 1 hour window | Throttle forecast requests |

Redis is **pure cache** — losing it loses nothing permanent.

### EPHEMERAL (CranL S3 — auto-cleanup)

| Data | S3 Path | Auto-Delete | Purpose |
|------|---------|-------------|---------|
| Working files | `{tenant}/working/{dataset_id}.parquet` | 24 hours | Temp storage during active session |
| Exports | `{tenant}/exports/{export_id}.csv` | 1 hour | User download files |

### NOT STORED (fetched on demand)

| Data | Source | When |
|------|--------|------|
| SQL Server live data | Customer's SQL Server | Re-fetched using saved recipe when Redis expires |
| Other connector data | Customer's Postgres/MySQL/S3/etc. | Re-fetched using saved recipe |

---

## Data Lifecycle Diagram

```
ADMIN SETS UP DATA SOURCE VIA WIZARD
═════════════════════════════════════
  Wizard config ──────► connector_data_sources (PostgreSQL, PERMANENT)
  Extract entities ───► returned to admin for RLS assignment
  Auto-create RLS ────► connector_rls_configs (PostgreSQL, PERMANENT)
  Admin assigns ──────► user_groups.rls_values (PostgreSQL, PERMANENT)

USER IMPORTS DATA (filtered by RLS)
════════════════════════════════════
  Allowed entities ───► filtered by UserGroup.rls_values
  + date range ───────► user picks date range
  Fetch from source ──► Redis dataset:{id} (4hr TTL, working cache)
                    ──► datasets table (PostgreSQL, metadata PERMANENT)

USER RUNS FORECAST
══════════════════
  Input data ─────────► CranL S3 snapshot (RETAINED, tenant retention policy)
                    ──► data_snapshots table (PostgreSQL, metadata PERMANENT)

  Forecast engine ────► Redis forecast:{id} (1hr TTL, hot cache)
                    ──► forecast_predictions (PostgreSQL, PERMANENT)
                    ──► forecast_history (PostgreSQL, PERMANENT)

USER RETURNS NEXT DAY
═════════════════════
  Redis expired? ─────► Re-fetch from source using saved recipe (RLS-filtered)
  Need old forecast? ─► Read from PostgreSQL (permanent)
  Need old data? ─────► Download from S3 snapshot (if within retention)

RETENTION JOB (DAILY)
═════════════════════
  Snapshot past expiry?
    YES ──► Delete S3 file, mark snapshot "expired"
            Forecast results PRESERVED in PostgreSQL
    NO  ──► Keep
```

---

## Phases & Outcomes

### Phase 1: SQL Server Connector ✅ COMPLETED

**Dependencies:** None — start immediately
**Owner:** Nabil + Omar

**Outcome:** SQL Server connector fully working — users can test connection, list tables, and fetch data from SQL Server databases.

#### Created
- **`backend/app/connectors/sqlserver_connector.py`** — `SQLServerConnector(BaseConnector)` class
- **`backend/app/connectors/__init__.py`** — registered in factory
- **`backend/requirements.txt`** — added `aioodbc==0.5.0`

---

### Phase 2: New Database Models + Migration ✅ COMPLETED

**Dependencies:** None — parallel with Phase 1
**Owner:** Salma

**Outcome:** 3 new tables in PostgreSQL + enhanced forecast_history. Database ready for permanent storage.

#### Created
- **`backend/app/models/connector_data_source.py`** — wizard saved config
- **`backend/app/models/data_snapshot.py`** — S3 pointer
- **`backend/app/models/forecast_prediction.py`** — permanent results
- **`backend/app/schemas/connector_wizard.py`** — wizard request/response schemas
- **`backend/app/schemas/connector_data_sources.py`** — CRUD schemas
- **`backend/alembic/versions/20260331120000_*.py`** — migration

#### Modified
- **`backend/app/models/forecast_history.py`** — added snapshot_id FK
- **`backend/app/models/__init__.py`** — registered 3 new models
- **`backend/alembic/env.py`** — imported new models

---

### Phase 3: Storage Service (S3 Abstraction) ✅ COMPLETED

**Dependencies:** None — parallel with Phase 1 and 2
**Owner:** Omar

**Outcome:** Backend can upload/download/delete files to CranL S3 (or local disk in dev).

#### Created
- **`backend/app/services/storage/`** — full package (base, s3_backend, local_backend, factory)

#### Modified
- **`backend/app/config.py`** — added S3 + storage settings

---

### Phase 4: Forecast Permanence 🔄 IN PROGRESS

**Dependencies:** Phase 2 + Phase 3
**Owner:** Nabil

**Outcome:** Every forecast run is permanently saved. Predictions never lost. Input data snapshotted to S3. Results retrievable even after Redis expires.

#### Create
- **`backend/app/services/snapshot_service.py`** ✅ — snapshot management (created)

#### Modify
- **`backend/app/services/forecast_service.py`** — add snapshot + permanent persistence
- **`backend/app/services/results_service.py`** — add PostgreSQL fallback retrieval
- **`backend/app/api/v1/endpoints/results.py`** — pass DB session
- **`backend/app/api/v1/endpoints/forecast.py`** — pass DB session

---

### Phase 5: Connector Wizard Endpoints (Admin Setup)

**Dependencies:** Phase 1 + Phase 2
**Owner:** Nabil

**Outcome:** API endpoints for admin to configure a data source. Admin selects connection → table → maps columns → system auto-extracts ALL entities. Entities feed into existing RLS system for user-level access control.

#### Create
- **`backend/app/api/v1/endpoints/connector_wizard.py`** — Admin wizard endpoints:

| Endpoint | Purpose | Auth | Returns |
|----------|---------|------|---------|
| `POST /connectors/{id}/wizard/tables` | List tables with row counts | Admin | `[{name, schema, row_count}]` |
| `POST /connectors/{id}/wizard/columns` | Columns for a table with types + samples | Admin | `[{name, type, nullable, sample}]` |
| `POST /connectors/{id}/wizard/preview` | TOP 100 rows with column mapping applied | Admin | `{columns, rows, row_count}` |
| `POST /connectors/{id}/wizard/date-range` | MIN/MAX of date column | Admin | `{min_date, max_date, total_rows}` |
| `POST /connectors/{id}/wizard/setup` | Save recipe + extract ALL entities + auto-set RLS column | Admin | `{data_source_id, entities, rls_column}` |

- **`backend/app/api/v1/endpoints/connector_data.py`** — User data access endpoints:

| Endpoint | Purpose | Auth | Returns |
|----------|---------|------|---------|
| `GET /data-sources/{id}/entities` | List user's RLS-allowed entities | User | `[{id, name, count}]` |
| `POST /data-sources/{id}/import` | Import data: filtered by RLS entities + date range | User | `{dataset_id, row_count, entity_count}` |

#### How the Setup Endpoint Works

```
POST /connectors/{id}/wizard/setup
Body: { table, column_map, name }

1. Validate connector + tenant ownership
2. Build SELECT DISTINCT [entity_id], [entity_name], COUNT(*) query
3. Execute against remote DB → get ALL entities
4. Save ConnectorDataSource record (recipe + all entities)
5. Auto-create ConnectorRLS record:
   - rls_column = column_map["entity_id"]  (the remote column name)
   - is_enabled = true
6. Return { data_source_id, entities: [...], rls_column }
7. Admin then assigns entities to groups via existing Groups UI
```

#### How the User Import Endpoint Works

```
POST /data-sources/{id}/import
Body: { date_range_start, date_range_end }

1. Load ConnectorDataSource recipe
2. Get user's group → UserGroup.rls_values (allowed entity IDs)
3. Build query: SELECT mapped columns
                WHERE [entity_id] IN (allowed_entities)
                AND [date] BETWEEN start AND end
4. Fetch from remote DB
5. Store in Redis as dataset + create Dataset record
6. Return { dataset_id, row_count, entity_count }
```

#### Modify
- **`backend/app/api/v1/api.py`** — register wizard router and data router

---

### Phase 6: Connector Wizard Frontend

**Dependencies:** Phase 5
**Owner:** Yoki + Tumtum

**Outcome:** Admin sees a 5-step wizard to set up data sources. Regular users see a simplified import view with their allowed entities + date range picker.

#### Create — Admin Wizard (under `frontend/src/components/connectors/wizard/`)

| File | What Admin Sees |
|------|----------------|
| `ConnectorWizard.tsx` | Full-screen dialog with stepper + step content |
| `WizardStepper.tsx` | ①──②──③──④──⑤ progress bar at top |
| `steps/ConnectionStep.tsx` | Select connector + "Test Connection" button |
| `steps/TableStep.tsx` | Searchable table list with row counts |
| `steps/ColumnMapStep.tsx` | 4 dropdowns: Date, Entity_ID, Entity_Name, Volume |
| `steps/PreviewStep.tsx` | Table showing 100 rows + summary stats |
| `steps/SetupCompleteStep.tsx` | Entity list extracted + "Configure RLS" link |
| `index.ts` | Barrel export |

#### Create — User Import View (under `frontend/src/components/data/`)

| File | What User Sees |
|------|---------------|
| `DataImport.tsx` | Select data source → see allowed entities → pick date range → import |
| `EntityList.tsx` | Read-only list of user's allowed entities (from RLS) |
| `DateRangePicker.tsx` | Date pickers + quick-select (3mo/6mo/1yr/all) |

#### Modify
- **`frontend/src/lib/api/endpoints.ts`** — add wizard + data import methods
- **`frontend/src/app/[tenant]/connectors/page.tsx`** — add "Setup Data Source" button (admin only)
- **`frontend/src/app/[tenant]/data/page.tsx`** — add "Import Data" view (all users)
- **`frontend/src/types/index.ts`** — add wizard + data import TypeScript types

---

### Phase 7: Data Retention

**Dependencies:** Phase 2 + 3 + 4
**Owner:** Nabil + Tarek

**Outcome:** Expired snapshots auto-cleaned from S3 daily. Forecast results preserved forever. Storage costs stay minimal.

#### Create
- **`backend/app/tasks/retention.py`** — Celery beat task (daily at 3 AM)
  - Query expired snapshots → delete S3 file → mark status "expired"
  - Forecast predictions/metadata are NEVER deleted

#### Modify
- **`backend/app/services/snapshot_service.py`** — add expiry calculation from tenant limits
- **`backend/app/config.py`** — add `RETENTION_CLEANUP_INTERVAL_HOURS: int = 24`

---

### Phase 8: CranL Deployment

**Dependencies:** All previous phases
**Owner:** Tarek

**Outcome:** LUCENT running on CranL with managed PostgreSQL, Redis, and S3 storage. Auto-deploys on git push.

#### Create

- **`backend/Dockerfile`**:
  ```dockerfile
  FROM python:3.11-slim

  # ODBC Driver 17 for SQL Server
  RUN apt-get update && apt-get install -y curl gnupg unixodbc-dev \
      && curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add - \
      && curl https://packages.microsoft.com/config/debian/12/prod.list \
         > /etc/apt/sources.list.d/mssql-release.list \
      && apt-get update \
      && ACCEPT_EULA=Y apt-get install -y msodbcsql17 \
      && rm -rf /var/lib/apt/lists/*

  # CmdStan for Prophet
  RUN pip install cmdstanpy && python -m cmdstanpy.install_cmdstan

  WORKDIR /app
  COPY requirements.txt .
  RUN pip install --no-cache-dir -r requirements.txt
  COPY . .

  CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
  ```

- **`frontend/nixpacks.toml`** — Next.js nixpacks config (auto-detects, minimal config needed)

- **`.env.cranl.example`** — environment template:
  ```env
  DATABASE_URL=postgresql+asyncpg://<cranl-pg-connection>
  REDIS_URL=redis://<cranl-redis-connection>
  S3_BUCKET=lucent-data
  S3_ENDPOINT_URL=https://storage-lucent-data.cranl.net
  S3_ACCESS_KEY=<from-cranl-storage-bucket>
  S3_SECRET_KEY=<from-cranl-storage-bucket>
  STORAGE_BACKEND=s3
  ENCRYPTION_KEY=<generate-fernet-key>
  ```

#### CranL Deployment Commands
```bash
# 1. Create project
cranl projects create "Lucent Production"

# 2. Connect GitHub
cranl github connect

# 3. Deploy backend (Dockerfile — handles ODBC + CmdStan)
cranl apps create --repo <repo-id> --name lucent-backend \
  --build-type dockerfile --build-path /backend

# 4. Deploy frontend (nixpacks — auto-detects Next.js)
cranl apps create --repo <repo-id> --name lucent-frontend \
  --build-type nixpacks --build-path /frontend

# 5. Create managed databases
cranl db create --type pg --name lucent-db --inject <backend-app-id>
cranl db create --type redis --name lucent-redis --inject <backend-app-id>

# 6. Create S3 storage bucket (via CranL dashboard)
# Bucket: lucent-data
# CDN: storage-lucent-data.cranl.net

# 7. Set remaining env vars
cranl apps env set <backend-app-id> \
  S3_BUCKET=lucent-data \
  S3_ENDPOINT_URL=https://storage-lucent-data.cranl.net \
  S3_ACCESS_KEY=<key> \
  S3_SECRET_KEY=<secret> \
  STORAGE_BACKEND=s3 \
  ENCRYPTION_KEY=<fernet-key>

# 8. Run database migration
# SSH/exec into backend or add as build step:
# alembic upgrade head

# 9. Custom domain (optional)
cranl apps domains add <backend-app-id> api.lucent.app
cranl apps domains add <frontend-app-id> app.lucent.app
```

#### Modify
- **`ecosystem.config.js`** — remove Windows hardcoded paths, make env-aware (for local dev)

---

## Phase Dependency Graph

```
Phase 1 (SQL Server)  ✅ ─────────────────────┐
Phase 2 (Models)      ✅ ───────────────┐     │
Phase 3 (S3 Storage)  ✅ ──────────┐    │     │
                                   │    │     │
                                   v    v     │
                         Phase 4 (Forecast    │
                          Permanence) 🔄      │
                                   │          v
                                   │  Phase 5 (Wizard + Data Endpoints)
                                   │          │
                                   v          v
                         Phase 7 (Retention) Phase 6 (Wizard + Import Frontend)
                                   │          │
                                   v          v
                         Phase 8 (CranL Deployment)
```

**Phases 1, 2, 3 completed in parallel. Phase 4 in progress. Phase 5 requirements updated.**

---

## Phase Outcomes Summary

| Phase | What Gets Built | User-Visible Outcome |
|-------|----------------|---------------------|
| **1. SQL Server Connector** ✅ | `SQLServerConnector` class + factory registration | Users can connect to SQL Server, test connection, browse tables |
| **2. Database Models** ✅ | 3 new tables + migration | Database ready for permanent forecast storage and wizard configs |
| **3. S3 Storage Service** ✅ | Abstract storage layer + CranL S3 integration | Backend can upload/download files to CranL S3 bucket |
| **4. Forecast Permanence** 🔄 | Snapshot service + two-tier results retrieval | Forecasts never lost. Input data preserved. Audit trail complete |
| **5. Wizard + Data Endpoints** | Admin wizard (5 endpoints) + User data access (2 endpoints) | Admin sets up data sources + RLS. Users import their allowed data |
| **6. Wizard + Import Frontend** | Admin 5-step wizard + User import view | Admin walks through setup. Users see allowed entities + date picker |
| **7. Data Retention** | Daily cleanup job + tenant-configurable expiry | Old snapshots auto-cleaned. Storage costs stay minimal |
| **8. CranL Deployment** | Dockerfile + env config + deploy commands | LUCENT live on CranL with managed DB, Redis, S3. Auto-deploys on git push |

---

## Storage Cost Estimate

```
Per forecast snapshot:  ~12 KB (1000 rows, 4 cols, parquet+gzip)
Per tenant/month:       50 forecasts × 12 KB = 600 KB
Per tenant/year:        ~7 MB in S3
1000 tenants/year:      ~7 GB total

PostgreSQL per forecast: ~3 KB (predictions + metrics + run metadata)
Per tenant/year:         600 forecasts × 3 KB = 1.8 MB
1000 tenants/year:       ~1.8 GB in PostgreSQL
```
