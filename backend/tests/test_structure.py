"""M4: structure editing — order, moves, deactivation, labels (BR-16, BR-20, BR-34, ADR-15)."""

from sqlalchemy import select

from app.models import AuditLog, Submission
from tests import factories as f
from tests.content_helpers import make_admin


async def _version(api, make_user, stages=(("Kowalstwo podstawowe", ("Gwóźdź", "Haczyk", "Serce")),)):
    a = await make_admin(api, make_user)
    p = await a.path()
    v = await a.version(p["id"])
    ids = {}
    for name, tasks in stages:
        s = await a.stage(v["id"], name)
        ids[name] = s["id"]
        for t in tasks:
            ids[t] = (await a.task(s["id"], {"name": t, "task_type": "PRACTICAL"}))["id"]
    return a, v, ids


async def test_br34_labels_follow_order(api, make_user):
    a, v, _ = await _version(api, make_user, (("E1", ("Gwóźdź", "Haczyk")), ("E2", ("Kleszcze",))))
    assert await a.labels(v["id"]) == [("E1.1", "Gwóźdź"), ("E1.2", "Haczyk"), ("E2.1", "Kleszcze")]


async def test_adr15_br16_reorder_tasks_including_swap(api, make_user, committed):
    a, v, ids = await _version(api, make_user)
    s = ids["Kowalstwo podstawowe"]
    await a.req("PUT", f"/admin/stages/{s}/tasks/order", json={"ids": [ids["Serce"], ids["Gwóźdź"], ids["Haczyk"]]})
    assert await a.labels(v["id"]) == [("E1.1", "Serce"), ("E1.2", "Gwóźdź"), ("E1.3", "Haczyk")]
    await a.req("PUT", f"/admin/stages/{s}/tasks/order", json={"ids": [ids["Gwóźdź"], ids["Serce"], ids["Haczyk"]]})
    assert [n for _, n in await a.labels(v["id"])] == ["Gwóźdź", "Serce", "Haczyk"]
    async with committed() as db:
        assert "ORDER_CHANGED" in set((await db.execute(select(AuditLog.action))).scalars())


async def test_order_list_must_match_exactly(api, make_user):
    a, _, ids = await _version(api, make_user)
    s = ids["Kowalstwo podstawowe"]
    r = await a.req("PUT", f"/admin/stages/{s}/tasks/order", 422, json={"ids": [ids["Gwóźdź"], ids["Haczyk"]]})
    assert r["error"]["code"] == "ORDER_MISMATCH"
    dup = [ids["Gwóźdź"], ids["Gwóźdź"], ids["Haczyk"]]
    await a.req("PUT", f"/admin/stages/{s}/tasks/order", 422, json={"ids": dup})


async def test_reorder_stages(api, make_user):
    a, v, ids = await _version(api, make_user, (("A", ("a1",)), ("B", ("b1",))))
    await a.req("PUT", f"/admin/path-versions/{v['id']}/stages/order", json={"ids": [ids["B"], ids["A"]]})
    assert await a.labels(v["id"]) == [("E1.1", "b1"), ("E2.1", "a1")]


async def test_insert_task_at_position_shifts_others(api, make_user):
    a, v, ids = await _version(api, make_user)
    await a.task(ids["Kowalstwo podstawowe"], {"name": "Teoria BHP", "task_type": "THEORY"}, position=1)
    assert [n for _, n in await a.labels(v["id"])] == ["Teoria BHP", "Gwóźdź", "Haczyk", "Serce"]


async def test_move_task_to_other_stage_of_same_version(api, make_user):
    a, v, ids = await _version(api, make_user, (("A", ("a1", "a2", "a3")), ("B", ("b1",))))
    await a.req("PUT", f"/admin/tasks/{ids['a2']}/stage", json={"stage_id": ids["B"]})
    assert await a.labels(v["id"]) == [("E1.1", "a1"), ("E1.2", "a3"), ("E2.1", "b1"), ("E2.2", "a2")]


async def test_move_task_to_stage_of_other_version_rejected(api, make_user):
    a, _, ids = await _version(api, make_user)
    p = await a.path("Inna")
    other = await a.stage((await a.version(p["id"]))["id"])
    r = await a.req("PUT", f"/admin/tasks/{ids['Gwóźdź']}/stage", 422, json={"stage_id": other["id"]})
    assert r["error"]["code"] == "STAGE_OUTSIDE_VERSION"


async def test_br20_br34_deactivated_task_leaves_order_and_labels(api, make_user):
    a, v, ids = await _version(api, make_user)
    t = await a.req("POST", f"/admin/tasks/{ids['Gwóźdź']}/deactivate")
    assert t["is_active"] is False and t["label"] is None
    assert await a.labels(v["id"]) == [(None, "Gwóźdź"), ("E1.1", "Haczyk"), ("E1.2", "Serce")]
    await a.req("POST", f"/admin/tasks/{ids['Gwóźdź']}/activate")
    assert (await a.labels(v["id"]))[0] == ("E1.1", "Gwóźdź")


async def _participant_attempt(committed, task_id, status, **kw):
    from app.models import Task

    async with committed() as s, s.begin():
        t = await s.get(Task, task_id)
        u = await f.user(s, "PARTICIPANT")
        return await f.submission(s, t, u, status=status, **kw)


async def test_br20_cannot_deactivate_task_with_pending_submissions(api, make_user, committed):
    a, _, ids = await _version(api, make_user)
    await _participant_attempt(committed, ids["Haczyk"], "SUBMITTED")
    r = await a.req("POST", f"/admin/tasks/{ids['Haczyk']}/deactivate", 409)
    assert r["error"]["code"] == "TASK_HAS_PENDING_SUBMISSIONS"


async def test_br20_deactivation_cancels_drafts_keeps_history(api, make_user, committed):
    a, _, ids = await _version(api, make_user)
    draft = await _participant_attempt(committed, ids["Haczyk"], "DRAFT")
    done = await _participant_attempt(committed, ids["Haczyk"], "NEEDS_IMPROVEMENT")
    await a.req("POST", f"/admin/tasks/{ids['Haczyk']}/deactivate")
    async with committed() as s:
        d, n = await s.get(Submission, draft.id), await s.get(Submission, done.id)
    assert d.status == "CANCELLED" and d.cancelled_at is not None
    assert n.status == "NEEDS_IMPROVEMENT"


async def test_stage_create_update_and_audit(api, make_user, committed):
    a = await make_admin(api, make_user)
    p = await a.path()
    v = await a.version(p["id"])
    s = await a.stage(v["id"], "Etap")
    s = await a.req("PUT", f"/admin/stages/{s['id']}", json={"name": "Kowalstwo podstawowe", "description": "Opis"})
    assert s["name"] == "Kowalstwo podstawowe" and s["position"] == 1
    t = await a.task(s["id"])
    await a.req("PUT", f"/admin/tasks/{t['id']}", json={"name": "Gwóźdź kuty", "task_type": "PRACTICAL"})
    async with committed() as db:
        acts = set((await db.execute(select(AuditLog.action))).scalars())
    assert {
        "PATH_CREATED",
        "PATH_VERSION_CREATED",
        "STAGE_CREATED",
        "STAGE_UPDATED",
        "TASK_CREATED",
        "TASK_UPDATED",
    } <= acts
