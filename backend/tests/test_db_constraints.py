"""M2: database-level constraints (defence in depth, docs/database.md). Real PostgreSQL only."""

import pytest
from sqlalchemy import text, update
from sqlalchemy.exc import IntegrityError

from app.models import QuizQuestion, SubmissionPhoto, Task, TaskRevision, TaskRevisionAttachment
from tests import factories as f


async def violates(db, coro_or_fn) -> bool:
    """True if the statement(s) raise IntegrityError; the outer transaction survives."""
    try:
        async with db.begin_nested():
            await coro_or_fn()
    except IntegrityError:
        return True
    return False


async def _base(db):
    v = await f.path_version(db)
    s = await f.stage(db, v)
    t = await f.task(db, s)
    u = await f.user(db, "PARTICIPANT")
    return v, s, t, u


# --- users ---------------------------------------------------------------------------------


async def test_fr_auth01_email_unique_case_insensitive(db):
    await f.user(db, email="Jan@Example.pl")
    assert await violates(db, lambda: f.user(db, email="jan@example.PL"))


async def test_br27_user_role_values_checked(db):
    assert await violates(db, lambda: f.user(db, "SUPERUSER"))


async def test_br28_user_status_values_checked(db):
    assert await violates(db, lambda: f.user(db, status="BANNED"))


# --- structure -----------------------------------------------------------------------------


async def test_adr15_positions_unique_but_swappable_in_one_transaction(db):
    v = await f.path_version(db)
    s = await f.stage(db, v)
    t1 = await f.task(db, s, 1)
    t2 = await f.task(db, s, 2)
    # A duplicate position that stays at commit time is rejected...
    assert await violates(db, lambda: f.task(db, s, 1))

    # ...but swapping two positions inside one transaction works (DEFERRABLE INITIALLY DEFERRED).
    async def swap():
        await db.execute(text("SET CONSTRAINTS ALL DEFERRED"))
        await db.execute(update(Task).where(Task.id == t1.id).values(position=2))
        await db.execute(update(Task).where(Task.id == t2.id).values(position=1))
        await db.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))

    assert not await violates(db, swap)


async def test_adr15_stage_position_unique(db):
    v = await f.path_version(db)
    await f.stage(db, v, 1)
    assert await violates(db, lambda: f.stage(db, v, 1))


async def test_br12_version_number_unique_per_path(db):
    v = await f.path_version(db)
    from app.models import LearningPath

    path = await db.get(LearningPath, v.learning_path_id)
    assert await violates(db, lambda: f.path_version(db, 1, path))


async def test_br19_revision_number_unique_per_task(db):
    _, _, t, _ = await _base(db)
    rev = await f.revision_of(db, t)

    async def dup():
        db.add(
            TaskRevision(
                task_id=t.id,
                revision_number=1,
                name="x",
                task_type="PRACTICAL",
                expected_duration_days=1,
                created_by=rev.created_by,
            )
        )
        await db.flush()

    assert await violates(db, dup)


async def test_task_type_values_checked(db):
    v = await f.path_version(db)
    s = await f.stage(db, v)
    assert await violates(db, lambda: f.task(db, s, 1, task_type="ESSAY"))


async def test_br32_quiz_threshold_range(db):
    _, _, t, _ = await _base(db)

    async def bad():
        await db.execute(update(TaskRevision).where(TaskRevision.task_id == t.id).values(pass_threshold=101))

    assert await violates(db, bad)


async def test_br32_quiz_question_position_unique(db):
    _, _, t, _ = await _base(db)
    rev = await f.revision_of(db, t)
    db.add(QuizQuestion(revision_id=rev.id, position=1, text="?", kind="SINGLE"))
    await db.flush()

    async def dup():
        db.add(QuizQuestion(revision_id=rev.id, position=1, text="??", kind="MULTI"))
        await db.flush()

    assert await violates(db, dup)


async def test_br33_video_link_must_be_https(db):
    _, _, t, _ = await _base(db)
    rev = await f.revision_of(db, t)

    async def add(url: str, pos: int):
        db.add(TaskRevisionAttachment(revision_id=rev.id, position=pos, kind="VIDEO_LINK", title="Film", url=url))
        await db.flush()

    assert await violates(db, lambda: add("http://example.com/film", 1))
    assert not await violates(db, lambda: add("https://example.com/film", 2))


async def test_br33_pdf_needs_storage_key(db):
    _, _, t, _ = await _base(db)
    rev = await f.revision_of(db, t)

    async def add():
        db.add(TaskRevisionAttachment(revision_id=rev.id, position=1, kind="PDF", title="Regulamin"))
        await db.flush()

    assert await violates(db, add)


# --- enrollments ---------------------------------------------------------------------------


async def test_br12_one_active_enrollment_per_path(db):
    v1 = await f.path_version(db, 1)
    from app.models import LearningPath

    v2 = await f.path_version(db, 2, await db.get(LearningPath, v1.learning_path_id))
    u = await f.user(db)
    await f.enrollment(db, u, v1)
    assert await violates(db, lambda: f.enrollment(db, u, v2))


async def test_br12_cancelled_enrollment_allows_new_active_one(db):
    v1 = await f.path_version(db, 1)
    from app.models import LearningPath

    v2 = await f.path_version(db, 2, await db.get(LearningPath, v1.learning_path_id))
    u = await f.user(db)
    await f.enrollment(db, u, v1, status="CANCELLED")
    assert not await violates(db, lambda: f.enrollment(db, u, v2))


async def test_br12_enrollment_path_matches_version(db):
    v = await f.path_version(db)
    other = await f.path_version(db)  # a different learning path
    u = await f.user(db)

    async def mismatched():
        from app.models import Enrollment

        db.add(Enrollment(user_id=u.id, path_version_id=v.id, learning_path_id=other.learning_path_id, status="ACTIVE"))
        await db.flush()

    assert await violates(db, mismatched)


# --- submissions ---------------------------------------------------------------------------


async def test_br04_attempt_number_unique_and_positive(db):
    _, _, t, u = await _base(db)
    await f.submission(db, t, u, 1, status="CANCELLED")
    assert await violates(db, lambda: f.submission(db, t, u, 1, status="CANCELLED"))
    assert await violates(db, lambda: f.submission(db, t, u, 0, status="CANCELLED"))


async def test_br14_only_one_open_attempt(db):
    _, _, t, u = await _base(db)
    await f.submission(db, t, u, 1, status="DRAFT")
    assert await violates(db, lambda: f.submission(db, t, u, 2, status="SUBMITTED"))


async def test_br14_closed_attempts_do_not_block_new_one(db):
    _, _, t, u = await _base(db)
    await f.submission(db, t, u, 1, status="NEEDS_IMPROVEMENT")
    await f.submission(db, t, u, 2, status="CANCELLED")
    assert not await violates(db, lambda: f.submission(db, t, u, 3, status="DRAFT"))


async def test_br05_only_one_passed(db):
    _, _, t, u = await _base(db)
    await f.submission(db, t, u, 1, status="PASSED")
    assert await violates(db, lambda: f.submission(db, t, u, 2, status="PASSED"))


async def test_br25_no_self_assessment(db):
    _, _, t, u = await _base(db)
    assert await violates(db, lambda: f.submission(db, t, u, 1, status="UNDER_REVIEW", instructor_id=u.id))


async def test_under_review_requires_instructor(db):
    _, _, t, u = await _base(db)
    assert await violates(db, lambda: f.submission(db, t, u, 1, status="UNDER_REVIEW"))


async def test_br19_sent_submission_points_at_revision(db):
    _, _, t, u = await _base(db)
    assert await violates(db, lambda: f.submission(db, t, u, 1, status="SUBMITTED", task_revision_id=None))


async def test_br30_course_result_recorded_by_assessing_instructor(db):
    _, _, t, u = await _base(db)
    instr = await f.user(db, "INSTRUCTOR")
    other = await f.user(db, "INSTRUCTOR")
    assert not await violates(
        db, lambda: f.submission(db, t, u, 1, status="PASSED", instructor_id=instr.id, recorded_by=instr.id)
    )
    assert await violates(
        db, lambda: f.submission(db, t, u, 2, status="NEEDS_IMPROVEMENT", instructor_id=other.id, recorded_by=instr.id)
    )
    assert await violates(db, lambda: f.submission(db, t, u, 3, status="DRAFT", recorded_by=instr.id))


async def test_submission_status_values_checked(db):
    _, _, t, u = await _base(db)
    assert await violates(db, lambda: f.submission(db, t, u, 1, status="REVIEWED"))


# --- photos --------------------------------------------------------------------------------


async def test_br08_photo_position_1_to_10_and_unique(db):
    _, _, t, u = await _base(db)
    s = await f.submission(db, t, u)

    async def photo(pos: int):
        db.add(
            SubmissionPhoto(
                submission_id=s.id,
                storage_key=f"submissions/{s.id}/{pos}.webp",
                original_filename="a.jpg",
                mime_type="image/webp",
                file_size=1,
                width=1,
                height=1,
                position=pos,
            )
        )
        await db.flush()

    for pos in range(1, 11):
        assert not await violates(db, lambda pos=pos: photo(pos))
    assert await violates(db, lambda: photo(11))
    assert await violates(db, lambda: photo(10))
    assert await violates(db, lambda: photo(0))


# --- assessments ---------------------------------------------------------------------------


async def test_br07_needs_improvement_from_instructor_requires_comment(db):
    _, _, t, u = await _base(db)
    instr = await f.user(db, "INSTRUCTOR")
    s = await f.submission(db, t, u, status="NEEDS_IMPROVEMENT", instructor_id=instr.id)
    assert await violates(db, lambda: f.assessment(db, s, "NEEDS_IMPROVEMENT", instr, comment="   "))
    assert not await violates(db, lambda: f.assessment(db, s, "NEEDS_IMPROVEMENT", instr, comment="Popraw łuk haka"))


async def test_br07_one_assessment_per_submission(db):
    _, _, t, u = await _base(db)
    instr = await f.user(db, "INSTRUCTOR")
    s = await f.submission(db, t, u, status="PASSED", instructor_id=instr.id)
    await f.assessment(db, s, "PASSED", instr)
    assert await violates(db, lambda: f.assessment(db, s, "PASSED", instr))


async def test_br13_br32_system_assessment_needs_score(db):
    _, _, t, u = await _base(db)
    s = await f.submission(db, t, u, status="PASSED")
    assert await violates(db, lambda: f.assessment(db, s, "PASSED", None))
    assert not await violates(db, lambda: f.assessment(db, s, "PASSED", None, score=80))


async def test_br32_quiz_failure_without_comment_is_allowed_for_system_assessment(db):
    _, _, t, u = await _base(db)
    s = await f.submission(db, t, u, status="NEEDS_IMPROVEMENT")
    assert not await violates(db, lambda: f.assessment(db, s, "NEEDS_IMPROVEMENT", None, score=40))


async def test_assessment_score_range(db):
    _, _, t, u = await _base(db)
    s = await f.submission(db, t, u, status="PASSED")
    assert await violates(db, lambda: f.assessment(db, s, "PASSED", None, score=120))


# --- schema hygiene ------------------------------------------------------------------------


@pytest.mark.parametrize(
    "table",
    [
        "users",
        "user_roles",
        "refresh_tokens",
        "learning_paths",
        "path_versions",
        "stages",
        "tasks",
        "task_revisions",
        "task_materials",
        "task_revision_materials",
        "task_revision_attachments",
        "quiz_questions",
        "quiz_options",
        "enrollments",
        "instructor_path_permissions",
        "instructor_stage_permissions",
        "submissions",
        "submission_photos",
        "submission_answers",
        "assessments",
        "audit_logs",
    ],
)
async def test_nfr04_table_created_by_migration(db, table):
    exists = (await db.execute(text("SELECT to_regclass(:t) IS NOT NULL"), {"t": f"public.{table}"})).scalar()
    assert exists
