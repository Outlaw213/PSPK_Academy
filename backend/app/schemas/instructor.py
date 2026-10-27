import uuid
from typing import Literal

from pydantic import BaseModel

from app.schemas.content import RevisionOut
from app.schemas.submission import SubmissionOut


class QueueItem(BaseModel):
    submission: SubmissionOut
    participant: dict
    task: dict  # {id, label, name, task_type}; name/type from the revision the attempt was sent against
    stage: dict
    path: dict
    photo_count: int


class ReviewDetail(QueueItem):
    revision: RevisionOut  # instructors see the full revision, criteria included
    previous_attempts: list[SubmissionOut]


class PermissionIn(BaseModel):
    instructor_id: uuid.UUID
    path_version_id: uuid.UUID | None = None
    stage_id: uuid.UUID | None = None


QueueStatus = Literal["SUBMITTED", "UNDER_REVIEW"]
