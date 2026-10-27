"""Instructor queue, details, claim, release and course lists (FR-INS-01…03, FR-INS-05, FR-INS-06, BR-06, BR-26)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.models import (
    Enrollment,
    LearningPath,
    PathVersion,
    Stage,
    Submission,
    SubmissionPhoto,
    Task,
    TaskRevision,
    User,
)
from app.schemas.instructor import CourseItem, CourseParticipant, QueueItem, ReviewDetail
from app.services import (
    assessment_service,
    audit_service,
    content_service,
    permission_service,
    submission_service,
    task_service,
)


def not_found() -> AppError:
    return AppError("NOT_FOUND", "Not found.", 404)


async def _labels(session: AsyncSession, stage_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    """Current E-labels of active tasks in these stages (BR-34), in one query."""
    rows = (
        await session.execute(
            select(Task.id, Task.stage_id, Stage.position)
            .join(Stage, Stage.id == Task.stage_id)
            .where(Task.stage_id.in_(stage_ids), Task.is_active)
            .order_by(Task.stage_id, Task.position)
        )
    ).all()
    out, counters = {}, {}
    for task_id, stage_id, stage_pos in rows:
        counters[stage_id] = counters.get(stage_id, 0) + 1
        out[task_id] = task_service.task_label(stage_pos, counters[stage_id])
    return out


async def _item(session: AsyncSession, sub: Submission, labels: dict[uuid.UUID, str]) -> QueueItem:
    task = await session.get(Task, sub.task_id)
    stage = await session.get(Stage, task.stage_id)
    version = await session.get(PathVersion, stage.path_version_id)
    path = await session.get(LearningPath, version.learning_path_id)
    participant = await session.get(User, sub.user_id)
    rev = (
        await session.get(TaskRevision, sub.task_revision_id)
        if sub.task_revision_id
        else await submission_service.current_revision(session, task.id)
    )
    photos = await session.scalar(
        select(func.count()).select_from(SubmissionPhoto).where(SubmissionPhoto.submission_id == sub.id)
    )
    return QueueItem(
        submission=await submission_service.to_out(session, sub),
        participant={"id": participant.id, "first_name": participant.first_name, "last_name": participant.last_name},
        task={"id": task.id, "label": labels.get(task.id), "name": rev.name, "task_type": rev.task_type},
        stage={"id": stage.id, "name": stage.name, "position": stage.position},
        path={"id": path.id, "name": path.name, "version": version.version_number},
        photo_count=photos,
    )


async def queue(
    session: AsyncSession, instructor: User, *, status: str | None, path_version_id: uuid.UUID | None
) -> list[QueueItem]:
    """FR-INS-01: SUBMITTED in scope (never own) plus the ones I claimed; oldest first."""
    scope = await permission_service.instructor_scope(session, instructor.id)
    mine = and_(Submission.status == "UNDER_REVIEW", Submission.instructor_id == instructor.id)
    stmt = (
        select(Submission)
        .join(Task, Task.id == Submission.task_id)
        .join(Stage, Stage.id == Task.stage_id)
        .where(
            Submission.user_id != instructor.id,
            or_(and_(Submission.status == "SUBMITTED", permission_service.scope_filter(scope)), mine),
        )
        .order_by(Submission.submitted_at)
    )
    if status:
        stmt = stmt.where(Submission.status == status)
    if path_version_id:
        stmt = stmt.where(Stage.path_version_id == path_version_id)
    subs = (await session.execute(stmt)).scalars().all()
    stage_ids = {
        s
        for s in (await session.execute(select(Task.stage_id).where(Task.id.in_([x.task_id for x in subs])))).scalars()
    }
    labels = await _labels(session, stage_ids)
    return [await _item(session, s, labels) for s in subs]


async def _visible(session: AsyncSession, instructor: User, submission_id: uuid.UUID) -> Submission:
    sub = await session.get(Submission, submission_id)
    if sub is None or sub.status in ("DRAFT",) or not await permission_service.can_view(session, instructor.id, sub):
        raise not_found()
    return sub


async def detail(session: AsyncSession, instructor: User, submission_id: uuid.UUID) -> ReviewDetail:
    """FR-INS-02: the attempt, the revision it was sent against (with criteria) and earlier attempts."""
    sub = await _visible(session, instructor, submission_id)
    task = await session.get(Task, sub.task_id)
    labels = await _labels(session, {task.stage_id})
    item = await _item(session, sub, labels)
    rev_id = sub.task_revision_id or (await submission_service.current_revision(session, task.id)).id
    revision = (await content_service.load_revisions(session, [rev_id]))[rev_id]
    previous = (
        (
            await session.execute(
                select(Submission)
                .where(
                    Submission.task_id == sub.task_id,
                    Submission.user_id == sub.user_id,
                    Submission.attempt_number < sub.attempt_number,
                    Submission.status != "DRAFT",
                )
                .order_by(Submission.attempt_number.desc())
            )
        )
        .scalars()
        .all()
    )
    return ReviewDetail(
        **item.model_dump(),
        revision=revision,
        previous_attempts=[await submission_service.to_out(session, p) for p in previous],
    )


async def claim(session: AsyncSession, instructor: User, submission_id: uuid.UUID) -> Submission:
    """Spec §11: atomic. The conditional UPDATE lets exactly one of concurrent requests win (BR-06, §25)."""
    sub = await session.get(Submission, submission_id)
    if sub is None:
        raise not_found()
    await permission_service.check_can_assess(session, instructor.id, sub)
    now = datetime.now(UTC)
    won = await session.scalar(
        update(Submission)
        .where(Submission.id == sub.id, Submission.status == "SUBMITTED", Submission.instructor_id.is_(None))
        .values(status="UNDER_REVIEW", instructor_id=instructor.id, claimed_at=now)
        .returning(Submission.id)
    )
    if won is None:
        await session.rollback()
        current = await session.get(Submission, submission_id)
        if current.status == "UNDER_REVIEW":
            raise AppError(
                "SUBMISSION_ALREADY_CLAIMED", "Another instructor is already reviewing this submission.", 409
            )
        raise AppError("INVALID_STATE_TRANSITION", "Only a submitted attempt can be claimed.", 409)
    audit_service.record(session, instructor.id, "SUBMISSION_CLAIMED", "submission", sub.id)
    await session.commit()
    await session.refresh(sub)
    return sub


async def release(
    session: AsyncSession, actor: User, actor_roles: frozenset[str], submission_id: uuid.UUID
) -> Submission:
    """FR-INS-05, BR-26: the assigned instructor or an ADMIN puts the attempt back into the queue."""
    sub = await session.get(Submission, submission_id, with_for_update=True)
    if sub is None:
        raise not_found()
    is_admin = "ADMIN" in actor_roles
    if not is_admin and not await permission_service.can_view(session, actor.id, sub) and sub.instructor_id != actor.id:
        raise not_found()
    if sub.status != "UNDER_REVIEW":
        raise AppError("INVALID_STATE_TRANSITION", "Only a claimed submission can be released.", 409)
    if not is_admin and sub.instructor_id != actor.id:
        raise AppError("NOT_ASSIGNED_INSTRUCTOR", "Only the assigned instructor can release this submission.", 403)
    await permission_service.release_submissions(session, [sub.id], actor.id, "manual")
    await session.commit()
    await session.refresh(sub)
    return sub


# --- courses (FR-INS-06) ----------------------------------------------------------------------


async def courses(session: AsyncSession, instructor: User, path_version_id: uuid.UUID | None) -> list[CourseItem]:
    """Active COURSE tasks (type from the current revision) in the instructor's scope."""
    scope = await permission_service.instructor_scope(session, instructor.id)
    latest = (
        select(TaskRevision.task_id, func.max(TaskRevision.revision_number).label("n"))
        .group_by(TaskRevision.task_id)
        .subquery()
    )
    stmt = (
        select(Task, Stage, TaskRevision.name)
        .join(Stage, Stage.id == Task.stage_id)
        .join(latest, latest.c.task_id == Task.id)
        .join(
            TaskRevision,
            (TaskRevision.task_id == Task.id) & (TaskRevision.revision_number == latest.c.n),
        )
        .where(Task.is_active, TaskRevision.task_type == "COURSE", permission_service.scope_filter(scope))
        .order_by(Stage.path_version_id, Stage.position, Task.position)
    )
    if path_version_id:
        stmt = stmt.where(Stage.path_version_id == path_version_id)
    rows = (await session.execute(stmt)).all()
    labels = await _labels(session, {stage.id for _, stage, _ in rows})
    out = []
    for task, stage, name in rows:
        version = await session.get(PathVersion, stage.path_version_id)
        path = await session.get(LearningPath, version.learning_path_id)
        active = select(Enrollment.user_id).where(
            Enrollment.path_version_id == version.id, Enrollment.status == "ACTIVE"
        )
        enrolled = await session.scalar(select(func.count()).select_from(active.subquery()))
        passed = await session.scalar(
            select(func.count())
            .select_from(Submission)
            .where(Submission.task_id == task.id, Submission.status == "PASSED", Submission.user_id.in_(active))
        )
        out.append(
            CourseItem(
                task={"id": task.id, "label": labels.get(task.id), "name": name},
                stage={"id": stage.id, "name": stage.name, "position": stage.position},
                path={"id": path.id, "name": path.name, "version": version.version_number},
                enrolled=enrolled,
                passed=passed,
            )
        )
    return out


async def course_participants(session: AsyncSession, instructor: User, task_id: uuid.UUID) -> list[CourseParticipant]:
    """Participants with an active enrollment in the course's version and their status of it."""
    task, stage = await assessment_service.course_task(session, task_id)
    if not (await permission_service.instructor_scope(session, instructor.id)).covers(stage):
        raise permission_service.not_authorized()
    enrollments = (
        await session.execute(
            select(Enrollment, User)
            .join(User, User.id == Enrollment.user_id)
            .where(
                Enrollment.path_version_id == stage.path_version_id,
                Enrollment.status == "ACTIVE",
                Enrollment.user_id != instructor.id,  # BR-25
            )
            .order_by(User.last_name, User.first_name)
        )
    ).all()
    out = []
    for e, u in enrollments:
        state = await task_service.compute_path_statuses(session, e)
        attempts = await session.scalar(
            select(func.count())
            .select_from(Submission)
            .where(Submission.task_id == task.id, Submission.user_id == u.id, Submission.status != "CANCELLED")
        )
        out.append(
            CourseParticipant(
                participant={"id": u.id, "first_name": u.first_name, "last_name": u.last_name},
                enrollment_id=e.id,
                status=state.task(task.id).status,
                attempts=attempts,
            )
        )
    return out
