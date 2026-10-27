"""Admin read-only views of submissions and the audit log (FR-ADM-05, FR-ADM-06). Nothing here writes."""

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.models import AuditLog, Stage, Submission, Task, User
from app.schemas.admin import AdminSubmissionDetail, AdminSubmissionItem, AdminSubmissionPage, AuditItem, AuditPage
from app.services import content_service, instructor_service, submission_service


async def _item(session: AsyncSession, sub: Submission, labels: dict) -> AdminSubmissionItem:
    base = await instructor_service._item(session, sub, labels)
    participant = await session.get(User, sub.user_id)
    return AdminSubmissionItem(
        **base.model_dump(exclude={"participant"}), participant={**base.participant, "email": participant.email}
    )


async def submissions(
    session: AsyncSession,
    *,
    path_version_id: uuid.UUID | None,
    status: str | None,
    user_id: uuid.UUID | None,
    instructor_id: uuid.UUID | None,
    task_id: uuid.UUID | None,
    limit: int,
    offset: int,
) -> AdminSubmissionPage:
    stmt = select(Submission).join(Task, Task.id == Submission.task_id).join(Stage, Stage.id == Task.stage_id)
    for column, value in (
        (Stage.path_version_id, path_version_id),
        (Submission.status, status),
        (Submission.user_id, user_id),
        (Submission.instructor_id, instructor_id),
        (Submission.task_id, task_id),
    ):
        if value is not None:
            stmt = stmt.where(column == value)
    total = await session.scalar(select(func.count()).select_from(stmt.subquery()))
    subs = (
        (await session.execute(stmt.order_by(Submission.created_at.desc()).limit(limit).offset(offset))).scalars().all()
    )
    stage_ids = set(
        (await session.execute(select(Task.stage_id).where(Task.id.in_([s.task_id for s in subs])))).scalars()
    )
    labels = await instructor_service._labels(session, stage_ids)
    return AdminSubmissionPage(
        items=[await _item(session, s, labels) for s in subs], total=total or 0, limit=limit, offset=offset
    )


async def submission_detail(session: AsyncSession, submission_id: uuid.UUID) -> AdminSubmissionDetail:
    sub = await session.get(Submission, submission_id)
    if sub is None:
        raise AppError("NOT_FOUND", "Not found.", 404)
    task = await session.get(Task, sub.task_id)
    item = await _item(session, sub, await instructor_service._labels(session, {task.stage_id}))
    rev_id = sub.task_revision_id or (await submission_service.current_revision(session, task.id)).id
    revision = (await content_service.load_revisions(session, [rev_id]))[rev_id]
    attempts = (
        (
            await session.execute(
                select(Submission)
                .where(Submission.task_id == sub.task_id, Submission.user_id == sub.user_id)
                .order_by(Submission.attempt_number.desc())
            )
        )
        .scalars()
        .all()
    )
    return AdminSubmissionDetail(
        **item.model_dump(),
        revision=revision,
        attempts=[await submission_service.to_out(session, a) for a in attempts],
    )


async def audit_logs(
    session: AsyncSession,
    *,
    action: str | None,
    user_id: uuid.UUID | None,
    entity_type: str | None,
    entity_id: uuid.UUID | None,
    since: datetime | None,
    until: datetime | None,
    limit: int,
    offset: int,
) -> AuditPage:
    stmt = select(AuditLog)
    for column, value in (
        (AuditLog.action, action),
        (AuditLog.user_id, user_id),
        (AuditLog.entity_type, entity_type),
        (AuditLog.entity_id, entity_id),
    ):
        if value is not None:
            stmt = stmt.where(column == value)
    if since is not None:
        stmt = stmt.where(AuditLog.created_at >= since)
    if until is not None:
        stmt = stmt.where(AuditLog.created_at < until)
    total = await session.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (
        await session.execute(
            select(AuditLog, User)
            .outerjoin(User, User.id == AuditLog.user_id)
            .where(AuditLog.id.in_(select(stmt.subquery().c.id)))
            .order_by(AuditLog.created_at.desc(), AuditLog.id)
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return AuditPage(
        items=[
            AuditItem(
                id=log.id,
                created_at=log.created_at,
                action=log.action,
                entity_type=log.entity_type,
                entity_id=log.entity_id,
                user={"id": u.id, "email": u.email, "first_name": u.first_name, "last_name": u.last_name}
                if u
                else None,
                metadata=log.meta,
            )
            for log, u in rows
        ],
        total=total or 0,
        limit=limit,
        offset=offset,
    )
