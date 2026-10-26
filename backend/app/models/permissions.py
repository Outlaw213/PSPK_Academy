import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at, uuid_pk


class InstructorPathPermission(Base):
    """Covers every stage of the version (BR-24)."""

    __tablename__ = "instructor_path_permissions"
    __table_args__ = (UniqueConstraint("instructor_id", "path_version_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    instructor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    path_version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("path_versions.id"), nullable=False)
    created_at: Mapped[datetime] = created_at()


class InstructorStagePermission(Base):
    __tablename__ = "instructor_stage_permissions"
    __table_args__ = (UniqueConstraint("instructor_id", "stage_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    instructor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    stage_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stages.id"), nullable=False)
    created_at: Mapped[datetime] = created_at()
