import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at, enum_check, updated_at, uuid_pk
from app.models.enums import ROLES, USER_STATUSES


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        enum_check("status", USER_STATUSES),
        Index("uq_users_email_lower", text("lower(email)"), unique=True),  # FR-AUTH-01
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="PENDING_APPROVAL")
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")  # ADR-19
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()


class UserRole(Base):
    """A user can hold several roles; access is the union (BR-27, Q-16)."""

    __tablename__ = "user_roles"
    __table_args__ = (enum_check("role", ROLES),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(20), primary_key=True)


class RefreshToken(Base):
    """Rotating refresh tokens grouped in families (sessions) — ADR-09."""

    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = uuid_pk()  # = jti
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    family_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at()
