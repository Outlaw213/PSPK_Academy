"""All ORM models; importing this package registers every table on Base.metadata (Alembic uses it)."""

from app.models.audit_log import AuditLog
from app.models.base import Base
from app.models.enrollment import Enrollment
from app.models.path import LearningPath, PathVersion, Stage
from app.models.permissions import InstructorPathPermission, InstructorStagePermission
from app.models.submission import Assessment, Submission, SubmissionAnswer, SubmissionPhoto
from app.models.task import (
    QuizOption,
    QuizQuestion,
    Task,
    TaskMaterial,
    TaskRevision,
    TaskRevisionAttachment,
    TaskRevisionMaterial,
)
from app.models.user import RefreshToken, User, UserRole

__all__ = [
    "Assessment",
    "AuditLog",
    "Base",
    "Enrollment",
    "InstructorPathPermission",
    "InstructorStagePermission",
    "LearningPath",
    "PathVersion",
    "QuizOption",
    "QuizQuestion",
    "RefreshToken",
    "Stage",
    "Submission",
    "SubmissionAnswer",
    "SubmissionPhoto",
    "Task",
    "TaskMaterial",
    "TaskRevision",
    "TaskRevisionAttachment",
    "TaskRevisionMaterial",
    "User",
    "UserRole",
]
