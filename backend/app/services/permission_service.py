"""Instructor permissions (FR-ADM-04) and the single rule of who may assess what (BR-24, BR-25, BR-27)."""

import uuid
from dataclasses import dataclass
from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.models import (
    InstructorPathPermission,
    InstructorStagePermission,
    LearningPath,
    PathVersion,
    Stage,
    Submission,
    Task,
    User,
    UserRole,
)
from app.services import audit_service


@dataclass
class Scope:
    """Union of an instructor's permissions (BR-24)."""

    version_ids: set[uuid.UUID]
    stage_ids: set[uuid.UUID]

    def covers(self, stage: Stage) -> bool:
        return stage.id in self.stage_ids or stage.path_version_id in self.version_ids


async def instructor_scope(session: AsyncSession, instructor_id: uuid.UUID) -> Scope:
    versions = (
        await session.execute(
            select(InstructorPathPermission.path_version_id).where(
                InstructorPathPermission.instructor_id == instructor_id
            )
        )
    ).scalars()
    stages = (
        await session.execute(
            select(InstructorStagePermission.stage_id).where(InstructorStagePermission.instructor_id == instructor_id)
        )
    ).scalars()
    return Scope(set(versions), set(stages))


def scope_filter(scope: Scope):
    """SQL condition on a query joined with Stage: the stage is within the scope."""
    return or_(Stage.id.in_(scope.stage_ids), Stage.path_version_id.in_(scope.version_ids))


async def has_instructor_role(session: AsyncSession, user_id: uuid.UUID) -> bool:
    n = await session.scalar(
        select(func.count()).select_from(UserRole).where(UserRole.user_id == user_id, UserRole.role == "INSTRUCTOR")
    )
    return bool(n)


async def stage_of_submission(session: AsyncSession, sub: Submission) -> Stage:
    task = await session.get(Task, sub.task_id)
    return await session.get(Stage, task.stage_id)


async def check_can_assess(session: AsyncSession, instructor_id: uuid.UUID, sub: Submission) -> None:
    """The one place deciding whether an instructor may claim or assess (BR-06, BR-07, BR-24, BR-25, BR-27)."""
    if not await has_instructor_role(session, instructor_id):
        raise AppError("FORBIDDEN", "You do not have access to this resource.", 403)
    if sub.user_id == instructor_id:
        raise AppError("SELF_ASSESSMENT_FORBIDDEN", "You cannot assess your own submission.", 403)
    scope = await instructor_scope(session, instructor_id)
    if not scope.covers(await stage_of_submission(session, sub)):
        raise AppError("INSTRUCTOR_NOT_AUTHORIZED", "You have no permission for this path or stage.", 403)


async def can_view(session: AsyncSession, instructor_id: uuid.UUID, sub: Submission) -> bool:
    try:
        await check_can_assess(session, instructor_id, sub)
    except AppError:
        return False
    return True


async def release_submissions(
    session: AsyncSession, submission_ids: list[uuid.UUID], actor_id: uuid.UUID | None, reason: str
) -> None:
    """Back to the queue: UNDER_REVIEW → SUBMITTED, instructor detached (BR-26). Caller commits."""
    if not submission_ids:
        return
    released = (
        await session.execute(
            update(Submission)
            .where(Submission.id.in_(submission_ids), Submission.status == "UNDER_REVIEW")
            .values(status="SUBMITTED", instructor_id=None, claimed_at=None)
            .returning(Submission.id, Submission.instructor_id)
        )
    ).all()
    for sub_id, _ in released:
        audit_service.record(session, actor_id, "SUBMISSION_RELEASED", "submission", sub_id, {"reason": reason})


# --- admin management ------------------------------------------------------------------------


class PermissionOut(BaseModel):
    id: uuid.UUID
    scope: str  # PATH_VERSION | STAGE
    instructor: dict
    path: dict
    stage: dict | None
    created_at: datetime


class PermissionPage(BaseModel):
    items: list[PermissionOut]
    total: int
    limit: int
    offset: int


async def _out(session: AsyncSession, perm, scope: str) -> PermissionOut:
    instr = await session.get(User, perm.instructor_id)
    stage = await session.get(Stage, perm.stage_id) if scope == "STAGE" else None
    version = await session.get(PathVersion, stage.path_version_id if stage else perm.path_version_id)
    path = await session.get(LearningPath, version.learning_path_id)
    return PermissionOut(
        id=perm.id,
        scope=scope,
        instructor={"id": instr.id, "email": instr.email, "first_name": instr.first_name, "last_name": instr.last_name},
        path={"id": path.id, "name": path.name, "version": version.version_number, "path_version_id": version.id},
        stage={"id": stage.id, "name": stage.name, "position": stage.position} if stage else None,
        created_at=perm.created_at,
    )


async def grant(
    session: AsyncSession,
    actor: User,
    instructor_id: uuid.UUID,
    version_id: uuid.UUID | None,
    stage_id: uuid.UUID | None,
) -> PermissionOut:
    if (version_id is None) == (stage_id is None):
        raise AppError("VALIDATION_ERROR", "Give exactly one of path_version_id or stage_id.", 422)
    instructor = await session.get(User, instructor_id)
    if instructor is None:
        raise AppError("NOT_FOUND", "Not found.", 404)
    if not await has_instructor_role(session, instructor.id):
        raise AppError("USER_NOT_INSTRUCTOR", "Permissions can only be granted to instructors.", 422)
    if version_id:
        if await session.get(PathVersion, version_id) is None:
            raise AppError("NOT_FOUND", "Not found.", 404)
        model, scope, col, target = (
            InstructorPathPermission,
            "PATH_VERSION",
            InstructorPathPermission.path_version_id,
            version_id,
        )
        perm = InstructorPathPermission(instructor_id=instructor.id, path_version_id=version_id)
    else:
        if await session.get(Stage, stage_id) is None:
            raise AppError("NOT_FOUND", "Not found.", 404)
        model, scope, col, target = InstructorStagePermission, "STAGE", InstructorStagePermission.stage_id, stage_id
        perm = InstructorStagePermission(instructor_id=instructor.id, stage_id=stage_id)
    exists = await session.scalar(
        select(func.count()).select_from(model).where(model.instructor_id == instructor.id, col == target)
    )
    if exists:
        raise AppError("PERMISSION_EXISTS", "This permission already exists.", 409)
    session.add(perm)
    await session.flush()
    audit_service.record(
        session,
        actor.id,
        "PERMISSION_GRANTED",
        "instructor_permission",
        perm.id,
        {"scope": scope, "target": str(target)},
    )
    await session.commit()
    await session.refresh(perm)
    return await _out(session, perm, scope)


async def list_permissions(
    session: AsyncSession, *, instructor_id: uuid.UUID | None, version_id: uuid.UUID | None, limit: int, offset: int
) -> PermissionPage:
    paths = select(InstructorPathPermission)
    stages = select(InstructorStagePermission).join(Stage, Stage.id == InstructorStagePermission.stage_id)
    if instructor_id:
        paths = paths.where(InstructorPathPermission.instructor_id == instructor_id)
        stages = stages.where(InstructorStagePermission.instructor_id == instructor_id)
    if version_id:
        paths = paths.where(InstructorPathPermission.path_version_id == version_id)
        stages = stages.where(Stage.path_version_id == version_id)
    rows = [(p, "PATH_VERSION") for p in (await session.execute(paths)).scalars()] + [
        (p, "STAGE") for p in (await session.execute(stages)).scalars()
    ]
    rows.sort(key=lambda r: r[0].created_at)
    page = rows[offset : offset + limit]
    return PermissionPage(
        items=[await _out(session, p, s) for p, s in page], total=len(rows), limit=limit, offset=offset
    )


async def revoke(session: AsyncSession, actor: User, permission_id: uuid.UUID) -> None:
    perm = await session.get(InstructorPathPermission, permission_id) or await session.get(
        InstructorStagePermission, permission_id
    )
    if perm is None:
        raise AppError("NOT_FOUND", "Not found.", 404)
    instructor_id = perm.instructor_id
    await session.delete(perm)  # configuration, not history: the row goes, the audit log keeps the trace
    await session.flush()
    # BR-26: claims that fell out of the remaining scope go back to the queue.
    scope = await instructor_scope(session, instructor_id)
    claimed = (
        (
            await session.execute(
                select(Submission.id)
                .join(Task, Task.id == Submission.task_id)
                .join(Stage, Stage.id == Task.stage_id)
                .where(
                    Submission.instructor_id == instructor_id, Submission.status == "UNDER_REVIEW", ~scope_filter(scope)
                )
            )
        )
        .scalars()
        .all()
    )
    await release_submissions(session, list(claimed), actor.id, "permission revoked")
    audit_service.record(
        session,
        actor.id,
        "PERMISSION_REVOKED",
        "instructor_permission",
        permission_id,
        {"instructor_id": str(instructor_id)},
    )
    await session.commit()
