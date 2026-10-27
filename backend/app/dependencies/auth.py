"""Authentication and role dependencies (FR-AUTH-06). Roles are a set; access is their union (BR-27)."""

import uuid
from dataclasses import dataclass

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.errors import AppError
from app.models import User
from app.services.auth_service import ensure_active, invalid_token
from app.services.user_service import roles_of
from app.utils.security import decode_token


@dataclass
class CurrentUser:
    user: User
    roles: frozenset[str]
    family_id: uuid.UUID

    @property
    def id(self) -> uuid.UUID:
        return self.user.id


async def require_authenticated_user(request: Request, session: AsyncSession = Depends(get_session)) -> CurrentUser:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AppError("UNAUTHENTICATED", "Authentication required.", 401)
    claims = decode_token(request.app.state.settings, token, "access")
    if claims is None:
        raise invalid_token()
    try:
        user = await session.get(User, uuid.UUID(claims["sub"]))
        family_id = uuid.UUID(claims["fam"])
    except (KeyError, ValueError):
        raise invalid_token() from None
    if user is None or claims.get("tv") != user.token_version:
        raise invalid_token()
    ensure_active(user)  # deactivation cuts access immediately, even with a valid token (BR-28)
    return CurrentUser(user=user, roles=frozenset(await roles_of(session, user.id)), family_id=family_id)


def require_role(*roles: str):
    async def dependency(current: CurrentUser = Depends(require_authenticated_user)) -> CurrentUser:
        if not current.roles.intersection(roles):
            raise AppError("FORBIDDEN", "You do not have access to this resource.", 403)
        return current

    dependency.__name__ = f"require_role_{'_'.join(roles).lower()}"
    return dependency


require_admin = require_role("ADMIN")
require_instructor = require_role("INSTRUCTOR")
require_participant = require_role("PARTICIPANT")
