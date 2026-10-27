import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies.auth import CurrentUser, require_admin
from app.schemas.user import PasswordSet, Role, UserCreate, UserOut, UserPage, UserUpdate
from app.services import user_service

router = APIRouter(prefix="/admin/users", tags=["admin: users"])

UserStatus = Literal["PENDING_APPROVAL", "ACTIVE", "REJECTED", "DEACTIVATED"]


@router.get("", response_model=UserPage)
async def list_users(
    status: UserStatus | None = None,
    role: Role | None = None,
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: CurrentUser = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    return await user_service.list_users(session, status=status, role=role, q=q, limit=limit, offset=offset)


@router.post("", status_code=201, response_model=UserOut)
async def create_user(
    data: UserCreate, admin: CurrentUser = Depends(require_admin), session: AsyncSession = Depends(get_session)
):
    user = await user_service.admin_create(session, admin.user, data)
    return await user_service.to_out(session, user)


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    admin: CurrentUser = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    user = await user_service.update_user(session, admin.user, user_id, data)
    return await user_service.to_out(session, user)


@router.post("/{user_id}/approve", response_model=UserOut)
async def approve(
    user_id: uuid.UUID, admin: CurrentUser = Depends(require_admin), session: AsyncSession = Depends(get_session)
):
    return await user_service.to_out(session, await user_service.approve(session, admin.user, user_id))


@router.post("/{user_id}/reject", response_model=UserOut)
async def reject(
    user_id: uuid.UUID, admin: CurrentUser = Depends(require_admin), session: AsyncSession = Depends(get_session)
):
    return await user_service.to_out(session, await user_service.reject(session, admin.user, user_id))


@router.post("/{user_id}/password", status_code=204)
async def set_password(
    user_id: uuid.UUID,
    data: PasswordSet,
    admin: CurrentUser = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> None:
    await user_service.set_password(session, admin.user, user_id, data.new_password)
