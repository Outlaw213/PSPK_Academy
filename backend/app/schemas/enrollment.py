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


class EnrollmentOut(BaseModel):
    id: uuid.UUID
    status: str
    path_version_id: uuid.UUID
    path: PathRef
    user: UserRef
    enrolled_at: datetime
    completed_at: datetime | None
    cancelled_at: datetime | None


class EnrollmentPage(BaseModel):
    items: list[EnrollmentOut]
    total: int
    limit: int
    offset: int
