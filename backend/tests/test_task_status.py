"""M5: task statuses — the single place of truth (task_service, docs/business-rules.md §2).

Everything here derives from what the admin set up: stage/task positions, task types and activity.
"""

from sqlalchemy import event, update

from app.models import Task
from app.services import task_service
from tests import factories as f


class Path:
    """A version built from a compact spec: [[("P", "Gwóźdź"), ("K", "Podkowa")], [...]] per stage."""

    TYPES = {"P": "PRACTICAL", "K": "COURSE", "T": "THEORY", "Q": "QUIZ"}

    @classmethod
    async def build(cls, db, spec, enrollment_status="ACTIVE"):
        self = cls()
        self.db = db
        self.version = await f.path_version(db)
        self.tasks: dict[str, Task] = {}
        self.stages = []
        for sp, items in enumerate(spec, 1):
            st = await f.stage(db, self.version, sp)
            self.stages.append(st)
            for tp, (kind, name) in enumerate(items, 1):
                self.tasks[name] = await f.task(db, st, tp, task_type=cls.TYPES[kind])
        self.user = await f.user(db, "PARTICIPANT")
        self.enrollment = await f.enrollment(db, self.user, self.version, status=enrollment_status)
        self.attempts: dict[str, int] = {}
        return self

    async def attempt(self, name, status, **kw):
        n = self.attempts[name] = self.attempts.get(name, 0) + 1
        if status in ("UNDER_REVIEW", "PASSED", "NEEDS_IMPROVEMENT") and "instructor_id" not in kw:
            kw["instructor_id"] = (await f.user(self.db, "INSTRUCTOR")).id
        return await f.submission(self.db, self.tasks[name], self.user, n, status=status, **kw)

    async def passed(self, *names):
        for n in names:
            await self.attempt(n, "PASSED")

    async def statuses(self) -> dict[str, str]:
        state = await task_service.compute_path_statuses(self.db, self.enrollment)
        by_id = {t.id: name for name, t in self.tasks.items()}
        return {by_id[t.task_id]: t.status for st in state.stages for t in st.tasks}


ONE_STAGE = [[("P", "Gwóźdź"), ("P", "Haczyk"), ("P", "Serce")]]


async def test_test1_first_task_available(db):
    p = await Path.build(db, ONE_STAGE)
    assert (await p.statuses())["Gwóźdź"] == "AVAILABLE"


async def test_test2_next_tasks_locked(db):
    p = await Path.build(db, ONE_STAGE)
    assert await p.statuses() == {"Gwóźdź": "AVAILABLE", "Haczyk": "LOCKED", "Serce": "LOCKED"}


async def test_br02_pass_unlocks_next(db):
    p = await Path.build(db, ONE_STAGE)
    await p.passed("Gwóźdź")
    assert await p.statuses() == {"Gwóźdź": "PASSED", "Haczyk": "AVAILABLE", "Serce": "LOCKED"}


async def test_br02_needs_improvement_does_not_unlock(db):
    p = await Path.build(db, ONE_STAGE)
    await p.attempt("Gwóźdź", "NEEDS_IMPROVEMENT")
    assert await p.statuses() == {"Gwóźdź": "NEEDS_IMPROVEMENT", "Haczyk": "LOCKED", "Serce": "LOCKED"}


async def test_q40_open_attempt_shown_with_its_status(db):
    p = await Path.build(db, ONE_STAGE)
    await p.attempt("Gwóźdź", "DRAFT")
    assert (await p.statuses())["Gwóźdź"] == "IN_PROGRESS"
    await p.attempt("Haczyk", "CANCELLED")  # cancelled attempts are ignored
    assert (await p.statuses())["Haczyk"] == "LOCKED"


async def test_open_attempt_states(db):
    p = await Path.build(db, ONE_STAGE)
    await p.passed("Gwóźdź")
    await p.attempt("Haczyk", "SUBMITTED")
    assert (await p.statuses())["Haczyk"] == "SUBMITTED"


async def test_under_review_status(db):
    p = await Path.build(db, ONE_STAGE)
    await p.attempt("Gwóźdź", "UNDER_REVIEW")
    assert (await p.statuses())["Gwóźdź"] == "UNDER_REVIEW"


async def test_br31_stage_gate_requires_whole_previous_stage_including_courses(db):
    p = await Path.build(db, [[("P", "Gwóźdź"), ("K", "Podkowa")], [("P", "Kleszcze"), ("K", "Damast")]])
    await p.passed("Gwóźdź")
    s = await p.statuses()
    assert s["Kleszcze"] == "LOCKED" and s["Damast"] == "LOCKED"  # Podkowa (course) not passed yet
    await p.passed("Podkowa")
    s = await p.statuses()
    assert s["Kleszcze"] == "AVAILABLE" and s["Damast"] == "AVAILABLE"


async def test_q57_courses_outside_order_and_do_not_block_work(db):
    p = await Path.build(db, [[("K", "Podkowa"), ("P", "Gwóźdź"), ("K", "Głowa byka"), ("P", "Haczyk")]])
    s = await p.statuses()
    # Courses are available right away; the course placed first does not lock Gwóźdź.
    assert s == {"Podkowa": "AVAILABLE", "Gwóźdź": "AVAILABLE", "Głowa byka": "AVAILABLE", "Haczyk": "LOCKED"}
    await p.passed("Gwóźdź")
    assert (await p.statuses())["Haczyk"] == "AVAILABLE"  # the course in between does not block


async def test_q63_theory_and_quiz_placed_by_admin_block_order_like_work(db):
    p = await Path.build(db, [[("P", "Gwóźdź"), ("T", "BHP"), ("Q", "Test"), ("P", "Haczyk")]])
    await p.passed("Gwóźdź")
    assert await p.statuses() == {"Gwóźdź": "PASSED", "BHP": "AVAILABLE", "Test": "LOCKED", "Haczyk": "LOCKED"}
    await p.passed("BHP", "Test")
    assert (await p.statuses())["Haczyk"] == "AVAILABLE"


async def test_q39_inactive_enrollment_locks_tasks_without_open_attempt(db):
    p = await Path.build(db, ONE_STAGE, enrollment_status="CANCELLED")
    await p.attempt("Gwóźdź", "PASSED")
    assert await p.statuses() == {"Gwóźdź": "PASSED", "Haczyk": "LOCKED", "Serce": "LOCKED"}


async def test_br16_admin_reorder_recomputes_and_keeps_passes(db):
    p = await Path.build(db, ONE_STAGE)
    await p.passed("Gwóźdź")
    # Admin moves Serce to the front: Serce -> 1, Gwóźdź -> 2, Haczyk -> 3.
    await db.execute(update(Task).where(Task.id == p.tasks["Serce"].id).values(position=10))
    await db.execute(update(Task).where(Task.id == p.tasks["Haczyk"].id).values(position=3))
    await db.execute(update(Task).where(Task.id == p.tasks["Gwóźdź"].id).values(position=2))
    await db.execute(update(Task).where(Task.id == p.tasks["Serce"].id).values(position=1))
    s = await p.statuses()
    assert s["Gwóźdź"] == "PASSED"  # BR-05: passes are never revoked
    assert s["Serce"] == "AVAILABLE"  # first in the admin's new order
    assert s["Haczyk"] == "AVAILABLE"  # previous (Gwóźdź) is passed


async def test_br16_new_task_inserted_earlier_becomes_available_for_those_ahead(db):
    p = await Path.build(db, ONE_STAGE)
    await p.passed("Gwóźdź", "Haczyk")
    # Admin inserts a new task between Gwóźdź and Haczyk.
    await db.execute(update(Task).where(Task.id == p.tasks["Serce"].id).values(position=4))
    await db.execute(update(Task).where(Task.id == p.tasks["Haczyk"].id).values(position=3))
    p.tasks["Nowe"] = await f.task(db, p.stages[0], 2)
    s = await p.statuses()
    # The new task is mandatory and open right away; it does not re-lock what was already
    # unlocked (Serce follows the passed Haczyk), and passes are never revoked (BR-05).
    assert s == {"Gwóźdź": "PASSED", "Nowe": "AVAILABLE", "Haczyk": "PASSED", "Serce": "AVAILABLE"}


async def test_br20_deactivated_task_leaves_the_order(db):
    p = await Path.build(db, ONE_STAGE)
    await p.passed("Gwóźdź")
    await db.execute(update(Task).where(Task.id == p.tasks["Haczyk"].id).values(is_active=False))
    s = await p.statuses()
    assert "Haczyk" not in s and s["Serce"] == "AVAILABLE"


async def test_labels_count_active_tasks_in_admin_order(db):
    p = await Path.build(db, [[("P", "a"), ("K", "b")], [("P", "c")]])
    state = await task_service.compute_path_statuses(db, p.enrollment)
    assert [t.label for st in state.stages for t in st.tasks] == ["E1.1", "E1.2", "E2.1"]
    assert (state.completed, state.total) == (0, 3)


async def test_helpers_previous_task_and_availability(db):
    p = await Path.build(db, [[("P", "a"), ("K", "k")], [("P", "b")]])
    state = await task_service.compute_path_statuses(db, p.enrollment)
    assert task_service.get_previous_task(state, p.tasks["b"].id) is None  # first work of its stage; gate decides
    assert task_service.get_previous_task(state, p.tasks["a"].id) is None
    assert task_service.is_task_available(state, p.tasks["a"].id)
    assert task_service.is_task_available(state, p.tasks["k"].id)
    assert not task_service.is_task_available(state, p.tasks["b"].id)


async def test_constant_number_of_queries(db):
    """No N+1: the query count does not grow with the number of tasks."""

    async def count(spec):
        p = await Path.build(db, spec)
        conn = (await db.connection()).sync_connection
        n = 0

        def inc(*_a, **_k):
            nonlocal n
            n += 1

        event.listen(conn, "before_cursor_execute", inc)
        try:
            await task_service.compute_path_statuses(db, p.enrollment)
        finally:
            event.remove(conn, "before_cursor_execute", inc)
        return n

    small = await count([[("P", "a")]])
    big = await count([[("P", f"t{i}") for i in range(12)], [("K", f"k{i}") for i in range(6)]])
    assert small == big
