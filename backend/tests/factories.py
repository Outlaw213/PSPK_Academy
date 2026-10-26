"""Minimal valid rows for database tests. Each helper flushes and returns the ORM object."""

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Assessment,
    Enrollment,
    LearningPath,
    PathVersion,
    Stage,
    Submission,
    Task,
    TaskRevision,
    User,
    UserRole,
)


def now() -> datetime:
    return datetime.now(UTC)


async def user(db: AsyncSession, *roles: str, email: str | None = None, status: str = "ACTIVE") -> User:
    u = User(
        email=email or f"{uuid.uuid4().hex[:10]}@example.pl",
        password_hash="argon2-placeholder",
        first_name="Jan",
        last_name="Kowalski",
        status=status,
    )
    db.add(u)
    await db.flush()
    for r in roles or ("PARTICIPANT",):
        db.add(UserRole(user_id=u.id, role=r))
    await db.flush()
    return u


async def path_version(db: AsyncSession, number: int = 1, path: LearningPath | None = None) -> PathVersion:
    if path is None:
        path = LearningPath(name="Podstawy kowalstwa", description="", is_active=True)
        db.add(path)
        await db.flush()
    v = PathVersion(learning_path_id=path.id, version_number=number, description="", is_active=True)
    db.add(v)
    await db.flush()
    return v


async def stage(db: AsyncSession, version: PathVersion, position: int = 1) -> Stage:
    s = Stage(path_version_id=version.id, name=f"Etap {position}", description="", position=position)
    db.add(s)
    await db.flush()
    return s


async def task(
    db: AsyncSession, st: Stage, position: int = 1, task_type: str = "PRACTICAL", author: User | None = None
) -> Task:
    t = Task(stage_id=st.id, position=position, is_active=True)
    db.add(t)
    await db.flush()
    author = author or await user(db, "ADMIN")
    db.add(
        TaskRevision(
            task_id=t.id,
            revision_number=1,
            name="Haczyk / zawieszka",
            task_type=task_type,
            pass_threshold=80 if task_type == "QUIZ" else None,
            expected_duration_days=14,
            created_by=author.id,
        )
    )
    await db.flush()
    return t


async def revision_of(db: AsyncSession, t: Task) -> TaskRevision:
    from sqlalchemy import select

    return (await db.execute(select(TaskRevision).where(TaskRevision.task_id == t.id))).scalars().first()


async def enrollment(db: AsyncSession, u: User, v: PathVersion, status: str = "ACTIVE") -> Enrollment:
    e = Enrollment(user_id=u.id, path_version_id=v.id, learning_path_id=v.learning_path_id, status=status)
    db.add(e)
    await db.flush()
    return e


async def submission(db: AsyncSession, t: Task, u: User, attempt: int = 1, status: str = "DRAFT", **kw) -> Submission:
    if status not in ("DRAFT", "CANCELLED"):
        kw.setdefault("task_revision_id", (await revision_of(db, t)).id)
        kw.setdefault("submitted_at", now())
    s = Submission(task_id=t.id, user_id=u.id, attempt_number=attempt, status=status, **kw)
    db.add(s)
    await db.flush()
    return s


async def assessment(
    db: AsyncSession,
    s: Submission,
    result: str,
    instructor: User | None,
    comment: str | None = None,
    score: int | None = None,
) -> Assessment:
    a = Assessment(
        submission_id=s.id,
        instructor_id=instructor.id if instructor else None,
        result=result,
        comment=comment,
        score=score,
    )
    db.add(a)
    await db.flush()
    return a
