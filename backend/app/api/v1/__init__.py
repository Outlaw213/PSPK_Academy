from fastapi import APIRouter

from app.api.v1 import admin_users, auth

# Business endpoints from docs/api.md.
router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(admin_users.router)
