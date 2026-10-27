import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies.auth import CurrentUser, require_admin
from app.schemas.instructor import PermissionIn
from app.services import permission_service as svc

router = APIRouter(prefix="/admin/instructor-permissions", tags=["admin: instructor permissions"])


@router.get("", response_model=svc.PermissionPage)
async def list_permissions(
    instructor_id: uuid.UUID | None = None,
    path_version_id: uuid.UUID | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: CurrentUser = Depends(require_admin),
    s: AsyncSession = Depends(get_session),
):
    return await svc.list_permissions(
        s, instructor_id=instructor_id, version_id=path_version_id, limit=limit, offset=offset
    )


@router.post("", status_code=201, response_model=svc.PermissionOut)
async def grant(data: PermissionIn, a: CurrentUser = Depends(require_admin), s: AsyncSession = Depends(get_session)):
    return await svc.grant(s, a.user, data.instructor_id, data.path_version_id, data.stage_id)


@router.delete("/{permission_id}", status_code=204)
async def revoke(
    permission_id: uuid.UUID, a: CurrentUser = Depends(require_admin), s: AsyncSession = Depends(get_session)
) -> None:
    await svc.revoke(s, a.user, permission_id)
