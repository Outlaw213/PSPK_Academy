import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String, Text, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at, updated_at, uuid_pk


class LearningPath(Base):
    __tablename__ = "learning_paths"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()


class PathVersion(Base):
    __tablename__ = "path_versions"
    __table_args__ = (
        UniqueConstraint("learning_path_id", "version_number"),
        # Target for enrollments' composite FK, so an enrollment's path always matches its version.
        UniqueConstraint("id", "learning_path_id"),
        CheckConstraint("version_number >= 1", name="version_number_positive"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    learning_path_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("learning_paths.id"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    # Accepts new enrollments; a new version starts inactive.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=false())
    copied_from_version_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("path_versions.id"))
    created_at: Mapped[datetime] = created_at()


class Stage(Base):
    __tablename__ = "stages"
    __table_args__ = (
        UniqueConstraint("path_version_id", "position", deferrable=True, initially="DEFERRED"),  # ADR-15
        CheckConstraint("position >= 1", name="position_positive"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    path_version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("path_versions.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()
