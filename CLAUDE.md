# Project: LUCENT — Multi-Tenant SaaS Platform for Time Series Forecasting

## Tech Stack

### Frontend
- Framework: Next.js 16 (App Router)
- Language: TypeScript 5
- UI Library: shadcn/ui + Radix UI
- Styling: Tailwind CSS 4
- State Management: Zustand 5
- Data Fetching: TanStack Query (React Query) 5
- HTTP Client: Axios
- Charts: Plotly.js 3 + react-plotly.js
- Forms: React Hook Form 7 + Zod 4
- Auth: NextAuth.js 4 + Stack Auth

### Backend
- Framework: FastAPI 0.109
- Language: Python 3.11+
- ORM: SQLAlchemy 2.0
- Migrations: Alembic
- Validation: Pydantic v2
- Server: Uvicorn
- Task Queue: Celery + Redis

### Infrastructure
- Database: Neon PostgreSQL (cloud)
- Cache/Sessions: Upstash Redis (cloud)
- Process Manager: PM2
- Auth Provider: Stack Auth

## Architecture
- Multi-tenant SaaS with Row Level Security (tenant_id isolation)
- Frontend at `frontend/`, Backend at `backend/`
- RESTful API with v1 versioning (`/api/v1/`)
- Base path deployment at `/lucent`
- 11 SQLAlchemy ORM models
- 8 endpoint modules (68 endpoints defined)
- Alembic migrations in `backend/alembic/versions/`

## Key Conventions

### Frontend
- Components in `frontend/src/components/` organized by feature
- Pages in `frontend/src/app/` using App Router
- API client in `frontend/src/lib/api/client.ts` with interceptors
- Endpoints in `frontend/src/lib/api/endpoints.ts`
- State stores in `frontend/src/stores/`
- Types in `frontend/src/types/`
- Use `cn()` helper from `frontend/src/lib/utils.ts` for conditional classes
- Use `'use client'` directive only when needed — prefer server components

### Backend
- Entry point: `backend/app/main.py`
- Config: `backend/app/config.py`
- API routes: `backend/app/api/v1/endpoints/`
- Models: `backend/app/models/`
- Schemas: `backend/app/schemas/`
- Services: `backend/app/services/`
- Forecasting: `backend/app/forecasting/`
- Security: `backend/app/core/security.py`
- Dependencies: `backend/app/core/deps.py`

### Database
- Every table has: `id` (uuid), `tenant_id` (uuid FK), `created_at`, `updated_at`
- RLS enabled on every table
- Migrations named: `YYYYMMDDHHMMSS_description.py`
- All queries parameterized — never concatenate values

## Commands
- `cd frontend && npm run dev` — Start frontend dev server (port 3000)
- `cd frontend && npm run build` — Production build
- `cd backend && uvicorn app.main:app --reload --port 8000` — Start backend
- `pm2 start ecosystem.config.js` — Start both via PM2
- `pm2 logs --nostream --lines 20` — View PM2 logs
- `cd backend && alembic upgrade head` — Run migrations
- `cd backend && alembic revision --autogenerate -m "description"` — Create migration

## The Team
- **Reem** — Project Architect (technical lead, architecture decisions)
- **Tumtum** — UI/UX Designer (design system, accessibility, user flows)
- **Yoki** — Frontend Developer (React/Next.js components, pages, client logic)
- **Nabil** — Backend Developer (FastAPI endpoints, services, business logic)
- **Salma** — Database Engineer (schemas, migrations, RLS, queries)
- **Zain** — Security Specialist (audits, auth review, hardening)
- **Farida** — QA / Code Reviewer (testing, standards, bug tracking)
- **Tarek** — DevOps (PM2, CI/CD, deployment, infrastructure)
- **Layla** — Technical Writer (docs, API docs, changelogs, guides)
- **Omar** — Cloud Integration Specialist (data connectors, cloud services)

## Agent Team Coordination Rules
- Each teammate owns specific directories — do NOT edit files outside your scope
- Always pull latest before starting work
- Communicate blockers through the shared task list
- Zain (Security) must review all auth-related changes
- Farida (QA) must check all changes before they're considered done
- Reem (Architect) approves all structural changes

## CRITICAL: Discovery Before Creation (Anti-Duplication Protocol)
Every teammate MUST follow this before writing ANY utility, helper, constant, mapping, or shared logic:

### Step 1: Search First
Before creating a new function, constant, enum, type, or config:
```bash
grep -r "keyword" frontend/src/lib/ frontend/src/stores/ backend/app/services/ backend/app/core/
grep -r "functionName\|CONSTANT_NAME" --include="*.ts" --include="*.tsx" --include="*.py" .
```

### Step 2: Check the Shared Registry
Read `/docs/shared-registry.md` before creating anything reusable. If a utility exists, USE IT.

### Step 3: Register New Utilities
If you create a new shared utility, you MUST:
1. Add it to `/docs/shared-registry.md` with: name, file path, purpose, and your name
2. Notify teammates who might need it

### Step 4: No Hardcoded Lists
If a dynamic list, mapping, or config already exists as a utility, NEVER hardcode your own version. Import the existing one.

Farida (QA) WILL flag duplication as a blocking issue. Duplicated logic must be resolved before the task is marked complete.
