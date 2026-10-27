"""Learning content: paths, versions, stages, tasks and their immutable revisions (M4)."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator

from app.errors import AppError

TaskType = Literal["PRACTICAL", "THEORY", "QUIZ", "COURSE"]
DEFAULT_PASS_THRESHOLD = 80


class PathIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""


class PathOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    is_active: bool
    created_at: datetime


class PathPage(BaseModel):
    items: list[PathOut]
    total: int
    limit: int
    offset: int


class VersionIn(BaseModel):
    description: str = ""
    copy_from_version_id: uuid.UUID | None = None


class VersionUpdate(BaseModel):
    description: str | None = None
    is_active: bool | None = None


class VersionOut(BaseModel):
    id: uuid.UUID
    learning_path_id: uuid.UUID
    version_number: int
    description: str
    is_active: bool
    copied_from_version_id: uuid.UUID | None
    created_at: datetime


class PathDetail(PathOut):
    versions: list[VersionOut]


class StageIn(BaseModel):
    path_version_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    position: int | None = Field(default=None, ge=1)


class StageUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None


class StageOut(BaseModel):
    id: uuid.UUID
    path_version_id: uuid.UUID
    name: str
    description: str
    position: int


class OrderIn(BaseModel):
    ids: list[uuid.UUID]


class MoveIn(BaseModel):
    stage_id: uuid.UUID


# --- task content ----------------------------------------------------------------------------


class OptionIn(BaseModel):
    text: str = Field(min_length=1)
    is_correct: bool


class QuestionIn(BaseModel):
    text: str = Field(min_length=1)
    kind: Literal["SINGLE", "MULTI"]
    options: list[OptionIn]


class VideoLinkIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    url: HttpUrl

    @field_validator("url")
    @classmethod
    def _https_only(cls, v: HttpUrl) -> HttpUrl:
        if v.scheme != "https":  # BR-33
            raise ValueError("Video links must use https://")
        return v


def quiz_invalid(message: str) -> AppError:
    return AppError("QUIZ_INVALID", message, 422)


class TaskContent(BaseModel):
    """Full content of a task; every save becomes a new immutable revision (BR-19)."""

    name: str = Field(min_length=1, max_length=200)
    task_type: TaskType
    description: str | None = None
    instructions: str | None = None
    content_md: str | None = None
    assignment: str | None = None
    evaluation_criteria: str | None = None
    submission_requirements: str | None = None
    material: str | None = None
    quantity_description: str | None = Field(default=None, max_length=200)
    expected_duration_days: int | None = Field(default=None, ge=1)
    estimated_minutes: int | None = Field(default=None, ge=1)
    difficulty: int | None = Field(default=None, ge=1, le=5)
    pass_threshold: int | None = None
    questions: list[QuestionIn] = []
    video_links: list[VideoLinkIn] = []

    @model_validator(mode="after")
    def _quiz_rules(self) -> "TaskContent":
        """BR-35. Non-quiz tasks carry no questions or threshold."""
        if self.task_type != "QUIZ":
            self.questions, self.pass_threshold = [], None
            return self
        if self.pass_threshold is None:
            self.pass_threshold = DEFAULT_PASS_THRESHOLD
        if not 1 <= self.pass_threshold <= 100:
            raise quiz_invalid("Pass threshold must be between 1 and 100.")
        if not self.questions:
            raise quiz_invalid("A quiz needs at least one question.")
        for n, q in enumerate(self.questions, 1):
            correct = sum(o.is_correct for o in q.options)
            if len(q.options) < 2:
                raise quiz_invalid(f"Question {n} needs at least two answers.")
            if correct == 0:
                raise quiz_invalid(f"Question {n} needs a correct answer.")
            if q.kind == "SINGLE" and correct != 1:
                raise quiz_invalid(f"Question {n} allows one answer, so exactly one must be correct.")
        return self


class TaskCreate(TaskContent):
    stage_id: uuid.UUID
    position: int | None = Field(default=None, ge=1)


class OptionOut(BaseModel):
    id: uuid.UUID
    position: int
    text: str
    is_correct: bool


class QuestionOut(BaseModel):
    id: uuid.UUID
    position: int
    text: str
    kind: str
    options: list[OptionOut]


class VideoLinkOut(BaseModel):
    id: uuid.UUID
    position: int
    title: str
    url: str


class RevisionOut(BaseModel):
    id: uuid.UUID
    revision_number: int
    created_at: datetime
    created_by: uuid.UUID
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
    questions: list[QuestionOut]
    video_links: list[VideoLinkOut]


class TaskOut(BaseModel):
    id: uuid.UUID
    stage_id: uuid.UUID
    position: int
    is_active: bool
    label: str | None  # E{stage}.{n} among active tasks (BR-34); None when deactivated
    revision: RevisionOut


class StageDetail(StageOut):
    tasks: list[TaskOut]


class VersionDetail(VersionOut):
    path_name: str
    stages: list[StageDetail]
