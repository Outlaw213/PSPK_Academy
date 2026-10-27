import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.participant import PublicRevision


class DraftIn(BaseModel):
    comment: str | None = Field(default=None, max_length=5000)


class CommentIn(BaseModel):
    comment: str | None = Field(default=None, max_length=5000)


class PhotoOut(BaseModel):
    id: uuid.UUID
    position: int
    mime_type: str
    file_size: int
    width: int
    height: int


class PersonRef(BaseModel):
    first_name: str
    last_name: str


class AssessmentOut(BaseModel):
    result: str
    comment: str | None
    score: int | None
    instructor: PersonRef | None  # None = system grading of a quiz (BR-32)
    created_at: datetime


class SubmissionOut(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    attempt_number: int
    status: str
    comment: str | None
    task_revision_id: uuid.UUID | None
    submitted_at: datetime | None
    claimed_at: datetime | None
    assessed_at: datetime | None
    cancelled_at: datetime | None
    created_at: datetime
    photos: list[PhotoOut]
    assessment: AssessmentOut | None


class SubmissionDetail(SubmissionOut):
    revision: PublicRevision | None


class QuizAnswer(BaseModel):
    question_id: uuid.UUID
    option_ids: list[uuid.UUID]


class QuizAttemptIn(BaseModel):
    answers: list[QuizAnswer]


class QuizReview(BaseModel):
    question_id: uuid.UUID
    option_ids: list[uuid.UUID]
    correct_option_ids: list[uuid.UUID]


class QuizResult(BaseModel):
    submission: SubmissionOut
    score: int
    correct: int
    total: int
    passed: bool
    review: list[QuizReview] | None  # the key is shown only after a pass (BR-32)


AssessmentResult = Literal["PASSED", "NEEDS_IMPROVEMENT"]


class AssessmentIn(BaseModel):
    result: AssessmentResult
    comment: str | None = Field(default=None, max_length=5000)


class CourseResultIn(AssessmentIn):
    user_id: uuid.UUID


class AssessedOut(BaseModel):
    submission: SubmissionOut


class MySubmission(BaseModel):
    submission: SubmissionOut
    task: dict  # {id, label, name, task_type}; name/type of the revision the attempt was sent against
    stage: dict
    path: dict


class MySubmissionPage(BaseModel):
    items: list[MySubmission]
    total: int
    limit: int
    offset: int
