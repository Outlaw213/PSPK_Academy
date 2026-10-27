"""Instructor endpoints (docs/api.md, section Instruktor)."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies.auth import CurrentUser, require_instructor, require_role
from app.schemas.instructor import QueueItem, QueueStatus, ReviewDetail
from app.schemas.submission import SubmissionOut
from app.services import instructor_service as svc
from app.services import submission_service

router = APIRouter(tags=["instructor"])
Instructor = Depends(require_instructor)
Session = Depends(get_session)
InstructorOrAdmin = Depends(require_role("INSTRUCTOR", "ADMIN"))


@router.get("/instructor/submissions", response_model=list[QueueItem], summary="Kolejka ocen")
async def queue(
    status: QueueStatus | None = None,
    path_version_id: uuid.UUID | None = None,
    i: CurrentUser = Instructor,
    s: AsyncSession = Session,
):
    return await svc.queue(s, i.user, status=status, path_version_id=path_version_id)


@router.get("/instructor/submissions/{submission_id}", response_model=ReviewDetail)
async def detail(submission_id: uuid.UUID, i: CurrentUser = Instructor, s: AsyncSession = Session):
    return await svc.detail(s, i.user, submission_id)


@router.post("/submissions/{submission_id}/claim", response_model=SubmissionOut, summary="Przejmij do oceny")
async def claim(submission_id: uuid.UUID, i: CurrentUser = Instructor, s: AsyncSession = Session):
    return await submission_service.to_out(s, await svc.claim(s, i.user, submission_id))


@router.post("/submissions/{submission_id}/release", response_model=SubmissionOut, summary="Zwolnij zgłoszenie")
async def release(submission_id: uuid.UUID, u: CurrentUser = InstructorOrAdmin, s: AsyncSession = Session):
    return await submission_service.to_out(s, await svc.release(s, u.user, u.roles, submission_id))
