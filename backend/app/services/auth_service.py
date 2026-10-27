"""Registration, login and sessions (FR-AUTH-01…07, ADR-09, ADR-19)."""

import uuid
from datetime import UTC, datetime
from typing import NamedTuple

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import AppError
from app.models import RefreshToken, User
from app.schemas.auth import RegisterIn
from app.services import audit_service, user_service
from app.utils.security import (
    DUMMY_HASH,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


class Tokens(NamedTuple):
    access_token: str
    expires_in: int
    refresh_token: str
    refresh_expires: datetime


def invalid_credentials() -> AppError:
    return AppError("INVALID_CREDENTIALS", "Invalid e-mail or password.", 401)


def invalid_token() -> AppError:
    return AppError("INVALID_TOKEN", "Invalid or expired token.", 401)


def ensure_active(user: User) -> None:
    """BR-28: only ACTIVE accounts may use the system, checked on every login, refresh and request."""
    if user.status == "PENDING_APPROVAL":
        raise AppError("ACCOUNT_PENDING_APPROVAL", "Your account is waiting for approval by an administrator.", 403)
    if user.status != "ACTIVE":
        raise AppError("ACCOUNT_INACTIVE", "This account is inactive.", 403)


async def register(session: AsyncSession, data: RegisterIn) -> User:
    user = await user_service.create_user(
        session,
        email=data.email,
        password=data.password,
        first_name=data.first_name,
        last_name=data.last_name,
        status="PENDING_APPROVAL",
        roles=["PARTICIPANT"],
    )
    audit_service.record(session, user.id, "USER_REGISTERED", "user", user.id)
    await session.commit()
    return user


async def _issue(session: AsyncSession, settings: Settings, user: User, family_id: uuid.UUID) -> Tokens:
    jti = uuid.uuid4()
    refresh, expires = create_refresh_token(settings, user.id, jti, family_id)
    session.add(RefreshToken(id=jti, user_id=user.id, family_id=family_id, expires_at=expires))
    access, ttl = create_access_token(settings, user.id, user.token_version, family_id)
    return Tokens(access, ttl, refresh, expires)


async def login(session: AsyncSession, settings: Settings, email: str, password: str) -> Tokens:
    user = await user_service.get_by_email(session, email)
    if user is None:
        verify_password(DUMMY_HASH, password)  # same cost as a real check: no user enumeration by timing
        raise invalid_credentials()
    if not verify_password(user.password_hash, password):
        raise invalid_credentials()
    ensure_active(user)
    tokens = await _issue(session, settings, user, family_id=uuid.uuid4())
    audit_service.record(session, user.id, "USER_LOGIN", "user", user.id)
    await session.commit()
    return tokens


async def refresh(session: AsyncSession, settings: Settings, token: str | None) -> Tokens:
    claims = decode_token(settings, token or "", "refresh")
    if claims is None:
        raise invalid_token()
    row = await session.get(RefreshToken, uuid.UUID(claims["jti"]), with_for_update=True)
    if row is None or row.revoked_at is not None:
        raise invalid_token()
    if row.used_at is not None:
        # A spent token came back: someone holds a copy. End the whole session (ADR-09).
        await revoke_family(session, row.family_id)
        await session.commit()
        raise invalid_token()
    user = await session.get(User, row.user_id)
    if user is None:
        raise invalid_token()
    ensure_active(user)
    row.used_at = datetime.now(UTC)
    tokens = await _issue(session, settings, user, row.family_id)
    await session.commit()
    return tokens


async def revoke_family(session: AsyncSession, family_id: uuid.UUID) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


async def logout(session: AsyncSession, settings: Settings, token: str | None) -> None:
    """Idempotent: an unknown or broken token is simply ignored."""
    claims = decode_token(settings, token or "", "refresh")
    if claims is None:
        return
    await revoke_family(session, uuid.UUID(claims["fam"]))
    await session.commit()


async def change_password(
    session: AsyncSession, settings: Settings, user: User, family_id: uuid.UUID, current: str, new: str
) -> tuple[str, int]:
    """FR-AUTH-07: other sessions end; the current one continues with a new access token."""
    if not verify_password(user.password_hash, current):
        raise invalid_credentials()
    user = await session.get(User, user.id, with_for_update=True)
    user.password_hash = hash_password(new)
    user.token_version += 1
    await user_service.revoke_sessions(session, user.id, keep_family=family_id)
    audit_service.record(session, user.id, "USER_PASSWORD_CHANGED", "user", user.id)
    await session.commit()
    return create_access_token(settings, user.id, user.token_version, family_id)
