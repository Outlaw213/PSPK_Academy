"""Participant views (FR-PAR-01, FR-PAR-02). Statuses come from task_service only."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.enrollment import PathRef


class Progress(BaseModel):
    completed: int
    total: int


class MyPath(BaseModel):
    id: uuid.UUID
    status: str
    path_version_id: uuid.UUID
    path: PathRef
    enrolled_at: datetime
    completed_at: datetime | None
    progress: Progress


class TaskItem(BaseModel):
    id: uuid.UUID
    label: str
    name: str
    task_type: str
    position: int


class TaskItemWithStatus(TaskItem):
    status: str


class StageItem(BaseModel):
    id: uuid.UUID
    name: str
    position: int
    tasks: list[TaskItem]


class StageProgress(BaseModel):
    id: uuid.UUID
    name: str
    position: int
    gate_open: bool
    tasks: list[TaskItemWithStatus]


class PathStructure(BaseModel):
    path: PathRef
    enrollment_status: str
    stages: list[StageItem]


class PathProgress(BaseModel):
    path: PathRef
    enrollment_status: str
    progress: Progress
    stages: list[StageProgress]


class PublicOption(BaseModel):
    """An answer option without the key (BR-32)."""

    id: uuid.UUID
    position: int
    text: str


class PublicQuestion(BaseModel):
    id: uuid.UUID
    position: int
    text: str
    kind: str
    options: list[PublicOption]


class PublicVideoLink(BaseModel):
    id: uuid.UUID
    position: int
    title: str
    url: str


class PublicRevision(BaseModel):
    id: uuid.UUID
    revision_number: int
    name: str
    task_type: str
    description: str | None
    instructions: str | None
    content_md: str | None
    assignment: str | None
    evaluation_criteria: str | None
    submission_requirements: str | None
    material: str | None
    quantity_description: str | None
    expected_duration_days: int | None
    estimated_minutes: int | None
    difficulty: int | None
    pass_threshold: int | None
    questions: list[PublicQuestion]
    video_links: list[PublicVideoLink]


class StageRef(BaseModel):
    id: uuid.UUID
    name: str
    position: int


class TaskDetail(BaseModel):
    id: uuid.UUID
    label: str
    stage: StageRef
    status: str
    revision: PublicRevision
