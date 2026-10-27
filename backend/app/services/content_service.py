"""Learning content managed by admins (FR-ADM-02): paths, versions, stages, tasks and revisions.

Task content is never updated in place: every change inserts a new revision (BR-19, ADR-14).
Positions are unique per parent but DEFERRABLE, so reorders run inside one transaction (ADR-15).
"""

import uuid
from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.models import (
    InstructorPathPermission,
    InstructorStagePermission,
    LearningPath,
    PathVersion,
    QuizOption,
    QuizQuestion,
    Stage,
    Submission,
    Task,
    TaskRevision,
    TaskRevisionAttachment,
    User,
)
from app.schemas.content import (
    OptionOut,
    PathDetail,
    PathIn,
    PathOut,
    PathPage,
    QuestionOut,
    RevisionOut,
    StageDetail,
    StageIn,
    StageOut,
    StageUpdate,
    TaskContent,
    TaskCreate,
    TaskOut,
    VersionDetail,
    VersionIn,
    VersionOut,
    VersionUpdate,
    VideoLinkOut,
)
from app.services import audit_service

# Revision columns copied from TaskContent one to one.
CONTENT_FIELDS = (
    "name",
    "task_type",
    "description",
    "instructions",
    "content_md",
    "assignment",
    "evaluation_criteria",
    "submission_requirements",
    "material",
    "quantity_description",
    "expected_duration_days",
    "estimated_minutes",
    "difficulty",
    "pass_threshold",
)


def not_found() -> AppError:
    return AppError("NOT_FOUND", "Not found.", 404)


def task_label(stage_position: int, active_index: int) -> str:
    """BR-34: E{stage}.{n}, n counting active tasks of the stage in order. The only place labels are made."""
    return f"E{stage_position}.{active_index}"


async def _get(session: AsyncSession, model, obj_id: uuid.UUID, lock: bool = False):
    obj = await session.get(model, obj_id, with_for_update=lock)
    if obj is None:
        raise not_found()
    return obj


async def _defer_positions(session: AsyncSession) -> None:
    await session.execute(text("SET CONSTRAINTS ALL DEFERRED"))


# --- paths and versions ------------------------------------------------------------------------


def path_out(p: LearningPath) -> PathOut:
    return PathOut(id=p.id, name=p.name, description=p.description, is_active=p.is_active, created_at=p.created_at)


def version_out(v: PathVersion) -> VersionOut:
    return VersionOut(
        id=v.id,
        learning_path_id=v.learning_path_id,
        version_number=v.version_number,
        description=v.description,
        is_active=v.is_active,
        copied_from_version_id=v.copied_from_version_id,
        created_at=v.created_at,
    )


async def create_path(session: AsyncSession, actor: User, data: PathIn) -> PathOut:
    path = LearningPath(name=data.name, description=data.description)
    session.add(path)
    await session.flush()
    audit_service.record(session, actor.id, "PATH_CREATED", "learning_path", path.id, {"name": data.name})
    await session.commit()
    await session.refresh(path)
    return path_out(path)


async def list_paths(session: AsyncSession, limit: int, offset: int) -> PathPage:
    total = await session.scalar(select(func.count()).select_from(LearningPath))
    rows = (
        await session.execute(select(LearningPath).order_by(LearningPath.name).limit(limit).offset(offset))
    ).scalars()
    return PathPage(items=[path_out(p) for p in rows], total=total or 0, limit=limit, offset=offset)


async def path_detail(session: AsyncSession, path_id: uuid.UUID) -> PathDetail:
    path = await _get(session, LearningPath, path_id)
    versions = (
        await session.execute(
            select(PathVersion).where(PathVersion.learning_path_id == path_id).order_by(PathVersion.version_number)
        )
    ).scalars()
    return PathDetail(**path_out(path).model_dump(), versions=[version_out(v) for v in versions])


async def create_version(session: AsyncSession, actor: User, path_id: uuid.UUID, data: VersionIn) -> VersionOut:
    path = await _get(session, LearningPath, path_id, lock=True)  # serialises version numbering per path
    source = None
    if data.copy_from_version_id:
        source = await _get(session, PathVersion, data.copy_from_version_id)
        if source.learning_path_id != path.id:
            raise AppError("VALIDATION_ERROR", "The source version belongs to another learning path.", 422)
    number = (
        await session.scalar(
            select(func.max(PathVersion.version_number)).where(PathVersion.learning_path_id == path.id)
        )
    ) or 0
    version = PathVersion(
        learning_path_id=path.id,
        version_number=number + 1,
        description=data.description,
        is_active=False,  # a new version accepts enrollments only when the admin opens it
        copied_from_version_id=source.id if source else None,
    )
    session.add(version)
    await session.flush()
    if source:
        await _copy_structure(session, actor, source, version)
    audit_service.record(
        session,
        actor.id,
        "PATH_VERSION_CREATED",
        "path_version",
        version.id,
        {"version_number": version.version_number, "copied_from": str(source.id) if source else None},
    )
    await session.commit()
    await session.refresh(version)
    return version_out(version)


async def _copy_structure(session: AsyncSession, actor: User, source: PathVersion, target: PathVersion) -> None:
    """Q-07, BR-24: stages, tasks with their current content, and instructor permissions."""
    stage_map: dict[uuid.UUID, uuid.UUID] = {}
    stages = (
        (await session.execute(select(Stage).where(Stage.path_version_id == source.id).order_by(Stage.position)))
        .scalars()
        .all()
    )
    for st in stages:
        new_stage = Stage(path_version_id=target.id, name=st.name, description=st.description, position=st.position)
        session.add(new_stage)
        await session.flush()
        stage_map[st.id] = new_stage.id
        tasks = (
            (await session.execute(select(Task).where(Task.stage_id == st.id).order_by(Task.position))).scalars().all()
        )
        for t in tasks:
            new_task = Task(stage_id=new_stage.id, position=t.position, is_active=t.is_active)
            session.add(new_task)
            await session.flush()
            current = await _current_revision(session, t.id)
            content = TaskContent.model_validate((await load_revisions(session, [current.id]))[current.id].model_dump())
            await _insert_revision(session, actor, new_task.id, 1, content)

    for perm in (
        await session.execute(
            select(InstructorPathPermission).where(InstructorPathPermission.path_version_id == source.id)
        )
    ).scalars():
        session.add(InstructorPathPermission(instructor_id=perm.instructor_id, path_version_id=target.id))
    if stage_map:
        stage_perms = select(InstructorStagePermission).where(InstructorStagePermission.stage_id.in_(stage_map))
        for perm in (await session.execute(stage_perms)).scalars():
            session.add(InstructorStagePermission(instructor_id=perm.instructor_id, stage_id=stage_map[perm.stage_id]))
    await session.flush()


async def update_version(session: AsyncSession, actor: User, version_id: uuid.UUID, data: VersionUpdate) -> VersionOut:
    version = await _get(session, PathVersion, version_id, lock=True)
    changes = data.model_dump(exclude_none=True)
    for key, value in changes.items():
        setattr(version, key, value)
    if changes:
        audit_service.record(session, actor.id, "PATH_VERSION_UPDATED", "path_version", version.id, changes)
    await session.commit()
    await session.refresh(version)
    return version_out(version)


# --- revisions ---------------------------------------------------------------------------------


async def _current_revision(session: AsyncSession, task_id: uuid.UUID) -> TaskRevision:
    """ADR-14: the current revision is the highest revision_number."""
    stmt = (
        select(TaskRevision)
        .where(TaskRevision.task_id == task_id)
        .order_by(TaskRevision.revision_number.desc())
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one()


async def load_revisions(session: AsyncSession, revision_ids: list[uuid.UUID]) -> dict[uuid.UUID, RevisionOut]:
    """Revisions with their questions, options and video links in four queries, whatever the count."""
    if not revision_ids:
        return {}
    revs = (await session.execute(select(TaskRevision).where(TaskRevision.id.in_(revision_ids)))).scalars().all()
    questions = (
        (
            await session.execute(
                select(QuizQuestion).where(QuizQuestion.revision_id.in_(revision_ids)).order_by(QuizQuestion.position)
            )
        )
        .scalars()
        .all()
    )
    options: dict[uuid.UUID, list[OptionOut]] = defaultdict(list)
    if questions:
        opt_rows = await session.execute(
            select(QuizOption)
            .where(QuizOption.question_id.in_([q.id for q in questions]))
            .order_by(QuizOption.position)
        )
        for o in opt_rows.scalars():
            options[o.question_id].append(OptionOut(id=o.id, position=o.position, text=o.text, is_correct=o.is_correct))
    by_rev_q: dict[uuid.UUID, list[QuestionOut]] = defaultdict(list)
    for q in questions:
        by_rev_q[q.revision_id].append(
            QuestionOut(id=q.id, position=q.position, text=q.text, kind=q.kind, options=options[q.id])
        )
    links: dict[uuid.UUID, list[VideoLinkOut]] = defaultdict(list)
    link_rows = await session.execute(
        select(TaskRevisionAttachment)
        .where(TaskRevisionAttachment.revision_id.in_(revision_ids), TaskRevisionAttachment.kind == "VIDEO_LINK")
        .order_by(TaskRevisionAttachment.position)
    )
    for a in link_rows.scalars():
        links[a.revision_id].append(VideoLinkOut(id=a.id, position=a.position, title=a.title, url=a.url or ""))
    return {
        r.id: RevisionOut(
            id=r.id,
            revision_number=r.revision_number,
            created_at=r.created_at,
            created_by=r.created_by,
            **{f: getattr(r, f) for f in CONTENT_FIELDS},
            questions=by_rev_q[r.id],
            video_links=links[r.id],
        )
        for r in revs
    }


def _comparable(content: TaskContent) -> dict:
    return content.model_dump(mode="json")


def _content_of(rev: RevisionOut) -> dict:
    data = {f: getattr(rev, f) for f in CONTENT_FIELDS}
    data["questions"] = [
        {"text": q.text, "kind": q.kind, "options": [{"text": o.text, "is_correct": o.is_correct} for o in q.options]}
        for q in rev.questions
    ]
    data["video_links"] = [{"title": v.title, "url": v.url} for v in rev.video_links]
    return _comparable(TaskContent.model_validate(data))


async def _insert_revision(
    session: AsyncSession, actor: User, task_id: uuid.UUID, number: int, c: TaskContent
) -> TaskRevision:
    rev = TaskRevision(
        task_id=task_id, revision_number=number, created_by=actor.id, **{f: getattr(c, f) for f in CONTENT_FIELDS}
    )
    session.add(rev)
    await session.flush()
    for qn, q in enumerate(c.questions, 1):
        question = QuizQuestion(revision_id=rev.id, position=qn, text=q.text, kind=q.kind)
        session.add(question)
        await session.flush()
        for on, o in enumerate(q.options, 1):
            session.add(QuizOption(question_id=question.id, position=on, text=o.text, is_correct=o.is_correct))
    for ln, link in enumerate(c.video_links, 1):
        session.add(
            TaskRevisionAttachment(
                revision_id=rev.id, position=ln, kind="VIDEO_LINK", title=link.title, url=str(link.url)
            )
        )
    await session.flush()
    return rev


async def list_revisions(session: AsyncSession, task_id: uuid.UUID) -> list[RevisionOut]:
    await _get(session, Task, task_id)
    ids = (
        (
            await session.execute(
                select(TaskRevision.id)
                .where(TaskRevision.task_id == task_id)
                .order_by(TaskRevision.revision_number.desc())
            )
        )
        .scalars()
        .all()
    )
    loaded = await load_revisions(session, list(ids))
    return [loaded[i] for i in ids]


# --- structure ---------------------------------------------------------------------------------


async def _labels_for_stage(session: AsyncSession, stage: Stage) -> dict[uuid.UUID, str]:
    active = (
        await session.execute(select(Task.id).where(Task.stage_id == stage.id, Task.is_active).order_by(Task.position))
    ).scalars()
    return {tid: task_label(stage.position, n) for n, tid in enumerate(active, 1)}


async def task_out(session: AsyncSession, task: Task) -> TaskOut:
    stage = await session.get(Stage, task.stage_id)
    rev = await _current_revision(session, task.id)
    revision = (await load_revisions(session, [rev.id]))[rev.id]
    label = (await _labels_for_stage(session, stage)).get(task.id)
    return TaskOut(
        id=task.id,
        stage_id=task.stage_id,
        position=task.position,
        is_active=task.is_active,
        label=label,
        revision=revision,
    )


async def version_detail(session: AsyncSession, version_id: uuid.UUID) -> VersionDetail:
    version = await _get(session, PathVersion, version_id)
    path = await session.get(LearningPath, version.learning_path_id)
    stages = (
        (await session.execute(select(Stage).where(Stage.path_version_id == version.id).order_by(Stage.position)))
        .scalars()
        .all()
    )
    tasks = (
        (await session.execute(select(Task).where(Task.stage_id.in_([s.id for s in stages])).order_by(Task.position)))
        .scalars()
        .all()
        if stages
        else []
    )
    latest = (
        select(TaskRevision.task_id, func.max(TaskRevision.revision_number).label("n"))
        .where(TaskRevision.task_id.in_([t.id for t in tasks]))
        .group_by(TaskRevision.task_id)
        .subquery()
    )
    rev_rows = (
        (
            await session.execute(
                select(TaskRevision.id, TaskRevision.task_id).join(
                    latest, (TaskRevision.task_id == latest.c.task_id) & (TaskRevision.revision_number == latest.c.n)
                )
            )
        ).all()
        if tasks
        else []
    )
    rev_of = {task_id: rev_id for rev_id, task_id in rev_rows}
    revisions = await load_revisions(session, list(rev_of.values()))

    by_stage: dict[uuid.UUID, list[Task]] = defaultdict(list)
    for t in tasks:
        by_stage[t.stage_id].append(t)
    stage_details = []
    for st in stages:
        n = 0
        outs = []
        for t in by_stage[st.id]:
            label = None
            if t.is_active:
                n += 1
                label = task_label(st.position, n)
            outs.append(
                TaskOut(
                    id=t.id,
                    stage_id=st.id,
                    position=t.position,
                    is_active=t.is_active,
                    label=label,
                    revision=revisions[rev_of[t.id]],
                )
            )
        stage_details.append(StageDetail(**stage_out(st).model_dump(), tasks=outs))
    return VersionDetail(**version_out(version).model_dump(), path_name=path.name, stages=stage_details)


def stage_out(s: Stage) -> StageOut:
    return StageOut(
        id=s.id, path_version_id=s.path_version_id, name=s.name, description=s.description, position=s.position
    )


async def create_stage(session: AsyncSession, actor: User, data: StageIn) -> StageOut:
    version = await _get(session, PathVersion, data.path_version_id, lock=True)
    await _defer_positions(session)
    count = (
        await session.scalar(select(func.count()).select_from(Stage).where(Stage.path_version_id == version.id)) or 0
    )
    position = min(data.position or count + 1, count + 1)
    await session.execute(
        update(Stage)
        .where(Stage.path_version_id == version.id, Stage.position >= position)
        .values(position=Stage.position + 1)
    )
    stage = Stage(path_version_id=version.id, name=data.name, description=data.description, position=position)
    session.add(stage)
    await session.flush()
    audit_service.record(
        session, actor.id, "STAGE_CREATED", "stage", stage.id, {"name": data.name, "position": position}
    )
    await session.commit()
    await session.refresh(stage)
    return stage_out(stage)


async def update_stage(session: AsyncSession, actor: User, stage_id: uuid.UUID, data: StageUpdate) -> StageOut:
    stage = await _get(session, Stage, stage_id, lock=True)
    changes = data.model_dump(exclude_none=True)
    for key, value in changes.items():
        setattr(stage, key, value)
    if changes:
        audit_service.record(session, actor.id, "STAGE_UPDATED", "stage", stage.id, changes)
    await session.commit()
    await session.refresh(stage)
    return stage_out(stage)


async def _reorder(session: AsyncSession, model, rows: list, ids: list[uuid.UUID]) -> None:
    if len(ids) != len(set(ids)) or set(ids) != {r.id for r in rows}:
        raise AppError("ORDER_MISMATCH", "The list must contain each item of this level exactly once.", 422)
    await _defer_positions(session)
    for position, obj_id in enumerate(ids, 1):
        await session.execute(update(model).where(model.id == obj_id).values(position=position))


async def order_stages(
    session: AsyncSession, actor: User, version_id: uuid.UUID, ids: list[uuid.UUID]
) -> VersionDetail:
    await _get(session, PathVersion, version_id, lock=True)
    rows = (await session.execute(select(Stage).where(Stage.path_version_id == version_id))).scalars().all()
    await _reorder(session, Stage, rows, ids)
    audit_service.record(
        session, actor.id, "ORDER_CHANGED", "path_version", version_id, {"stages": [str(i) for i in ids]}
    )
    await session.commit()
    return await version_detail(session, version_id)


async def order_tasks(session: AsyncSession, actor: User, stage_id: uuid.UUID, ids: list[uuid.UUID]) -> list[TaskOut]:
    stage = await _get(session, Stage, stage_id, lock=True)
    rows = (await session.execute(select(Task).where(Task.stage_id == stage.id))).scalars().all()
    await _reorder(session, Task, rows, ids)
    audit_service.record(session, actor.id, "ORDER_CHANGED", "stage", stage.id, {"tasks": [str(i) for i in ids]})
    await session.commit()
    detail = await version_detail(session, stage.path_version_id)
    return next(s.tasks for s in detail.stages if s.id == stage.id)


# --- tasks -------------------------------------------------------------------------------------


async def create_task(session: AsyncSession, actor: User, data: TaskCreate) -> TaskOut:
    stage = await _get(session, Stage, data.stage_id, lock=True)
    await _defer_positions(session)
    count = await session.scalar(select(func.count()).select_from(Task).where(Task.stage_id == stage.id)) or 0
    position = min(data.position or count + 1, count + 1)
    await session.execute(
        update(Task).where(Task.stage_id == stage.id, Task.position >= position).values(position=Task.position + 1)
    )
    task = Task(stage_id=stage.id, position=position, is_active=True)
    session.add(task)
    await session.flush()
    await _insert_revision(
        session, actor, task.id, 1, TaskContent.model_validate(data.model_dump(exclude={"stage_id", "position"}))
    )
    audit_service.record(
        session, actor.id, "TASK_CREATED", "task", task.id, {"name": data.name, "type": data.task_type}
    )
    await session.commit()
    return await task_out(session, task)


async def get_task(session: AsyncSession, task_id: uuid.UUID) -> TaskOut:
    return await task_out(session, await _get(session, Task, task_id))


async def update_task(session: AsyncSession, actor: User, task_id: uuid.UUID, content: TaskContent) -> TaskOut:
    task = await _get(session, Task, task_id, lock=True)  # serialises revision numbering per task
    current = await _current_revision(session, task.id)
    current_out = (await load_revisions(session, [current.id]))[current.id]
    if _content_of(current_out) != _comparable(content):
        rev = await _insert_revision(session, actor, task.id, current.revision_number + 1, content)
        audit_service.record(session, actor.id, "TASK_UPDATED", "task", task.id, {"revision": rev.revision_number})
        await session.commit()
    return await task_out(session, task)


async def move_task(session: AsyncSession, actor: User, task_id: uuid.UUID, stage_id: uuid.UUID) -> TaskOut:
    task = await _get(session, Task, task_id, lock=True)
    source = await session.get(Stage, task.stage_id)
    target = await _get(session, Stage, stage_id, lock=True)
    if target.path_version_id != source.path_version_id:
        raise AppError("STAGE_OUTSIDE_VERSION", "Tasks can only move between stages of the same version.", 422)
    if target.id == source.id:
        return await task_out(session, task)
    await _defer_positions(session)
    end = await session.scalar(select(func.count()).select_from(Task).where(Task.stage_id == target.id)) or 0
    old_position = task.position
    task.stage_id, task.position = target.id, end + 1
    await session.flush()
    await session.execute(
        update(Task).where(Task.stage_id == source.id, Task.position > old_position).values(position=Task.position - 1)
    )
    audit_service.record(
        session, actor.id, "ORDER_CHANGED", "task", task.id, {"from_stage": str(source.id), "to_stage": str(target.id)}
    )
    await session.commit()
    await session.refresh(task)
    return await task_out(session, task)


async def set_task_active(session: AsyncSession, actor: User, task_id: uuid.UUID, active: bool) -> TaskOut:
    task = await _get(session, Task, task_id, lock=True)
    if task.is_active == active:
        return await task_out(session, task)
    if not active:
        pending = await session.scalar(
            select(func.count())
            .select_from(Submission)
            .where(Submission.task_id == task.id, Submission.status.in_(("SUBMITTED", "UNDER_REVIEW")))
        )
        if pending:
            raise AppError("TASK_HAS_PENDING_SUBMISSIONS", "The task has submissions waiting for or under review.", 409)
        # BR-20: open drafts end as CANCELLED; the attempt history stays.
        await session.execute(
            update(Submission)
            .where(Submission.task_id == task.id, Submission.status == "DRAFT")
            .values(status="CANCELLED", cancelled_at=datetime.now(UTC))
        )
    task.is_active = active
    audit_service.record(session, actor.id, "TASK_ACTIVATED" if active else "TASK_DEACTIVATED", "task", task.id)
    await session.commit()
    await session.refresh(task)
    return await task_out(session, task)
