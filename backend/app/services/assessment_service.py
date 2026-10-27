"""Instructor verdicts: assessment of a claimed attempt and course results (BR-05, BR-07, BR-13, BR-15, BR-30).

A verdict is one Assessment row, written once; PASSED is final.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.models import Assessment, Enrollment, Stage, Submission, Task, User
from app.services import audit_service, enrollment_service, permission_service, submission_service, task_service


def not_found() -> AppError:
    return AppError("NOT_FOUND", "Not found.", 404)


def _check_comment(result: str, comment: str | None) -> str | None:
    comment = (comment or "").strip() or None
    if result == "NEEDS_IMPROVEMENT" and comment is None:
        raise AppError("ASSESSMENT_COMMENT_REQUIRED", "Say what to improve.", 422)  # BR-07
    return comment


async def _verdict(
    session: AsyncSession, sub: Submission, instructor_id: uuid.UUID, result: str, comment: str | None
) -> None:
    """Assessment + audit + completion (BR-13, BR-15). Caller commits."""
    session.add(Assessment(submission_id=sub.id, instructor_id=instructor_id, result=result, comment=comment))
    audit_service.record(
        session, instructor_id, "TASK_PASSED" if result == "PASSED" else "TASK_REJECTED", "submission", sub.id
    )
    await session.flush()
    if result == "PASSED":
        stage = await permission_service.stage_of_submission(session, sub)
        enrollment = (
            await session.execute(
                select(Enrollment)
                .where(Enrollment.user_id == sub.user_id, Enrollment.path_version_id == stage.path_version_id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if enrollment is not None:
            await enrollment_service.refresh_completion(session, enrollment, instructor_id)


async def assess(
    session: AsyncSession, instructor: User, submission_id: uuid.UUID, result: str, comment: str | None
) -> Submission:
    """Order of checks as in docs/api.md (M8)."""
    sub = await session.get(Submission, submission_id, with_for_update=True)
    if sub is None:
        raise not_found()
    await permission_service.check_can_assess(session, instructor.id, sub)
    if sub.status != "UNDER_REVIEW":
        raise AppError("INVALID_STATE_TRANSITION", "Only a claimed attempt can be assessed.", 409)
    if sub.instructor_id != instructor.id:
        raise AppError("NOT_ASSIGNED_INSTRUCTOR", "Only the assigned instructor can assess this submission.", 403)
    comment = _check_comment(result, comment)
    sub.status, sub.assessed_at = result, datetime.now(UTC)
    audit_service.record(session, instructor.id, "SUBMISSION_ASSESSED", "submission", sub.id, {"result": result})
    await _verdict(session, sub, instructor.id, result, comment)
    await session.commit()
    await session.refresh(sub)
    return sub


# --- courses (BR-30, FR-INS-06) ---------------------------------------------------------------


async def course_task(session: AsyncSession, task_id: uuid.UUID) -> tuple[Task, Stage]:
    task = await session.get(Task, task_id)
    if task is None or not task.is_active:
        raise not_found()
    if (await submission_service.current_revision(session, task.id)).task_type != "COURSE":
        raise AppError("TASK_NOT_COURSE", "This task is not a course.", 409)
    return task, await session.get(Stage, task.stage_id)


async def record_course_result(
    session: AsyncSession,
    instructor: User,
    task_id: uuid.UUID,
    user_id: uuid.UUID,
    result: str,
    comment: str | None,
) -> Submission:
    task, stage = await course_task(session, task_id)
    await permission_service.check_can_assess_in(session, instructor.id, user_id, stage)
    participant = await session.get(User, user_id)
    if participant is None:
        raise not_found()
    _, enrollment = await submission_service.task_context(session, participant, task.id)  # 404 / NO_ACTIVE_ENROLLMENT
    state = await task_service.compute_path_statuses(session, enrollment)
    submission_service.check_startable(state.task(task.id))  # TASK_ALREADY_PASSED, TASK_LOCKED (BR-31)
    comment = _check_comment(result, comment)
    rev = await submission_service.current_revision(session, task.id)
    number = await submission_service.next_attempt_number(session, enrollment, task.id, user_id)
    now = datetime.now(UTC)
    sub = Submission(
        task_id=task.id,
        user_id=user_id,
        attempt_number=number,
        status=result,
        task_revision_id=rev.id,
        instructor_id=instructor.id,
        recorded_by=instructor.id,
        submitted_at=now,
        assessed_at=now,
    )
    session.add(sub)
    try:
        await session.flush()
    except IntegrityError as exc:  # a concurrent PASSED won (BR-05)
        await session.rollback()
        raise AppError("TASK_ALREADY_PASSED", "This task is already passed.", 409) from exc
    audit_service.record(
        session, instructor.id, "COURSE_RESULT_RECORDED", "submission", sub.id, {"result": result, "attempt": number}
    )
    await _verdict(session, sub, instructor.id, result, comment)
    await session.commit()
    await session.refresh(sub)
    return sub
