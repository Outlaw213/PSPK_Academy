"""Password hashing (Argon2id) and JWTs (ADR-09, ADR-19). Never log passwords or tokens (NFR-02)."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.config import Settings

_hasher = PasswordHasher()  # argon2id with library defaults
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


# Verified against when the e-mail is unknown, so both failure paths cost the same time.
DUMMY_HASH = hash_password("not-a-real-password-just-for-timing")


def create_access_token(
    settings: Settings, user_id: uuid.UUID, token_version: int, family_id: uuid.UUID
) -> tuple[str, int]:
    """`tv` lets a password change kill old tokens (ADR-19); `fam` names the session it belongs to."""
    ttl = settings.jwt_access_token_expire_minutes * 60
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "tv": token_version,
        "fam": str(family_id),
        "type": "access",
        "iat": now,
        "exp": now + timedelta(seconds=ttl),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=ALGORITHM), ttl


def create_refresh_token(
    settings: Settings, user_id: uuid.UUID, jti: uuid.UUID, family_id: uuid.UUID
) -> tuple[str, datetime]:
    now = datetime.now(UTC)
    expires = now + timedelta(days=settings.jwt_refresh_token_expire_days)
    payload = {
        "sub": str(user_id),
        "jti": str(jti),
        "fam": str(family_id),
        "type": "refresh",
        "iat": now,
        "exp": expires,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=ALGORITHM), expires


def decode_token(settings: Settings, token: str, expected_type: str) -> dict[str, Any] | None:
    """Return the claims of a valid, unexpired token of the given type, else None."""
    try:
        claims = jwt.decode(token, settings.jwt_secret_key, algorithms=[ALGORITHM], options={"require": ["exp", "sub"]})
    except jwt.PyJWTError:
        return None
    return claims if claims.get("type") == expected_type else None
