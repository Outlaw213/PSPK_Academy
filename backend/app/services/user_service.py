"""Accounts: admin management (FR-ADM-01) and the user state machine (docs/database.md)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.models import RefreshToken, Submission, User, UserRole
from app.schemas.user import UserCreate, UserOut, UserPage, UserUpdate
from app.services import audit_service
from app.utils.security import hash_password

ROLE_ORDER = {"PARTICIPANT": 0, "INSTRUCTOR": 1, "ADMIN": 2}


def not_found() -> AppError:
    return AppError("NOT_FOUND", "Not found.", 404)


async def roles_of(session: AsyncSession, user_id: uuid.UUID) -> list[str]:
    roles = (await session.execute(select(UserRole.role).where(UserRole.user_id == user_id))).scalars()
    return sorted(roles, key=ROLE_ORDER.__getitem__)


async def to_out(session: AsyncSession, user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        status=user.status,
        roles=await roles_of(session, user.id),
        created_at=user.created_at,
    )


async def get_by_email(session: AsyncSession, email: str) -> User | None:
    return (await session.execute(select(User).where(func.lower(User.email) == email.lower()))).scalar_one_or_none()


async def create_user(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    status: str,
    roles: list[str],
) -> User:
    """Insert a user with roles; raises EMAIL_ALREADY_EXISTS (409). Caller commits."""
    user = User(
        email=email.lower(),
        password_hash=hash_password(password),
        first_name=first_name,
        last_name=last_name,
        status=status,
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise AppError("EMAIL_ALREADY_EXISTS", "An account with this e-mail already exists.", 409) from exc
    for role in dict.fromkeys(roles):
        session.add(UserRole(user_id=user.id, role=role))
    await session.flush()
    await session.refresh(user)
    return user


async def list_users(
    session: AsyncSession, *, status: str | None, role: str | None, q: str | None, limit: int, offset: int
) -> UserPage:
    stmt = select(User)
    if status:
        stmt = stmt.where(User.status == status)
    if role:
        stmt = stmt.where(User.id.in_(select(UserRole.user_id).where(UserRole.role == role)))
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(func.lower(User.email).like(like), func.lower(User.first_name + " " + User.last_name).like(like))
        )
    total = await session.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (
        await session.execute(stmt.order_by(User.last_name, User.first_name, User.email).limit(limit).offset(offset))
    ).scalars()
    return UserPage(items=[await to_out(session, u) for u in rows], total=total or 0, limit=limit, offset=offset)


async def _get(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = await session.get(User, user_id, with_for_update=True)
    if user is None:
        raise not_found()
    return user


async def revoke_sessions(session: AsyncSession, user_id: uuid.UUID, keep_family: uuid.UUID | None = None) -> None:
    stmt = update(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
    if keep_family is not None:
        stmt = stmt.where(RefreshToken.family_id != keep_family)
    await session.execute(stmt.values(revoked_at=datetime.now(UTC)))


async def release_claims(session: AsyncSession, instructor_id: uuid.UUID, actor_id: uuid.UUID | None) -> None:
    """BR-26: an instructor who can no longer assess gives their claimed submissions back to the queue."""
    released = (
        await session.execute(
            update(Submission)
            .where(Submission.instructor_id == instructor_id, Submission.status == "UNDER_REVIEW")
            .values(status="SUBMITTED", instructor_id=None, claimed_at=None)
            .returning(Submission.id)
        )
    ).scalars()
    for sub_id in released:
        audit_service.record(
            session,
            actor_id,
            "SUBMISSION_RELEASED",
            "submission",
            sub_id,
            {"reason": "automatic", "instructor_id": str(instructor_id)},
        )


async def _transition(session: AsyncSession, actor: User, user_id: uuid.UUID, to: str, action: str) -> User:
    user = await _get(session, user_id)
    if user.status != "PENDING_APPROVAL":
        raise AppError("INVALID_STATE_TRANSITION", "Only accounts awaiting approval can be approved or rejected.", 409)
    user.status = to
    audit_service.record(session, actor.id, action, "user", user.id)
    await session.commit()
    await session.refresh(user)
    return user


async def approve(session: AsyncSession, actor: User, user_id: uuid.UUID) -> User:
    return await _transition(session, actor, user_id, "ACTIVE", "USER_APPROVED")


async def reject(session: AsyncSession, actor: User, user_id: uuid.UUID) -> User:
    return await _transition(session, actor, user_id, "REJECTED", "USER_REJECTED")


async def update_user(session: AsyncSession, actor: User, user_id: uuid.UUID, data: UserUpdate) -> User:
    user = await _get(session, user_id)
    changes: dict[str, object] = {}
    old_roles = set(await roles_of(session, user.id))

    if user.id == actor.id and (data.status == "DEACTIVATED" or (data.roles is not None and "ADMIN" not in data.roles)):
        raise AppError("CANNOT_MODIFY_SELF", "You cannot deactivate yourself or remove your own admin role.", 409)

    if data.first_name is not None:
        user.first_name = data.first_name
        changes["first_name"] = data.first_name
    if data.last_name is not None:
        user.last_name = data.last_name
        changes["last_name"] = data.last_name

    lost_instructor = False
    if data.roles is not None and set(data.roles) != old_roles:
        await session.execute(delete(UserRole).where(UserRole.user_id == user.id))
        for role in dict.fromkeys(data.roles):
            session.add(UserRole(user_id=user.id, role=role))
        changes["roles"] = sorted(set(data.roles), key=ROLE_ORDER.__getitem__)
        lost_instructor = "INSTRUCTOR" in old_roles and "INSTRUCTOR" not in data.roles

    deactivated = False
    if data.status is not None and data.status != user.status:
        if user.status not in ("ACTIVE", "DEACTIVATED"):
            raise AppError("INVALID_STATE_TRANSITION", "Approve or reject the registration first.", 409)
        user.status = data.status
        changes["status"] = data.status
        deactivated = data.status == "DEACTIVATED"
        if deactivated:
            await revoke_sessions(session, user.id)

    if lost_instructor or deactivated:
        await release_claims(session, user.id, actor.id)
    if changes:
        audit_service.record(session, actor.id, "USER_UPDATED", "user", user.id, {"changes": changes})
    await session.commit()
    await session.refresh(user)
    return user


async def set_password(session: AsyncSession, actor: User, user_id: uuid.UUID, new_password: str) -> None:
    user = await _get(session, user_id)
    user.password_hash = hash_password(new_password)
    user.token_version += 1  # ADR-19: every access token issued before dies
    await revoke_sessions(session, user.id)
    audit_service.record(session, actor.id, "USER_PASSWORD_RESET", "user", user.id)
    await session.commit()


async def admin_create(session: AsyncSession, actor: User, data: UserCreate) -> User:
    """Accounts created by an admin are ACTIVE straight away (BR-28)."""
    user = await create_user(
        session,
        email=data.email,
        password=data.password,
        first_name=data.first_name,
        last_name=data.last_name,
        status="ACTIVE",
        roles=data.roles,
    )
    audit_service.record(session, actor.id, "USER_CREATED", "user", user.id, {"roles": data.roles})
    await session.commit()
    return user
