import asyncio

from fastapi import APIRouter, Request

from app.database import ping
from app.errors import AppError

router = APIRouter(tags=["health"])


@router.get("/health", summary="Service and database health")
async def health(request: Request) -> dict[str, str]:
    settings = request.app.state.settings
    try:
        await asyncio.wait_for(ping(request.app.state.engine), timeout=settings.database_connect_timeout_s + 1)
    except Exception as exc:
        raise AppError("DATABASE_UNAVAILABLE", "Database is unavailable.", 503) from exc
    return {"status": "ok", "database": "ok"}
