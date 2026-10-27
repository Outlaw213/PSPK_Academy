"""Admin read-only views (docs/api.md, section Admin: FR-ADM-05, FR-ADM-06)."""

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies.auth import CurrentUser, require_admin
from app.schemas.admin import AdminSubmissionDetail, AdminSubmissionPage, AuditPage
from app.services import admin_view_service as svc

router = APIRouter(prefix="/admin", tags=["admin: views"])
Admin = Depends(require_admin)
Session = Depends(get_session)

SubmissionStatus = Literal["DRAFT", "SUBMITTED", "UNDER_REVIEW", "PASSED", "NEEDS_IMPROVEMENT", "CANCELLED"]


@router.get("/submissions", response_model=AdminSubmissionPage, summary="Wszystkie zgłoszenia")
async def submissions(
    path_version_id: uuid.UUID | None = None,
    status: SubmissionStatus | None = None,
    user_id: uuid.UUID | None = None,
    instructor_id: uuid.UUID | None = None,
    task_id: uuid.UUID | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: CurrentUser = Admin,
    s: AsyncSession = Session,
):
    return await svc.submissions(
        s,
        path_version_id=path_version_id,
        status=status,
        user_id=user_id,
        instructor_id=instructor_id,
        task_id=task_id,
        limit=limit,
        offset=offset,
    )


@router.get("/submissions/{submission_id}", response_model=AdminSubmissionDetail)
async def submission_detail(submission_id: uuid.UUID, _: CurrentUser = Admin, s: AsyncSession = Session):
    return await svc.submission_detail(s, submission_id)


@router.get("/audit-logs", response_model=AuditPage, summary="Dziennik zdarzeń")
async def audit_logs(
    action: str | None = Query(default=None, max_length=50),
    user_id: uuid.UUID | None = None,
    entity_type: str | None = Query(default=None, max_length=50),
    entity_id: uuid.UUID | None = None,
    since: datetime | None = Query(default=None, alias="from"),
    until: datetime | None = Query(default=None, alias="to"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: CurrentUser = Admin,
    s: AsyncSession = Session,
):
    return await svc.audit_logs(
        s,
        action=action,
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
    )
