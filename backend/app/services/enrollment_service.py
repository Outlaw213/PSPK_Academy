"""Enrollments (FR-ADM-03, BR-12, BR-15, BR-29, Q-45)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.models import Enrollment, LearningPath, PathVersion, Stage, Submission, Task, User, UserRole
from app.models.enums import OPEN_SUBMISSION_STATUSES
from app.schemas.enrollment import EnrollmentOut, EnrollmentPage, PathRef, Progress, UserRef
from app.services import audit_service, task_service


def not_found() -> AppError:
    return AppError("NOT_FOUND", "Not found.", 404)


def already_enrolled() -> AppError:
    return AppError("ALREADY_ENROLLED", "The participant is already enrolled in this learning path.", 409)


async def to_out(session: AsyncSession, e: Enrollment) -> EnrollmentOut:
    version = await session.get(PathVersion, e.path_version_id)
    path = await session.get(LearningPath, e.learning_path_id)
    user = await session.get(User, e.user_id)
    state = await task_service.compute_path_statuses(session, e)
    return EnrollmentOut(
        id=e.id,
        status=e.status,
        path_version_id=e.path_version_id,
        path=PathRef(id=path.id, name=path.name, version=version.version_number),
        user=UserRef(id=user.id, email=user.email, first_name=user.first_name, last_name=user.last_name),
        enrolled_at=e.enrolled_at,
        completed_at=e.completed_at,
        cancelled_at=e.cancelled_at,
        progress=Progress(completed=state.completed, total=state.total),
    )


async def enroll(
    session: AsyncSession, actor: User, user_id: uuid.UUID, version_id: uuid.UUID
) -> tuple[Enrollment, bool]:
    """Returns (enrollment, created). A cancelled enrollment in the same version is reactivated (Q-45)."""
    user = await session.get(User, user_id)
    version = await session.get(PathVersion, version_id)
    if user is None or version is None:
        raise not_found()
    is_participant = await session.scalar(
        select(func.count()).select_from(UserRole).where(UserRole.user_id == user.id, UserRole.role == "PARTICIPANT")
    )
    if not is_participant:
        raise AppError("USER_NOT_PARTICIPANT", "Only users with the participant role can be enrolled.", 422)
    if not version.is_active:
        raise AppError("PATH_VERSION_INACTIVE", "This version does not accept new enrollments.", 409)

    existing = (
        await session.execute(
            select(Enrollment)
            .where(Enrollment.user_id == user.id, Enrollment.path_version_id == version.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if existing is not None and existing.status != "CANCELLED":
        raise already_enrolled()

    if existing is not None:
        existing.status, existing.cancelled_at = "ACTIVE", None
        enrollment, created = existing, False
    else:
        enrollment = Enrollment(
            user_id=user.id, path_version_id=version.id, learning_path_id=version.learning_path_id, status="ACTIVE"
        )
        session.add(enrollment)
        created = True
    try:
        await session.flush()  # the partial unique index enforces one ACTIVE enrollment per path (BR-12)
    except IntegrityError as exc:
        await session.rollback()
        raise already_enrolled() from exc
    audit_service.record(
        session,
        actor.id,
        "PATH_ASSIGNED",
        "enrollment",
        enrollment.id,
        {"user_id": str(user.id), "reactivated": not created},
    )
    await session.commit()
    await session.refresh(enrollment)
    return enrollment, created


async def cancel(session: AsyncSession, actor: User, enrollment_id: uuid.UUID) -> Enrollment:
    e = await session.get(Enrollment, enrollment_id, with_for_update=True)
    if e is None:
        raise not_found()
    if e.status != "ACTIVE":
        raise AppError("INVALID_STATE_TRANSITION", "Only an active enrollment can be cancelled.", 409)
    now = datetime.now(UTC)
    e.status, e.cancelled_at = "CANCELLED", now
    # BR-29: open attempts of this enrollment end; history stays read-only.
    version_tasks = (
        select(Task.id).join(Stage, Stage.id == Task.stage_id).where(Stage.path_version_id == e.path_version_id)
    )
    await session.execute(
        update(Submission)
        .where(
            Submission.user_id == e.user_id,
            Submission.task_id.in_(version_tasks),
            Submission.status.in_(OPEN_SUBMISSION_STATUSES),
        )
        .values(status="CANCELLED", cancelled_at=now)
    )
    audit_service.record(session, actor.id, "ENROLLMENT_CANCELLED", "enrollment", e.id)
    await session.commit()
    await session.refresh(e)
    return e


async def list_enrollments(
    session: AsyncSession,
    *,
    path_version_id: uuid.UUID | None,
    user_id: uuid.UUID | None,
    status: str | None,
    limit: int,
    offset: int,
) -> EnrollmentPage:
    stmt = select(Enrollment)
    if path_version_id:
        stmt = stmt.where(Enrollment.path_version_id == path_version_id)
    if user_id:
        stmt = stmt.where(Enrollment.user_id == user_id)
    if status:
        stmt = stmt.where(Enrollment.status == status)
    total = await session.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (
        (await session.execute(stmt.order_by(Enrollment.enrolled_at.desc()).limit(limit).offset(offset)))
        .scalars()
        .all()
    )
    return EnrollmentPage(items=[await to_out(session, e) for e in rows], total=total or 0, limit=limit, offset=offset)


async def refresh_completion(session: AsyncSession, enrollment: Enrollment, actor_id: uuid.UUID | None) -> bool:
    """BR-15: ACTIVE → COMPLETED once every active task is PASSED. Never reversed (Q-42). Caller commits."""
    if enrollment.status != "ACTIVE":
        return False
    state = await task_service.compute_path_statuses(session, enrollment)
    if state.total == 0 or state.completed < state.total:
        return False
    enrollment.status, enrollment.completed_at = "COMPLETED", datetime.now(UTC)
    audit_service.record(session, actor_id, "ENROLLMENT_COMPLETED", "enrollment", enrollment.id)
    return True


async def refresh_completion_for_version(
    session: AsyncSession, version_id: uuid.UUID, actor_id: uuid.UUID | None
) -> None:
    active = (
        (
            await session.execute(
                select(Enrollment)
                .where(Enrollment.path_version_id == version_id, Enrollment.status == "ACTIVE")
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    for e in active:
        await refresh_completion(session, e, actor_id)
