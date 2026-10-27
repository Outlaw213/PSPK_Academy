"""Participant attempts: draft → photos/comment → submit, cancel, history (BR-03…BR-05, BR-14, BR-21…BR-23).

Availability always comes from task_service; this module never decides order on its own.
"""

import uuid
from datetime import UTC, datetime

from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import AppError
from app.models import Assessment, Enrollment, Stage, Submission, SubmissionPhoto, Task, TaskRevision, User
from app.schemas.participant import PublicRevision
from app.schemas.submission import AssessmentOut, PersonRef, PhotoOut, SubmissionDetail, SubmissionOut
from app.services import audit_service, content_service, task_service
from app.services.storage_service import Storage
from app.utils.images import InvalidImage, process_photo


def not_found() -> AppError:
    return AppError("NOT_FOUND", "Not found.", 404)


def invalid_transition(message: str = "This attempt can no longer be changed.") -> AppError:
    return AppError("INVALID_STATE_TRANSITION", message, 409)


# --- context ---------------------------------------------------------------------------------


async def current_revision(session: AsyncSession, task_id: uuid.UUID) -> TaskRevision:
    stmt = (
        select(TaskRevision)
        .where(TaskRevision.task_id == task_id)
        .order_by(TaskRevision.revision_number.desc())
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one()


async def task_context(
    session: AsyncSession, user: User, task_id: uuid.UUID, *, require_active_enrollment: bool = True
) -> tuple[Task, Enrollment]:
    """The task within one of the user's enrollments; anything else is 404 (BR-17)."""
    task = await session.get(Task, task_id)
    if task is None:
        raise not_found()
    stage = await session.get(Stage, task.stage_id)
    enrollment = (
        await session.execute(
            select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.path_version_id == stage.path_version_id)
        )
    ).scalar_one_or_none()
    if enrollment is None:
        raise not_found()
    if require_active_enrollment:
        if not task.is_active:
            raise not_found()
        if enrollment.status != "ACTIVE":
            raise AppError("NO_ACTIVE_ENROLLMENT", "Your enrollment in this path is not active.", 403)
    return task, enrollment


async def next_attempt_number(
    session: AsyncSession, enrollment: Enrollment, task_id: uuid.UUID, user_id: uuid.UUID
) -> int:
    """max + 1 per task and participant (BR-04). Locking the enrollment row serialises concurrent starts."""
    await session.execute(select(Enrollment.id).where(Enrollment.id == enrollment.id).with_for_update())
    last = await session.scalar(
        select(func.max(Submission.attempt_number)).where(Submission.task_id == task_id, Submission.user_id == user_id)
    )
    return (last or 0) + 1


def check_startable(t: task_service.TaskState) -> None:
    if t.status == "PASSED":
        raise AppError("TASK_ALREADY_PASSED", "This task is already passed.", 409)  # BR-05
    if t.status in ("IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW"):
        raise AppError("SUBMISSION_PENDING", "You already have an open attempt for this task.", 409)  # BR-14
    if t.status not in task_service.STARTABLE:
        raise AppError("TASK_LOCKED", "Task is locked until the previous task is passed.", 409)  # BR-02


async def _own(session: AsyncSession, user: User, submission_id: uuid.UUID, lock: bool = False) -> Submission:
    sub = await session.get(Submission, submission_id, with_for_update=lock)
    if sub is None or sub.user_id != user.id:
        raise not_found()
    return sub


# --- output ----------------------------------------------------------------------------------


async def to_out(session: AsyncSession, sub: Submission) -> SubmissionOut:
    photos = (
        await session.execute(
            select(SubmissionPhoto).where(SubmissionPhoto.submission_id == sub.id).order_by(SubmissionPhoto.position)
        )
    ).scalars()
    a = (await session.execute(select(Assessment).where(Assessment.submission_id == sub.id))).scalar_one_or_none()
    assessment = None
    if a is not None:
        instructor = await session.get(User, a.instructor_id) if a.instructor_id else None
        assessment = AssessmentOut(
            result=a.result,
            comment=a.comment,
            score=a.score,
            instructor=PersonRef(first_name=instructor.first_name, last_name=instructor.last_name)
            if instructor
            else None,
            created_at=a.created_at,
        )
    return SubmissionOut(
        id=sub.id,
        task_id=sub.task_id,
        attempt_number=sub.attempt_number,
        status=sub.status,
        comment=sub.comment,
        task_revision_id=sub.task_revision_id,
        submitted_at=sub.submitted_at,
        claimed_at=sub.claimed_at,
        assessed_at=sub.assessed_at,
        cancelled_at=sub.cancelled_at,
        created_at=sub.created_at,
        photos=[
            PhotoOut(
                id=p.id,
                position=p.position,
                mime_type=p.mime_type,
                file_size=p.file_size,
                width=p.width,
                height=p.height,
            )
            for p in photos
        ],
        assessment=assessment,
    )


async def detail(session: AsyncSession, user: User, submission_id: uuid.UUID) -> SubmissionDetail:
    sub = await _own(session, user, submission_id)
    revision = None
    if sub.task_revision_id:  # BR-19: the revision the attempt was sent against
        rev = (await content_service.load_revisions(session, [sub.task_revision_id]))[sub.task_revision_id]
        revision = PublicRevision.model_validate(rev.model_dump())
    return SubmissionDetail(**(await to_out(session, sub)).model_dump(), revision=revision)


async def history(session: AsyncSession, user: User, task_id: uuid.UUID) -> list[SubmissionOut]:
    """Every attempt stays visible, also after the task was deactivated or the enrollment ended (BR-04, BR-20)."""
    await task_context(session, user, task_id, require_active_enrollment=False)
    subs = (
        (
            await session.execute(
                select(Submission)
                .where(Submission.task_id == task_id, Submission.user_id == user.id)
                .order_by(Submission.attempt_number.desc())
            )
        )
        .scalars()
        .all()
    )
    return [await to_out(session, s) for s in subs]


# --- draft lifecycle -------------------------------------------------------------------------


async def create_draft(session: AsyncSession, user: User, task_id: uuid.UUID, comment: str | None) -> Submission:
    task, enrollment = await task_context(session, user, task_id)
    kind = (await current_revision(session, task.id)).task_type
    if kind == "COURSE":
        raise AppError("TASK_IS_COURSE", "Course results are recorded by an instructor.", 409)  # BR-30
    if kind == "QUIZ":
        raise AppError("TASK_IS_QUIZ", "A quiz is answered in one go, without a draft.", 409)  # BR-32
    state = await task_service.compute_path_statuses(session, enrollment)
    check_startable(state.task(task.id))
    number = await next_attempt_number(session, enrollment, task.id, user.id)
    sub = Submission(task_id=task.id, user_id=user.id, attempt_number=number, status="DRAFT", comment=comment)
    session.add(sub)
    try:
        await session.flush()
    except IntegrityError as exc:  # concurrent request won the race for the single open attempt
        await session.rollback()
        raise AppError("SUBMISSION_PENDING", "You already have an open attempt for this task.", 409) from exc
    audit_service.record(
        session, user.id, "SUBMISSION_CREATED", "submission", sub.id, {"task_id": str(task.id), "attempt": number}
    )
    await session.commit()
    await session.refresh(sub)
    return sub


async def update_comment(
    session: AsyncSession, user: User, submission_id: uuid.UUID, comment: str | None
) -> Submission:
    sub = await _own(session, user, submission_id, lock=True)
    if sub.status != "DRAFT":
        raise invalid_transition()
    sub.comment = comment
    await session.commit()
    await session.refresh(sub)
    return sub


async def add_photo(
    session: AsyncSession,
    storage: Storage,
    settings: Settings,
    user: User,
    submission_id: uuid.UUID,
    upload: UploadFile,
) -> SubmissionPhoto:
    sub = await _own(session, user, submission_id, lock=True)
    if sub.status != "DRAFT":
        raise invalid_transition()
    count = await session.scalar(
        select(func.count()).select_from(SubmissionPhoto).where(SubmissionPhoto.submission_id == sub.id)
    )
    if count >= settings.max_submission_photos:
        raise AppError(
            "TOO_MANY_PHOTOS", f"An attempt can have at most {settings.max_submission_photos} photos.", 422
        )  # BR-08

    limit = settings.max_upload_size_mb * 1024 * 1024
    raw = await upload.read(limit + 1)
    if len(raw) > limit:
        raise AppError("PHOTO_TOO_LARGE", f"A photo can be at most {settings.max_upload_size_mb} MB.", 413)
    try:
        img = process_photo(raw, settings.image_max_edge, settings.image_quality)
    except InvalidImage as exc:
        raise AppError("INVALID_PHOTO_TYPE", "Only JPEG, PNG and WebP photos are accepted.", 422) from exc

    key = f"submissions/{sub.id}/{uuid.uuid4()}.webp"
    storage.put(key, img.data)
    try:
        photo = SubmissionPhoto(
            submission_id=sub.id,
            storage_key=key,
            original_filename=(upload.filename or "photo")[:255],
            mime_type=img.mime_type,
            file_size=len(img.data),
            width=img.width,
            height=img.height,
            position=count + 1,
        )
        session.add(photo)
        await session.commit()
    except BaseException:
        storage.delete(key)  # compensation: no file without its row (ADR-24)
        raise
    await session.refresh(photo)
    return photo


async def delete_photo(
    session: AsyncSession, storage: Storage, user: User, submission_id: uuid.UUID, photo_id: uuid.UUID
) -> None:
    sub = await _own(session, user, submission_id, lock=True)
    photo = await session.get(SubmissionPhoto, photo_id)
    if photo is None or photo.submission_id != sub.id:
        raise not_found()
    if sub.status != "DRAFT":
        raise invalid_transition()
    key, removed = photo.storage_key, photo.position
    await session.delete(photo)
    await session.flush()
    later = (
        (
            await session.execute(
                select(SubmissionPhoto)
                .where(SubmissionPhoto.submission_id == sub.id, SubmissionPhoto.position > removed)
                .order_by(SubmissionPhoto.position)
            )
        )
        .scalars()
        .all()
    )
    for p in later:  # ascending, so each new position is already free
        p.position -= 1
        await session.flush()
    await session.commit()
    storage.delete(key)


async def photo_bytes(
    session: AsyncSession, storage: Storage, user: User, submission_id: uuid.UUID, photo_id: uuid.UUID
) -> tuple[bytes, str]:
    sub = await _own(session, user, submission_id)
    photo = await session.get(SubmissionPhoto, photo_id)
    if photo is None or photo.submission_id != sub.id:
        raise not_found()
    return storage.read(photo.storage_key), photo.mime_type


async def submit(session: AsyncSession, user: User, submission_id: uuid.UUID) -> Submission:
    sub = await _own(session, user, submission_id, lock=True)
    if sub.status != "DRAFT":
        raise invalid_transition()
    task, enrollment = await task_context(session, user, sub.task_id)
    state = await task_service.compute_path_statuses(session, enrollment)
    if not task_service.in_order(state, task.id):
        raise AppError("TASK_LOCKED", "Task is locked until the previous task is passed.", 409)
    rev = await current_revision(session, task.id)
    photos = await session.scalar(
        select(func.count()).select_from(SubmissionPhoto).where(SubmissionPhoto.submission_id == sub.id)
    )
    has_comment = bool((sub.comment or "").strip())
    if (rev.task_type == "PRACTICAL" and photos < 1) or (
        rev.task_type in ("THEORY", "QUIZ") and not (photos or has_comment)
    ):
        raise AppError("SUBMISSION_REQUIREMENTS_NOT_MET", "Add the photos or comment this task requires.", 422)  # BR-22
    sub.status, sub.task_revision_id, sub.submitted_at = "SUBMITTED", rev.id, datetime.now(UTC)
    audit_service.record(
        session, user.id, "SUBMISSION_SUBMITTED", "submission", sub.id, {"revision": rev.revision_number}
    )
    await session.commit()
    await session.refresh(sub)
    return sub


async def cancel(session: AsyncSession, user: User, submission_id: uuid.UUID) -> Submission:
    sub = await _own(session, user, submission_id, lock=True)
    if sub.status == "UNDER_REVIEW":
        raise AppError("SUBMISSION_ALREADY_CLAIMED", "An instructor is already reviewing this attempt.", 409)  # BR-23
    if sub.status not in ("DRAFT", "SUBMITTED"):
        raise invalid_transition()
    sub.status, sub.cancelled_at = "CANCELLED", datetime.now(UTC)
    audit_service.record(session, user.id, "SUBMISSION_CANCELLED", "submission", sub.id)
    await session.commit()
    await session.refresh(sub)
    return sub
