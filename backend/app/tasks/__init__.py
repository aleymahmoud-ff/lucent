"""
Celery tasks package.

Tasks are registered in sub-modules and imported by the Celery app via the
`imports` config key in `backend/app/workers/celery_app.py`.

Modules:
    retention  — daily cleanup of expired DataSnapshot records from S3.
"""
