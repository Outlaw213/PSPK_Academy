import uuid
from datetime import datetime

from pydantic import BaseModel


class EnrollmentIn(BaseModel):
    user_id: uuid.UUID
    path_version_id: uuid.UUID


class PathRef(BaseModel):
    id: uuid.UUID
    name: str
    version: int


class UserRef(BaseModel):
    id: uuid.UUID
    email: str
    first_name: str
    last_name: str


class Progress(BaseModel):
    completed: int
    total: int


class EnrollmentOut(BaseModel):
    id: uuid.UUID
    status: str
    path_version_id: uuid.UUID
    path: PathRef
    user: UserRef
    enrolled_at: datetime
    completed_at: datetime | None
    cancelled_at: datetime | None
    progress: Progress  # computed by task_service, like the participant's own view


class EnrollmentPage(BaseModel):
    items: list[EnrollmentOut]
    total: int
    limit: int
    offset: int
