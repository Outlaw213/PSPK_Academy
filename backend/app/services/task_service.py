"""Task statuses and labels — the single place of this logic (constitution p. 4, docs/business-rules.md §2).

Everything is derived from what the admin arranged: stage and task positions, task types and
`is_active` (Q-63). Nothing about the programme is hard-coded, so any admin change takes effect
on the next read (BR-16).
"""

import uuid
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Enrollment, Stage, Submission, Task, TaskRevision

OPEN_STATUS_DISPLAY = {"DRAFT": "IN_PROGRESS", "SUBMITTED": "SUBMITTED", "UNDER_REVIEW": "UNDER_REVIEW"}
STARTABLE = ("AVAILABLE", "NEEDS_IMPROVEMENT")


def task_label(stage_position: int, active_index: int) -> str:
    """BR-34: E{stage}.{n}, n counting active tasks of the stage in order. The only place labels are made."""
    return f"E{stage_position}.{active_index}"


@dataclass
class TaskState:
    task_id: uuid.UUID
    stage_id: uuid.UUID
    position: int
    label: str
    task_type: str
    name: str
    status: str
    visible_revision_id: uuid.UUID  # revision of the PASSED attempt, else the current one (BR-19)
    previous_task_id: uuid.UUID | None  # previous non-course active task in the stage (BR-02)


@dataclass
class StageState:
    stage_id: uuid.UUID
    name: str
    position: int
    gate_open: bool  # all active tasks of earlier stages passed (BR-31)
    tasks: list[TaskState] = field(default_factory=list)


@dataclass
class PathState:
    enrollment: Enrollment
    stages: list[StageState]

    @property
    def tasks(self) -> list[TaskState]:
        return [t for s in self.stages for t in s.tasks]

    @property
    def total(self) -> int:
        return len(self.tasks)

    @property
    def completed(self) -> int:
        return sum(t.status == "PASSED" for t in self.tasks)

    def task(self, task_id: uuid.UUID) -> TaskState | None:
        return next((t for t in self.tasks if t.task_id == task_id), None)


async def compute_path_statuses(session: AsyncSession, enrollment: Enrollment) -> PathState:
    """Statuses of every active task of the enrollment's version in a constant number of queries."""
    stages = (
        (
            await session.execute(
                select(Stage).where(Stage.path_version_id == enrollment.path_version_id).order_by(Stage.position)
            )
        )
        .scalars()
        .all()
    )
    stage_ids = [s.id for s in stages]
    tasks = (
        (
            await session.execute(
                select(Task).where(Task.stage_id.in_(stage_ids), Task.is_active).order_by(Task.position)
            )
        )
        .scalars()
        .all()
    )
    task_ids = [t.id for t in tasks]

    # Current revision per task (highest revision_number, ADR-14).
    latest = (
        select(TaskRevision.task_id, func.max(TaskRevision.revision_number).label("n"))
        .where(TaskRevision.task_id.in_(task_ids))
        .group_by(TaskRevision.task_id)
        .subquery()
    )
    current = {
        row.task_id: row
        for row in (
            await session.execute(
                select(TaskRevision.id, TaskRevision.task_id, TaskRevision.name, TaskRevision.task_type).join(
                    latest, (TaskRevision.task_id == latest.c.task_id) & (TaskRevision.revision_number == latest.c.n)
                )
            )
        ).all()
    }

    # The participant's attempts on these tasks, newest first; CANCELLED ones never count.
    attempts = (
        await session.execute(
            select(Submission.task_id, Submission.status, Submission.task_revision_id)
            .where(
                Submission.user_id == enrollment.user_id,
                Submission.task_id.in_(task_ids),
                Submission.status != "CANCELLED",
            )
            .order_by(Submission.attempt_number.desc())
        )
    ).all()
    latest_status: dict[uuid.UUID, str] = {}
    passed_revision: dict[uuid.UUID, uuid.UUID | None] = {}
    for a in attempts:
        latest_status.setdefault(a.task_id, a.status)
        if a.status == "PASSED":
            passed_revision[a.task_id] = a.task_revision_id

    # Names and types follow the visible revision: what the participant passed on, else current.
    passed_rev_ids = [r for r in passed_revision.values() if r]
    passed_revs = {
        r.id: r
        for r in (
            await session.execute(
                select(TaskRevision.id, TaskRevision.name, TaskRevision.task_type).where(
                    TaskRevision.id.in_(passed_rev_ids)
                )
            )
        ).all()
    }

    by_stage: dict[uuid.UUID, list[Task]] = {s.id: [] for s in stages}
    for t in tasks:
        by_stage[t.stage_id].append(t)

    active_enrollment = enrollment.status == "ACTIVE"
    result: list[StageState] = []
    gate_open = True
    for st in stages:
        stage_tasks = by_stage[st.id]
        if not stage_tasks:
            continue  # BR-01: stages without active tasks are not shown
        state = StageState(stage_id=st.id, name=st.name, position=st.position, gate_open=gate_open)
        prev_work: Task | None = None
        for n, t in enumerate(stage_tasks, 1):
            cur = current[t.id]
            visible = passed_revs.get(passed_revision.get(t.id)) or cur
            is_course = cur.task_type == "COURSE"  # task type comes from the current revision (BR-22)
            prev_passed = prev_work is None or prev_work.id in passed_revision
            status = _status(
                passed=t.id in passed_revision,
                latest=latest_status.get(t.id),
                enrollment_active=active_enrollment,
                gate_open=gate_open,
                order_ok=is_course or prev_passed,
            )
            state.tasks.append(
                TaskState(
                    task_id=t.id,
                    stage_id=st.id,
                    position=t.position,
                    label=task_label(st.position, n),
                    task_type=visible.task_type,
                    name=visible.name,
                    status=status,
                    visible_revision_id=visible.id,
                    previous_task_id=None if is_course else (prev_work.id if prev_work else None),
                )
            )
            if not is_course:
                prev_work = t
        result.append(state)
        gate_open = gate_open and all(t.status == "PASSED" for t in state.tasks)
    return PathState(enrollment=enrollment, stages=result)


def _status(*, passed: bool, latest: str | None, enrollment_active: bool, gate_open: bool, order_ok: bool) -> str:
    """docs/business-rules.md §2, in that order. An open attempt is shown before any lock (Q-40)."""
    if passed:
        return "PASSED"
    if latest in OPEN_STATUS_DISPLAY:
        return OPEN_STATUS_DISPLAY[latest]
    if not enrollment_active:
        return "LOCKED"  # Q-39
    if not gate_open or not order_ok:
        return "LOCKED"  # BR-31, BR-02
    if latest == "NEEDS_IMPROVEMENT":
        return "NEEDS_IMPROVEMENT"
    return "AVAILABLE"


def get_previous_task(state: PathState, task_id: uuid.UUID) -> uuid.UUID | None:
    """The task that must be PASSED before this one within its stage (§9); None for the first or a course."""
    t = state.task(task_id)
    return t.previous_task_id if t else None


def is_task_available(state: PathState, task_id: uuid.UUID) -> bool:
    """A new attempt may start (spec §8): the task is active, in order and not passed or pending."""
    t = state.task(task_id)
    return t is not None and t.status in STARTABLE


def in_order(state: PathState, task_id: uuid.UUID) -> bool:
    """The order allows working on the task now: active enrollment, open stage gate and the
    previous work passed. Unlike the displayed status, an own open attempt does not matter here,
    so a draft can be sent only while the task is still in order (BR-21)."""
    t = state.task(task_id)
    if t is None or state.enrollment.status != "ACTIVE":
        return False
    stage = next(s for s in state.stages if s.stage_id == t.stage_id)
    if not stage.gate_open:
        return False
    prev = state.task(t.previous_task_id) if t.previous_task_id else None
    return prev is None or prev.status == "PASSED"
