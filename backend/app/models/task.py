import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at, enum_check, updated_at, uuid_pk
from app.models.enums import ATTACHMENT_KINDS, QUESTION_KINDS, TASK_TYPES


class Task(Base):
    """Position and activity only; content lives in immutable revisions (ADR-14)."""

    __tablename__ = "tasks"
    __table_args__ = (
        UniqueConstraint("stage_id", "position", deferrable=True, initially="DEFERRED"),  # ADR-15
        CheckConstraint("position >= 1", name="position_positive"),
        Index("ix_tasks_stage_id_active", "stage_id", postgresql_where=text("is_active")),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    stage_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stages.id"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()


class TaskRevision(Base):
    """Immutable snapshot of a task's content (BR-19, Q-06). Current = highest revision_number."""

    __tablename__ = "task_revisions"
    __table_args__ = (
        UniqueConstraint("task_id", "revision_number"),
        enum_check("task_type", TASK_TYPES),
        CheckConstraint("revision_number >= 1", name="revision_number_positive"),
        CheckConstraint("difficulty IS NULL OR difficulty BETWEEN 1 AND 5", name="difficulty_range"),
        CheckConstraint("pass_threshold IS NULL OR pass_threshold BETWEEN 1 AND 100", name="pass_threshold_range"),
        CheckConstraint("expected_duration_days IS NULL OR expected_duration_days >= 1", name="duration_positive"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    task_type: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    instructions: Mapped[str | None] = mapped_column(Text)
    content_md: Mapped[str | None] = mapped_column(Text)  # Q-62
    assignment: Mapped[str | None] = mapped_column(Text)
    evaluation_criteria: Mapped[str | None] = mapped_column(Text)
    submission_requirements: Mapped[str | None] = mapped_column(Text)
    material: Mapped[str | None] = mapped_column(Text)
    quantity_description: Mapped[str | None] = mapped_column(String(200))
    expected_duration_days: Mapped[int | None] = mapped_column(Integer)
    estimated_minutes: Mapped[int | None] = mapped_column(Integer)
    difficulty: Mapped[int | None] = mapped_column(Integer)
    pass_threshold: Mapped[int | None] = mapped_column(Integer)  # QUIZ only, Q-60
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = created_at()


class TaskMaterial(Base):
    """Reference photo file of a task; the file itself never changes (Q-19)."""

    __tablename__ = "task_materials"

    id: Mapped[uuid.UUID] = uuid_pk()
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = created_at()


class TaskRevisionMaterial(Base):
    """Ordered reference photos of a revision, with captions (Q-43)."""

    __tablename__ = "task_revision_materials"
    __table_args__ = (UniqueConstraint("revision_id", "position"),)

    revision_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("task_revisions.id"), primary_key=True)
    material_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("task_materials.id"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    caption: Mapped[str | None] = mapped_column(String(300))


class TaskRevisionAttachment(Base):
    """PDF file or https video link belonging to a revision (BR-33, Q-62)."""

    __tablename__ = "task_revision_attachments"
    __table_args__ = (
        UniqueConstraint("revision_id", "position"),
        enum_check("kind", ATTACHMENT_KINDS),
        CheckConstraint(
            "(kind = 'PDF' AND storage_key IS NOT NULL AND url IS NULL)"
            " OR (kind = 'VIDEO_LINK' AND url LIKE 'https://%' AND storage_key IS NULL)",
            name="payload_matches_kind",
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    revision_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("task_revisions.id"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    storage_key: Mapped[str | None] = mapped_column(String(500))
    url: Mapped[str | None] = mapped_column(String(2000))
    file_size: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = created_at()


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"
    __table_args__ = (UniqueConstraint("revision_id", "position"), enum_check("kind", QUESTION_KINDS))

    id: Mapped[uuid.UUID] = uuid_pk()
    revision_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("task_revisions.id"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)


class QuizOption(Base):
    """Answer option; `is_correct` is the admin's key and never leaves the backend before a pass (BR-32)."""

    __tablename__ = "quiz_options"
    __table_args__ = (UniqueConstraint("question_id", "position"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("quiz_questions.id"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
