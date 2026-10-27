"""Admin read-only views (FR-ADM-05, FR-ADM-06)."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.content import RevisionOut
from app.schemas.instructor import QueueItem
from app.schemas.submission import SubmissionOut


class AdminSubmissionItem(QueueItem):
    """Queue item plus the participant's e-mail."""


class AdminSubmissionPage(BaseModel):
    items: list[AdminSubmissionItem]
    total: int
    limit: int
    offset: int


class AdminSubmissionDetail(AdminSubmissionItem):
    revision: RevisionOut  # the revision it was sent against (current one for drafts), criteria included
    attempts: list[SubmissionOut]  # every attempt of the participant for this task, newest first


class AuditItem(BaseModel):
    id: uuid.UUID
    created_at: datetime
    action: str
    entity_type: str
    entity_id: uuid.UUID | None
    user: dict | None  # None = done by the system
    metadata: dict


class AuditPage(BaseModel):
    items: list[AuditItem]
    total: int
    limit: int
    offset: int
