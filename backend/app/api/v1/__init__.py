from fastapi import APIRouter

from app.api.v1 import admin_content, admin_enrollments, admin_users, auth, participant

# Business endpoints from docs/api.md.
router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(admin_users.router)
router.include_router(admin_content.router)
router.include_router(admin_enrollments.router)
router.include_router(participant.router)
