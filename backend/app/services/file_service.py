"""Task files: reference photos and PDF attachments (BR-33, Q-43, ADR-24, ADR-25).

An upload is a content edit: the file is appended to a new revision at once (BR-19), so no file
exists outside a revision. Files are never deleted — older revisions and passed tasks show them.
"""

import uuid
from pathlib import PurePath

from fastapi import UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.dependencies.auth import CurrentUser
from app.errors import AppError
from app.models import Enrollment, Stage, Task, TaskMaterial, TaskRevision, TaskRevisionAttachment, User
from app.schemas.content import TaskContent, TaskOut
from app.services import audit_service, content_service, permission_service
from app.services.storage_service import Storage
from app.utils.images import InvalidImage, process_photo


def not_found() -> AppError:
    return AppError("NOT_FOUND", "Not found.", 404)


def is_pdf(data: bytes) -> bool:
    """Checked on the content, not the name or header (BR-33): PDF signature and end-of-file marker."""
    return data.startswith(b"%PDF-") and b"%%EOF" in data[-1024:]


async def _read(upload: UploadFile, limit: int) -> bytes | None:
    raw = await upload.read(limit + 1)
    return None if len(raw) > limit else raw


async def _append(
    session: AsyncSession, storage: Storage, actor: User, task: Task, key: str, *, material=None, pdf=None
) -> TaskOut:
    """New revision = current content + the file at the end of its list. Caller wrote `key` already."""
    try:
        current = await content_service.current_revision(session, task.id)
        current_out = (await content_service.load_revisions(session, [current.id]))[current.id]
        content = TaskContent.model_validate(current_out.model_dump())
        content, files = await content_service.resolve_files(session, task.id, content, current_out)
        if material is not None:
            files.materials.append(material)
            what = "material"
        else:
            files.pdfs.append(pdf)
            what = "pdf"
        rev = await content_service.insert_revision(
            session, actor, task.id, current.revision_number + 1, content, files
        )
        audit_service.record(
            session, actor.id, "TASK_UPDATED", "task", task.id, {"revision": rev.revision_number, "added": what}
        )
        await session.commit()
    except BaseException:
        storage.delete(key)  # compensation: no file without its row (ADR-24)
        raise
    return await content_service.task_out(session, task)


async def add_material(
    session: AsyncSession,
    storage: Storage,
    settings: Settings,
    actor: User,
    task_id: uuid.UUID,
    upload: UploadFile,
    caption: str | None,
) -> TaskOut:
    task = await session.get(Task, task_id, with_for_update=True)  # serialises revision numbering per task
    if task is None:
        raise not_found()
    raw = await _read(upload, settings.max_upload_size_mb * 1024 * 1024)
    if raw is None:
        raise AppError("PHOTO_TOO_LARGE", f"A photo can be at most {settings.max_upload_size_mb} MB.", 413)
    try:
        # ~2 s for a 12 MP photo: off the event loop, so other requests keep flowing
        img = await run_in_threadpool(process_photo, raw, settings.image_max_edge, settings.image_quality)
    except InvalidImage as exc:
        raise AppError("INVALID_PHOTO_TYPE", "Only JPEG, PNG and WebP photos are accepted.", 422) from exc
    key = f"materials/{task.id}/{uuid.uuid4()}.webp"
    storage.put(key, img.data)
    try:
        m = TaskMaterial(
            task_id=task.id,
            storage_key=key,
            original_filename=(upload.filename or "photo")[:255],
            mime_type=img.mime_type,
            file_size=len(img.data),
            width=img.width,
            height=img.height,
            created_by=actor.id,
        )
        session.add(m)
        await session.flush()
    except BaseException:
        storage.delete(key)
        raise
    caption = (caption or "").strip() or None
    return await _append(session, storage, actor, task, key, material=(m.id, caption))


async def add_pdf(
    session: AsyncSession,
    storage: Storage,
    settings: Settings,
    actor: User,
    task_id: uuid.UUID,
    upload: UploadFile,
    title: str | None,
) -> TaskOut:
    task = await session.get(Task, task_id, with_for_update=True)
    if task is None:
        raise not_found()
    raw = await _read(upload, settings.max_attachment_size_mb * 1024 * 1024)
    if raw is None:
        raise AppError(
            "ATTACHMENT_TOO_LARGE", f"An attachment can be at most {settings.max_attachment_size_mb} MB.", 413
        )
    if not is_pdf(raw):
        raise AppError("INVALID_ATTACHMENT_TYPE", "Only PDF files are accepted.", 422)
    title = (title or "").strip() or PurePath(upload.filename or "").stem.strip() or "Załącznik"
    key = f"attachments/{task.id}/{uuid.uuid4()}.pdf"
    storage.put(key, raw)  # kept byte for byte
    return await _append(session, storage, actor, task, key, pdf=content_service.PdfFile(title[:300], key, len(raw)))


# --- reading (BR-17) ---------------------------------------------------------------------------


async def can_read_task(session: AsyncSession, viewer: CurrentUser, task: Task) -> bool:
    """Admin, an instructor with permission for the stage, or a participant enrolled in the version
    (also after the enrollment ended — the history stays readable, BR-20)."""
    if "ADMIN" in viewer.roles:
        return True
    stage = await session.get(Stage, task.stage_id)
    if "INSTRUCTOR" in viewer.roles and (await permission_service.instructor_scope(session, viewer.id)).covers(stage):
        return True
    enrolled = await session.scalar(
        select(func.count())
        .select_from(Enrollment)
        .where(Enrollment.user_id == viewer.id, Enrollment.path_version_id == stage.path_version_id)
    )
    return bool(enrolled)


async def _readable_task(session: AsyncSession, viewer: CurrentUser, task_id: uuid.UUID) -> Task:
    task = await session.get(Task, task_id)
    if task is None or not await can_read_task(session, viewer, task):
        raise not_found()
    return task


async def material_bytes(
    session: AsyncSession, storage: Storage, viewer: CurrentUser, task_id: uuid.UUID, material_id: uuid.UUID
) -> tuple[bytes, str]:
    task = await _readable_task(session, viewer, task_id)
    m = await session.get(TaskMaterial, material_id)
    if m is None or m.task_id != task.id:
        raise not_found()
    return storage.read(m.storage_key), m.mime_type


async def attachment_bytes(
    session: AsyncSession, storage: Storage, viewer: CurrentUser, task_id: uuid.UUID, attachment_id: uuid.UUID
) -> tuple[bytes, str]:
    """Returns the file and its title."""
    task = await _readable_task(session, viewer, task_id)
    row = (
        await session.execute(
            select(TaskRevisionAttachment)
            .join(TaskRevision, TaskRevision.id == TaskRevisionAttachment.revision_id)
            .where(
                TaskRevisionAttachment.id == attachment_id,
                TaskRevisionAttachment.kind == "PDF",
                TaskRevision.task_id == task.id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found()
    return storage.read(row.storage_key), row.title
