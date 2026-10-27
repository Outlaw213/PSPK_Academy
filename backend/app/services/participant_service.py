"""What a participant sees of their paths and tasks (FR-PAR-01, FR-PAR-02). Statuses: task_service only."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.models import Enrollment, LearningPath, PathVersion, Stage, Submission, Task, User
from app.schemas.enrollment import PathRef
from app.schemas.participant import (
    MyPath,
    PathProgress,
    PathStructure,
    Progress,
    PublicRevision,
    StageItem,
    StageProgress,
    StageRef,
    TaskDetail,
    TaskItem,
    TaskItemWithStatus,
)
from app.schemas.submission import MySubmission, MySubmissionPage
from app.services import content_service, instructor_service, task_service


def not_found() -> AppError:
    # BR-17: anything outside the user's own enrollments simply does not exist for them.
    return AppError("NOT_FOUND", "Not found.", 404)


async def _path_ref(session: AsyncSession, version_id: uuid.UUID) -> PathRef:
    version = await session.get(PathVersion, version_id)
    path = await session.get(LearningPath, version.learning_path_id)
    return PathRef(id=path.id, name=path.name, version=version.version_number)


async def _enrollment(session: AsyncSession, user: User, version_id: uuid.UUID) -> Enrollment:
    e = (
        await session.execute(
            select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.path_version_id == version_id)
        )
    ).scalar_one_or_none()
    if e is None:
        raise not_found()
    return e


async def my_paths(session: AsyncSession, user: User) -> list[MyPath]:
    rows = (
        (
            await session.execute(
                select(Enrollment).where(Enrollment.user_id == user.id).order_by(Enrollment.enrolled_at)
            )
        )
        .scalars()
        .all()
    )
    out = []
    for e in rows:
        state = await task_service.compute_path_statuses(session, e)
        out.append(
            MyPath(
                id=e.id,
                status=e.status,
                path_version_id=e.path_version_id,
                path=await _path_ref(session, e.path_version_id),
                enrolled_at=e.enrolled_at,
                completed_at=e.completed_at,
                progress=Progress(completed=state.completed, total=state.total),
            )
        )
    return out


async def progress(session: AsyncSession, user: User, version_id: uuid.UUID) -> PathProgress:
    e = await _enrollment(session, user, version_id)
    state = await task_service.compute_path_statuses(session, e)
    stages = [
        StageProgress(
            id=st.stage_id,
            name=st.name,
            position=st.position,
            gate_open=st.gate_open,
            tasks=[
                TaskItemWithStatus(
                    id=t.task_id,
                    label=t.label,
                    name=t.name,
                    task_type=t.task_type,
                    position=t.position,
                    status=t.status,
                )
                for t in st.tasks
            ],
        )
        for st in state.stages
    ]
    return PathProgress(
        path=await _path_ref(session, version_id),
        enrollment_status=e.status,
        progress=Progress(completed=state.completed, total=state.total),
        stages=stages,
    )


async def structure(session: AsyncSession, user: User, version_id: uuid.UUID) -> PathStructure:
    p = await progress(session, user, version_id)
    return PathStructure(
        path=p.path,
        enrollment_status=p.enrollment_status,
        stages=[
            StageItem(
                id=s.id,
                name=s.name,
                position=s.position,
                tasks=[TaskItem(**t.model_dump(exclude={"status"})) for t in s.tasks],
            )
            for s in p.stages
        ],
    )


def _public(revision, status: str) -> PublicRevision:
    """PublicRevision has no is_correct: the quiz key never reaches the participant (BR-32).
    A locked task is readable in full, except the quiz questions (Q-68)."""
    public = PublicRevision.model_validate(revision.model_dump())
    return public.model_copy(update={"questions": []}) if status == "LOCKED" else public


async def task_detail(session: AsyncSession, user: User, task_id: uuid.UUID) -> TaskDetail:
    task = await session.get(Task, task_id)
    if task is None or not task.is_active:
        raise not_found()
    stage = await session.get(Stage, task.stage_id)
    e = await _enrollment(session, user, stage.path_version_id)
    t = (await task_service.compute_path_statuses(session, e)).task(task.id)
    revision = (await content_service.load_revisions(session, [t.visible_revision_id]))[t.visible_revision_id]
    return TaskDetail(
        id=task.id,
        label=t.label,
        stage=StageRef(id=stage.id, name=stage.name, position=stage.position),
        status=t.status,
        revision=_public(revision, t.status),
    )


async def my_submissions(session: AsyncSession, user: User, limit: int, offset: int) -> MySubmissionPage:
    """FR-PAR-08: every own attempt, from every enrollment, newest first; nothing is hidden (BR-04, BR-20)."""
    stmt = select(Submission).where(Submission.user_id == user.id)
    total = await session.scalar(select(func.count()).select_from(stmt.subquery()))
    subs = (
        (await session.execute(stmt.order_by(Submission.created_at.desc()).limit(limit).offset(offset))).scalars().all()
    )
    stage_ids = set(
        (await session.execute(select(Task.stage_id).where(Task.id.in_([s.task_id for s in subs])))).scalars()
    )
    labels = await instructor_service._labels(session, stage_ids)
    items = []
    for sub in subs:
        q = await instructor_service._item(session, sub, labels)  # same shape as the instructor queue item
        items.append(MySubmission(submission=q.submission, task=q.task, stage=q.stage, path=q.path))
    return MySubmissionPage(items=items, total=total or 0, limit=limit, offset=offset)
