import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at, enum_check, updated_at, uuid_pk
from app.models.enums import ASSESSMENT_RESULTS, SUBMISSION_STATUSES


class Submission(Base):
    """One attempt; never overwritten or deleted (BR-04)."""

    __tablename__ = "submissions"
    __table_args__ = (
        UniqueConstraint("task_id", "user_id", "attempt_number"),
        enum_check("status", SUBMISSION_STATUSES),
        CheckConstraint("attempt_number >= 1", name="attempt_number_positive"),
        CheckConstraint("instructor_id IS NULL OR instructor_id <> user_id", name="no_self_assessment"),  # BR-25
        CheckConstraint("status <> 'UNDER_REVIEW' OR instructor_id IS NOT NULL", name="under_review_has_instructor"),
        CheckConstraint(  # BR-19
            "status IN ('DRAFT', 'CANCELLED') OR (task_revision_id IS NOT NULL AND submitted_at IS NOT NULL)",
            name="sent_has_revision",
        ),
        CheckConstraint(  # BR-30
            "recorded_by IS NULL OR (status IN ('PASSED', 'NEEDS_IMPROVEMENT') AND instructor_id = recorded_by)",
            name="course_result_recorded",
        ),
        # BR-14: one open attempt per task and participant.
        Index(
            "uq_submissions_one_open",
            "task_id",
            "user_id",
            unique=True,
            postgresql_where=text("status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW')"),
        ),
        # BR-05: a single PASSED per task and participant.
        Index(
            "uq_submissions_one_passed", "task_id", "user_id", unique=True, postgresql_where=text("status = 'PASSED'")
        ),
        Index("ix_submissions_user_id_task_id", "user_id", "task_id"),
        Index("ix_submissions_status", "status"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="DRAFT")
    comment: Mapped[str | None] = mapped_column(Text)
    task_revision_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("task_revisions.id"))
    instructor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    assessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()


class SubmissionPhoto(Base):
    __tablename__ = "submission_photos"
    __table_args__ = (
        UniqueConstraint("submission_id", "position"),
        CheckConstraint("position BETWEEN 1 AND 10", name="position_range"),  # BR-08, hard limit
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = created_at()


class SubmissionAnswer(Base):
    """Quiz answers of one attempt (BR-32)."""

    __tablename__ = "submission_answers"

    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"), primary_key=True)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("quiz_questions.id"), primary_key=True)
    option_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), nullable=False)


class Assessment(Base):
    """Final verdict of a submission. instructor_id NULL = system grading of a quiz (BR-13, BR-32)."""

    __tablename__ = "assessments"
    __table_args__ = (
        UniqueConstraint("submission_id"),
        enum_check("result", ASSESSMENT_RESULTS),
        CheckConstraint("instructor_id IS NOT NULL OR score IS NOT NULL", name="system_has_score"),
        CheckConstraint("score IS NULL OR score BETWEEN 0 AND 100", name="score_range"),
        CheckConstraint(  # BR-07
            "result <> 'NEEDS_IMPROVEMENT' OR instructor_id IS NULL OR length(btrim(coalesce(comment, ''))) > 0",
            name="needs_improvement_has_comment",
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"), nullable=False)
    instructor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    result: Mapped[str] = mapped_column(String(20), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    score: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = created_at()
