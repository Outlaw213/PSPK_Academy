"""Auto-graded quiz attempts (BR-32): graded against the admin's key, an explicit exception to R10 (Q-60)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.models import Assessment, QuizOption, QuizQuestion, Submission, SubmissionAnswer, User
from app.schemas.submission import QuizAnswer, QuizResult, QuizReview
from app.services import audit_service, enrollment_service, submission_service, task_service


def invalid_answers(message: str) -> AppError:
    return AppError("QUIZ_ANSWERS_INVALID", message, 422)


async def attempt(session: AsyncSession, user: User, task_id: uuid.UUID, answers: list[QuizAnswer]) -> QuizResult:
    task, enrollment = await submission_service.task_context(session, user, task_id)
    rev = await submission_service.current_revision(session, task.id)
    if rev.task_type != "QUIZ":
        raise AppError("TASK_NOT_QUIZ", "This task is not a quiz.", 409)
    state = await task_service.compute_path_statuses(session, enrollment)
    submission_service.check_startable(state.task(task.id))

    questions = (await session.execute(select(QuizQuestion).where(QuizQuestion.revision_id == rev.id))).scalars().all()
    options = (
        (
            await session.execute(
                select(QuizOption)
                .where(QuizOption.question_id.in_([q.id for q in questions]))
                .order_by(QuizOption.position)
            )
        )
        .scalars()
        .all()
    )
    by_question: dict[uuid.UUID, dict[uuid.UUID, bool]] = {q.id: {} for q in questions}
    for o in options:
        by_question[o.question_id][o.id] = o.is_correct

    given = {a.question_id: a.option_ids for a in answers}
    if len(given) != len(answers) or set(given) != set(by_question):
        raise invalid_answers("Answer every question of the quiz exactly once.")
    kinds = {q.id: q.kind for q in questions}
    correct = 0
    for qid, chosen in given.items():
        if not chosen or len(set(chosen)) != len(chosen) or not set(chosen) <= set(by_question[qid]):
            raise invalid_answers("Choose at least one of the listed answers for each question.")
        if kinds[qid] == "SINGLE" and len(chosen) != 1:
            raise invalid_answers("A single-choice question takes exactly one answer.")
        key = {oid for oid, ok in by_question[qid].items() if ok}
        correct += set(chosen) == key  # a question counts only when the chosen set is exactly right

    total = len(questions)
    score = correct * 100 // total
    passed = correct * 100 >= rev.pass_threshold * total
    now = datetime.now(UTC)
    number = await submission_service.next_attempt_number(session, enrollment, task.id, user.id)
    sub = Submission(
        task_id=task.id,
        user_id=user.id,
        attempt_number=number,
        status="PASSED" if passed else "NEEDS_IMPROVEMENT",
        task_revision_id=rev.id,
        submitted_at=now,
        assessed_at=now,
    )
    session.add(sub)
    await session.flush()
    for qid, chosen in given.items():
        session.add(SubmissionAnswer(submission_id=sub.id, question_id=qid, option_ids=list(chosen)))
    # BR-13: the result is an Assessment like any other, without an instructor.
    session.add(
        Assessment(
            submission_id=sub.id,
            instructor_id=None,
            result=sub.status,
            score=score,
            comment=f"Wynik {correct} z {total} ({score}%), próg {rev.pass_threshold}%.",
        )
    )
    audit_service.record(session, user.id, "QUIZ_ATTEMPTED", "submission", sub.id, {"score": score, "passed": passed})
    if passed:
        audit_service.record(session, None, "TASK_PASSED", "submission", sub.id, {"via": "quiz"})
        await session.flush()
        await enrollment_service.refresh_completion(session, enrollment, None)  # BR-15
    await session.commit()
    await session.refresh(sub)

    review = None
    if passed:
        review = [
            QuizReview(
                question_id=q.id,
                option_ids=given[q.id],
                correct_option_ids=[oid for oid, ok in by_question[q.id].items() if ok],
            )
            for q in sorted(questions, key=lambda q: q.position)
        ]
    return QuizResult(
        submission=await submission_service.to_out(session, sub),
        score=score,
        correct=correct,
        total=total,
        passed=passed,
        review=review,
    )
