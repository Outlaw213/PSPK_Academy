from fastapi import APIRouter

# All business endpoints from docs/api.md are mounted here, from M3 on.
router = APIRouter(prefix="/api/v1")
