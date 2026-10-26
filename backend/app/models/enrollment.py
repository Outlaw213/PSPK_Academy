import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, ForeignKeyConstraint, Index, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, enum_check, uuid_pk
from app.models.enums import ENROLLMENT_STATUSES


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("user_id", "path_version_id"),
        enum_check("status", ENROLLMENT_STATUSES),
        # learning_path_id is a copy of the version's path, kept honest by a composite FK.
        ForeignKeyConstraint(
            ["path_version_id", "learning_path_id"],
            ["path_versions.id", "path_versions.learning_path_id"],
            name="fk_enrollments_version_path",
        ),
        # At most one ACTIVE enrollment per learning path (BR-12, Q-14).
        Index(
            "uq_enrollments_one_active_per_path",
            "user_id",
            "learning_path_id",
            unique=True,
            postgresql_where=text("status = 'ACTIVE'"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    path_version_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    learning_path_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("learning_paths.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="ACTIVE")
    enrolled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
