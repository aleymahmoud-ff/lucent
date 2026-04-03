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

## What Data We Keep

### PERMANENT (PostgreSQL — never deleted)

| Data | Table | What's Stored | Why |
|------|-------|---------------|-----|
| Tenant config | `tenants` | Name, slug, settings, limits (incl. `data_retention_days`) | Core identity |
| Users & groups | `users`, `user_groups`, `user_group_memberships` | Accounts, roles, RLS groups | Access control |
| Connector credentials | `connectors` | Encrypted connection configs (server, user, password) | Re-connect anytime |
| Connector RLS | `connector_rls_configs` | Which column filters data per group | Security |
| **Data source recipes** | **`connector_data_sources` (NEW)** | **Table, column mapping, date range, entity IDs — the "recipe" to re-fetch** | **Re-import without re-configuring wizard** |
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
USER IMPORTS VIA WIZARD
═══════════════════════
  Wizard config ──────► connector_data_sources (PostgreSQL, PERMANENT)
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
  Redis expired? ─────► Re-fetch from source using saved recipe
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

### Phase 1: SQL Server Connector

**Dependencies:** None — start immediately
**Owner:** Nabil + Omar

**Outcome:** SQL Server connector fully working — users can test connection, list tables, and fetch data from SQL Server databases.

#### Create
- **`backend/app/connectors/sqlserver_connector.py`** — `SQLServerConnector(BaseConnector)` class
  - Uses `aioodbc` with ODBC Driver 17
  - DSN: `DRIVER={ODBC Driver 17 for SQL Server};SERVER={host},{port};DATABASE={db};UID={user};PWD={pwd}`
  - `test_connection()` — connect + `SELECT 1`
  - `fetch_data()` — `SELECT TOP {limit}` syntax, `[bracket]` identifier quoting
  - `list_resources()` — query `information_schema.tables WHERE table_type='BASE TABLE'`
  - Pattern: follow `postgres_connector.py` and `mysql_connector.py`

#### Modify
- **`backend/app/connectors/__init__.py`** — add `"sqlserver": SQLServerConnector` to registry
- **`backend/requirements.txt`** — add `aioodbc==0.5.0`

---

### Phase 2: New Database Models + Migration

**Dependencies:** None — parallel with Phase 1
**Owner:** Salma

**Outcome:** 3 new tables in PostgreSQL + enhanced forecast_history. Database ready for permanent storage.

#### Create
- **`backend/app/models/connector_data_source.py`** — wizard saved config (table, column_map, date range, entity IDs)
- **`backend/app/models/data_snapshot.py`** — S3 pointer (s3_key, data_hash, status, expires_at)
- **`backend/app/models/forecast_prediction.py`** — permanent results (predicted_values, metrics, model_summary per entity)
- **`backend/app/schemas/connector_wizard.py`** — Pydantic request/response schemas for wizard
- **`backend/app/schemas/connector_data_sources.py`** — CRUD schemas for data source configs
- **`backend/alembic/versions/20260331_add_data_sources_snapshots_predictions.py`** — migration

#### Modify
- **`backend/app/models/forecast_history.py`** — add `snapshot_id` FK + `predictions` relationship
- **`backend/app/models/__init__.py`** — register 3 new models
- **`backend/alembic/env.py`** — import new models

---

### Phase 3: Storage Service (S3 Abstraction)

**Dependencies:** None — parallel with Phase 1 and 2
**Owner:** Omar

**Outcome:** Backend can upload/download/delete files to CranL S3 (or local disk in dev). Ready for snapshots and exports.

#### Create
- **`backend/app/services/storage/__init__.py`** — package
- **`backend/app/services/storage/base.py`** — abstract `StorageBackend` (upload, download, delete, exists)
- **`backend/app/services/storage/s3_backend.py`** — CranL S3 via boto3 + `asyncio.to_thread`
  - Endpoint: `https://storage-{bucket}.cranl.net`
  - Uses boto3 (already in requirements.txt)
- **`backend/app/services/storage/local_backend.py`** — local filesystem fallback via `aiofiles`
- **`backend/app/services/storage/factory.py`** — returns S3 or Local based on config

#### Modify
- **`backend/app/config.py`** — add settings:
  ```
  S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY
  S3_ENDPOINT_URL (https://storage-lucent-data.cranl.net)
  S3_REGION, STORAGE_BACKEND ("s3" | "local"), LOCAL_STORAGE_PATH
  ```

---

### Phase 4: Forecast Permanence

**Dependencies:** Phase 2 + Phase 3
**Owner:** Nabil

**Outcome:** Every forecast run is permanently saved. Predictions never lost. Input data snapshotted to S3. Results retrievable even after Redis expires.

#### Create
- **`backend/app/services/snapshot_service.py`** — snapshot management
  - `create_snapshot()` — hash → dedup check → compress parquet → upload S3 → DB record
  - `get_snapshot_data()` — download from S3 → decompress → DataFrame
  - `compute_data_hash()` — SHA-256 for dedup (same data = reuse snapshot)
  - `calculate_expiry()` — read tenant's `data_retention_days`

#### Modify
- **`backend/app/services/forecast_service.py`** — the critical change:
  - BEFORE forecast: snapshot input data → S3
  - AFTER forecast: save predictions → PostgreSQL `forecast_predictions`
  - Update `forecast_history` with `snapshot_id`
  - Keep Redis hot cache unchanged
  - S3/DB writes wrapped in try/except (never block forecast)

- **`backend/app/services/results_service.py`** — two-tier retrieval:
  - Try Redis first (fast path, existing behavior)
  - Redis miss → query PostgreSQL (permanent fallback)
  - Optionally re-populate Redis cache

- **`backend/app/api/v1/endpoints/results.py`** — pass DB session to ResultsService
- **`backend/app/api/v1/endpoints/forecast.py`** — pass DB session to ForecastService

---

### Phase 5: Connector Wizard Endpoints

**Dependencies:** Phase 1 + Phase 2
**Owner:** Nabil

**Outcome:** 6 new API endpoints powering the step-by-step wizard. Any database connector (SQL Server, PostgreSQL, MySQL, Snowflake) can use the wizard flow.

#### Create
- **`backend/app/api/v1/endpoints/connector_wizard.py`** — 6 endpoints:

| Endpoint | Purpose | Returns |
|----------|---------|---------|
| `POST /connectors/{id}/wizard/tables` | List tables with row counts | `[{name, schema, row_count}]` |
| `POST /connectors/{id}/wizard/columns` | Columns for a table with types | `[{name, type, nullable}]` |
| `POST /connectors/{id}/wizard/preview` | TOP 100 rows with column mapping | `{columns, rows, summary}` |
| `POST /connectors/{id}/wizard/date-range` | MIN/MAX of date column | `{min_date, max_date, total_rows}` |
| `POST /connectors/{id}/wizard/entities` | Distinct entities with counts | `[{id, name, count}]` |
| `POST /connectors/{id}/wizard/import` | Final import: fetch + store as dataset | `{dataset_id, data_source_id, row_count}` |

#### Modify
- **`backend/app/api/v1/api.py`** — register wizard router

---

### Phase 6: Connector Wizard Frontend

**Dependencies:** Phase 5
**Owner:** Yoki + Tumtum

**Outcome:** Users see a 6-step guided wizard to import data from any database connector. Matches the HTML mockup in `docs/mockups/sql-server-connector-wizard.html`.

#### Create (under `frontend/src/components/connectors/wizard/`)

| File | What User Sees |
|------|---------------|
| `ConnectorWizard.tsx` | Full-screen dialog with stepper + step content |
| `WizardStepper.tsx` | ①──②──③──④──⑤──⑥ progress bar at top |
| `steps/ConnectionStep.tsx` | Select connector + "Test Connection" button |
| `steps/TableStep.tsx` | Searchable table list with row counts |
| `steps/ColumnMapStep.tsx` | 4 dropdowns: Date, Entity_ID, Entity_Name, Volume |
| `steps/PreviewStep.tsx` | Table showing 100 rows + summary stats |
| `steps/DateRangeStep.tsx` | Date pickers + quick-select (3mo/6mo/1yr/all) |
| `steps/EntityStep.tsx` | Checkbox list (max 5) with search |
| `steps/ImportStep.tsx` | Progress ring → success screen |
| `index.ts` | Barrel export |

#### Modify
- **`frontend/src/lib/api/endpoints.ts`** — add 6 wizard methods to `connectorApi`
- **`frontend/src/app/[tenant]/connectors/page.tsx`** — add "Import Data" button
- **`frontend/src/types/index.ts`** — add wizard TypeScript types

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
Phase 1 (SQL Server)  ─────────────────────────────┐
Phase 2 (Models)      ─────────────────────┐       │
Phase 3 (S3 Storage)  ────────────────┐    │       │
                                      │    │       │
                                      v    v       │
                            Phase 4 (Forecast      │
                             Permanence)           │
                                      │            v
                                      │   Phase 5 (Wizard Endpoints)
                                      │            │
                                      v            v
                            Phase 7 (Retention)   Phase 6 (Wizard Frontend)
                                      │            │
                                      v            v
                            Phase 8 (CranL Deployment)
```

**Phases 1, 2, 3 can start in parallel immediately.**

---

## Phase Outcomes Summary

| Phase | What Gets Built | User-Visible Outcome |
|-------|----------------|---------------------|
| **1. SQL Server Connector** | `SQLServerConnector` class + factory registration | Users can connect to SQL Server, test connection, browse tables |
| **2. Database Models** | 3 new tables + migration | Database ready for permanent forecast storage and wizard configs |
| **3. S3 Storage Service** | Abstract storage layer + CranL S3 integration | Backend can upload/download files to CranL S3 bucket |
| **4. Forecast Permanence** | Snapshot service + two-tier results retrieval | Forecasts never lost. Input data preserved. Audit trail complete |
| **5. Wizard Endpoints** | 6 new API endpoints for step-by-step import | Backend ready to power the import wizard |
| **6. Wizard Frontend** | 6-step wizard UI with stepper | Users walk through guided data import: connect → table → map → preview → dates → entities → import |
| **7. Data Retention** | Daily cleanup job + tenant-configurable expiry | Old snapshots auto-cleaned. Storage costs stay minimal |
| **8. CranL Deployment** | Dockerfile + env config + deploy commands | LUCENT live on CranL with managed DB, Redis, S3. Auto-deploys on git push |

---

## Files Summary

### New Files (27)

| Phase | File |
|-------|------|
| 1 | `backend/app/connectors/sqlserver_connector.py` |
| 2 | `backend/app/models/connector_data_source.py` |
| 2 | `backend/app/models/data_snapshot.py` |
| 2 | `backend/app/models/forecast_prediction.py` |
| 2 | `backend/app/schemas/connector_wizard.py` |
| 2 | `backend/app/schemas/connector_data_sources.py` |
| 2 | `backend/alembic/versions/20260331_*.py` |
| 3 | `backend/app/services/storage/__init__.py` |
| 3 | `backend/app/services/storage/base.py` |
| 3 | `backend/app/services/storage/s3_backend.py` |
| 3 | `backend/app/services/storage/local_backend.py` |
| 3 | `backend/app/services/storage/factory.py` |
| 4 | `backend/app/services/snapshot_service.py` |
| 5 | `backend/app/api/v1/endpoints/connector_wizard.py` |
| 6 | `frontend/src/components/connectors/wizard/ConnectorWizard.tsx` |
| 6 | `frontend/src/components/connectors/wizard/WizardStepper.tsx` |
| 6 | `frontend/src/components/connectors/wizard/steps/ConnectionStep.tsx` |
| 6 | `frontend/src/components/connectors/wizard/steps/TableStep.tsx` |
| 6 | `frontend/src/components/connectors/wizard/steps/ColumnMapStep.tsx` |
| 6 | `frontend/src/components/connectors/wizard/steps/PreviewStep.tsx` |
| 6 | `frontend/src/components/connectors/wizard/steps/DateRangeStep.tsx` |
| 6 | `frontend/src/components/connectors/wizard/steps/EntityStep.tsx` |
| 6 | `frontend/src/components/connectors/wizard/steps/ImportStep.tsx` |
| 6 | `frontend/src/components/connectors/wizard/index.ts` |
| 7 | `backend/app/tasks/retention.py` |
| 8 | `backend/Dockerfile` |
| 8 | `frontend/nixpacks.toml` |

### Modified Files (17)

| Phase | File | Change |
|-------|------|--------|
| 1 | `backend/app/connectors/__init__.py` | Register SQL Server |
| 1 | `backend/requirements.txt` | Add aioodbc |
| 2 | `backend/app/models/forecast_history.py` | Add snapshot_id FK |
| 2 | `backend/app/models/__init__.py` | Register 3 new models |
| 2 | `backend/alembic/env.py` | Import new models |
| 3 | `backend/app/config.py` | Add S3 + storage + retention settings |
| 4 | `backend/app/services/forecast_service.py` | Add snapshot + permanent persistence |
| 4 | `backend/app/services/results_service.py` | Add PostgreSQL fallback retrieval |
| 4 | `backend/app/api/v1/endpoints/results.py` | Pass DB session |
| 4 | `backend/app/api/v1/endpoints/forecast.py` | Pass DB session |
| 5 | `backend/app/api/v1/api.py` | Register wizard router |
| 6 | `frontend/src/lib/api/endpoints.ts` | Add 6 wizard API methods |
| 6 | `frontend/src/app/[tenant]/connectors/page.tsx` | Add "Import Data" button |
| 6 | `frontend/src/types/index.ts` | Add wizard types |
| 7 | `backend/app/services/snapshot_service.py` | Add expiry calculation |
| 8 | `ecosystem.config.js` | Remove Windows hardcoded paths |
| 8 | `.env.cranl.example` | CranL environment template |

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
