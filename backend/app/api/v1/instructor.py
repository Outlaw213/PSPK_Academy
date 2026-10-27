"""Instructor endpoints (docs/api.md, section Instruktor)."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies.auth import CurrentUser, require_instructor, require_role
from app.schemas.instructor import CourseItem, CourseParticipant, QueueItem, QueueStatus, ReviewDetail
from app.schemas.submission import AssessedOut, AssessmentIn, CourseResultIn, SubmissionOut
from app.services import assessment_service, submission_service
from app.services import instructor_service as svc

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


@router.post(
    "/submissions/{submission_id}/assessment", response_model=AssessedOut, status_code=201, summary="Oceń zgłoszenie"
)
async def assess(submission_id: uuid.UUID, body: AssessmentIn, i: CurrentUser = Instructor, s: AsyncSession = Session):
    sub = await assessment_service.assess(s, i.user, submission_id, body.result, body.comment)
    return AssessedOut(submission=await submission_service.to_out(s, sub))


@router.get("/instructor/courses", response_model=list[CourseItem], summary="Kursy w moim zakresie")
async def courses(path_version_id: uuid.UUID | None = None, i: CurrentUser = Instructor, s: AsyncSession = Session):
    return await svc.courses(s, i.user, path_version_id)


@router.get("/instructor/courses/{task_id}/participants", response_model=list[CourseParticipant])
async def course_participants(task_id: uuid.UUID, i: CurrentUser = Instructor, s: AsyncSession = Session):
    return await svc.course_participants(s, i.user, task_id)


@router.post(
    "/instructor/courses/{task_id}/results", response_model=AssessedOut, status_code=201, summary="Wpisz wynik kursu"
)
async def course_result(
    task_id: uuid.UUID, body: CourseResultIn, i: CurrentUser = Instructor, s: AsyncSession = Session
):
    sub = await assessment_service.record_course_result(s, i.user, task_id, body.user_id, body.result, body.comment)
    return AssessedOut(submission=await submission_service.to_out(s, sub))
