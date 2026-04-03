# LUCENT — CranL Deployment Guide

This guide walks through deploying the LUCENT platform to CranL. The backend
uses a Dockerfile build (required for ODBC Driver 17 and CmdStan). The
frontend uses nixpacks auto-detection.

## Prerequisites

- CranL CLI v1.5.1+ installed and authenticated (`cranl auth whoami`)
- GitHub repository connected to your CranL account
- Fernet key and secret key generated (see `.env.cranl.example` for commands)

---

## Step-by-step Deployment

### 1. Create CranL project

```bash
cranl projects create "Lucent Production"
```

### 2. Connect GitHub repository

```bash
cranl github connect
```

Note the `<repo-id>` returned — you will use it in the next steps.

### 3. Deploy the backend (Dockerfile build)

```bash
cranl apps create --repo <repo-id> --name lucent-backend \
  --build-type dockerfile --build-path /backend
```

Note the `<backend-app-id>` returned.

### 4. Deploy the frontend (nixpacks auto-detect)

```bash
cranl apps create --repo <repo-id> --name lucent-frontend \
  --build-type nixpacks --build-path /frontend
```

Note the `<frontend-app-id>` returned.

### 5. Create managed databases

```bash
# PostgreSQL — DATABASE_URL is injected into the backend app automatically
cranl db create --type pg --name lucent-db --inject <backend-app-id>

# Redis — REDIS_URL is injected into the backend app automatically
cranl db create --type redis --name lucent-redis --inject <backend-app-id>
```

### 6. Create S3 storage bucket

Use the CranL dashboard to create a Storage Bucket named `lucent-data`.
The CDN endpoint will be: `https://storage-lucent-data.cranl.net`

### 7. Set remaining environment variables on the backend

```bash
cranl apps env set <backend-app-id> \
  S3_BUCKET=lucent-data \
  S3_ENDPOINT_URL=https://storage-lucent-data.cranl.net \
  S3_ACCESS_KEY=<key> \
  S3_SECRET_KEY=<secret> \
  S3_REGION=us-east-1 \
  STORAGE_BACKEND=s3 \
  ENCRYPTION_KEY=<fernet-key> \
  SECRET_KEY=<random-secret> \
  APP_ENV=production \
  DEBUG=False \
  CORS_ORIGINS=https://<frontend-app-id>.cranl.app \
  STACK_PROJECT_ID=<stack-project-id> \
  STACK_SECRET_SERVER_KEY=<stack-secret-server-key>
```

### 8. Set environment variables on the frontend

```bash
cranl apps env set <frontend-app-id> \
  NEXT_PUBLIC_API_URL=https://<backend-app-id>.cranl.app/api/v1 \
  STACK_PROJECT_ID=<stack-project-id> \
  STACK_PUBLISHABLE_CLIENT_KEY=<stack-publishable-client-key>
```

### 9. Run database migrations

Migrations must run after the first deploy. Execute inside the backend
container or add as a release command in your CranL app settings:

```bash
alembic upgrade head
```

To run it manually via the CranL CLI:

```bash
cranl apps exec <backend-app-id> -- alembic upgrade head
```

### 10. Custom domains (optional)

```bash
cranl apps domains add <backend-app-id> api.lucent.app
cranl apps domains add <frontend-app-id> app.lucent.app
```

---

## Rollback

CranL retains the previous successful build. To roll back:

```bash
cranl apps rollback <app-id>
```

---

## Environment Variable Reference

See `.env.cranl.example` at the project root for a full annotated list of
every environment variable the backend reads, including how to generate
secret values.

---

## Local Development

For local development, continue using `ecosystem.config.js` with PM2:

```bash
pm2 start ecosystem.config.js
```

Or start each process individually:

```bash
# Backend
cd backend && uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev
```
