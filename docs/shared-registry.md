# Shared Registry

> Single source of truth for all shared utilities, constants, mappings, and helpers.
> BEFORE creating anything reusable, search this file first.
> AFTER creating something reusable, add it here.

## Utility Functions

| Name | File Path | Purpose | Created By |
|------|-----------|---------|------------|
| `cn()` | `frontend/src/lib/utils.ts` | Merges Tailwind class names conditionally | Reem |

## Shared Constants

| Name | File Path | Purpose | Created By |
|------|-----------|---------|------------|

## Type Definitions

| Name | File Path | Purpose | Created By |
|------|-----------|---------|------------|

## Pydantic Schemas (Backend)

| Name | File Path | Purpose | Created By |
|------|-----------|---------|------------|

## API Endpoints Registry

| Name | File Path | Purpose | Created By |
|------|-----------|---------|------------|
| API client | `frontend/src/lib/api/client.ts` | Axios instance with interceptors | Yoki |
| API endpoints | `frontend/src/lib/api/endpoints.ts` | All 68 endpoint definitions | Yoki |

## Mappings / Config Objects

| Name | File Path | Purpose | Created By |
|------|-----------|---------|------------|

---

### Rules
1. If your function could be used by another teammate → register it here
2. If you need a utility → search this file before writing your own
3. Duplicates found by Farida (QA) are **blocking issues**
4. Conflicts resolved by Reem (Architect)
