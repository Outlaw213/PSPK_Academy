import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


def record(
    session: AsyncSession,
    actor_id: uuid.UUID | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None,
    meta: dict[str, Any] | None = None,
) -> None:
    """Add an audit entry to the caller's transaction (BR-18). Never put secrets in `meta`."""
    session.add(
        AuditLog(user_id=actor_id, action=action, entity_type=entity_type, entity_id=entity_id, meta=meta or {})
    )
