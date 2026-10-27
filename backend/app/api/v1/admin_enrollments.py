import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies.auth import CurrentUser, require_admin
from app.schemas.enrollment import EnrollmentIn, EnrollmentOut, EnrollmentPage
from app.services import enrollment_service as svc

router = APIRouter(prefix="/admin/enrollments", tags=["admin: enrollments"])


@router.get("", response_model=EnrollmentPage)
async def list_enrollments(
    path_version_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    status: Literal["ACTIVE", "COMPLETED", "CANCELLED"] | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: CurrentUser = Depends(require_admin),
    s: AsyncSession = Depends(get_session),
):
    return await svc.list_enrollments(
        s, path_version_id=path_version_id, user_id=user_id, status=status, limit=limit, offset=offset
    )


@router.post(
    "",
    status_code=201,
    response_model=EnrollmentOut,
    responses={200: {"description": "Cancelled enrollment reactivated (Q-45)"}},
)
async def enroll(
    data: EnrollmentIn,
    response: Response,
    a: CurrentUser = Depends(require_admin),
    s: AsyncSession = Depends(get_session),
):
    enrollment, created = await svc.enroll(s, a.user, data.user_id, data.path_version_id)
    if not created:
        response.status_code = 200
    return await svc.to_out(s, enrollment)


@router.post("/{enrollment_id}/cancel", response_model=EnrollmentOut)
async def cancel(
    enrollment_id: uuid.UUID, a: CurrentUser = Depends(require_admin), s: AsyncSession = Depends(get_session)
):
    return await svc.to_out(s, await svc.cancel(s, a.user, enrollment_id))
