"""M5: enrollments managed by the admin (FR-ADM-03, BR-12, BR-29, Q-45)."""

from sqlalchemy import select

from app.models import AuditLog, Submission, Task
from tests import factories as f
from tests.content_helpers import make_admin


async def _open_version(a, name="Podstawy kowalstwa"):
    p = await a.path(name)
    v = await a.version(p["id"])
    await a.req("PUT", f"/admin/path-versions/{v['id']}", json={"is_active": True})
    s = await a.stage(v["id"])
    t = await a.task(s["id"])
    return p, v, t


async def test_fr_adm03_admin_enrolls_participant(api, make_user, committed):
    a = await make_admin(api, make_user)
    _, v, _ = await _open_version(a)
    u = await make_user("p@example.pl")
    e = await a.req("POST", "/admin/enrollments", 201, json={"user_id": str(u.id), "path_version_id": v["id"]})
    assert e["status"] == "ACTIVE" and e["path_version_id"] == v["id"] and e["user"]["email"] == "p@example.pl"
    async with committed() as s:
        assert "PATH_ASSIGNED" in set((await s.execute(select(AuditLog.action))).scalars())


async def test_br12_closed_version_rejects_enrollment(api, make_user):
    a = await make_admin(api, make_user)
    p = await a.path()
    v = await a.version(p["id"])
    u = await make_user("p@example.pl")
    r = await a.req("POST", "/admin/enrollments", 409, json={"user_id": str(u.id), "path_version_id": v["id"]})
    assert r["error"]["code"] == "PATH_VERSION_INACTIVE"


async def test_br27_only_participants_can_be_enrolled(api, make_user):
    a = await make_admin(api, make_user)
    _, v, _ = await _open_version(a)
    i = await make_user("i@example.pl", "INSTRUCTOR")
    r = await a.req("POST", "/admin/enrollments", 422, json={"user_id": str(i.id), "path_version_id": v["id"]})
    assert r["error"]["code"] == "USER_NOT_PARTICIPANT"


async def test_br12_one_active_enrollment_per_path(api, make_user):
    a = await make_admin(api, make_user)
    p, v1, _ = await _open_version(a)
    v2 = await a.version(p["id"], copy_from=v1["id"])
    await a.req("PUT", f"/admin/path-versions/{v2['id']}", json={"is_active": True})
    u = await make_user("p@example.pl")
    await a.req("POST", "/admin/enrollments", 201, json={"user_id": str(u.id), "path_version_id": v1["id"]})
    for vid in (v1["id"], v2["id"]):
        r = await a.req("POST", "/admin/enrollments", 409, json={"user_id": str(u.id), "path_version_id": vid})
        assert r["error"]["code"] == "ALREADY_ENROLLED"


async def test_br29_cancel_cancels_open_attempts_and_q45_reenroll_reactivates(api, make_user, committed):
    a = await make_admin(api, make_user)
    _, v, t = await _open_version(a)
    u = await make_user("p@example.pl")
    e = await a.req("POST", "/admin/enrollments", 201, json={"user_id": str(u.id), "path_version_id": v["id"]})
    async with committed() as s, s.begin():
        task = await s.get(Task, t["id"])
        draft = await f.submission(s, task, u, 1, status="DRAFT")

    cancelled = await a.req("POST", f"/admin/enrollments/{e['id']}/cancel")
    assert cancelled["status"] == "CANCELLED" and cancelled["cancelled_at"]
    async with committed() as s:
        assert (await s.get(Submission, draft.id)).status == "CANCELLED"
    await a.req("POST", f"/admin/enrollments/{e['id']}/cancel", 409)

    again = await a.req("POST", "/admin/enrollments", 200, json={"user_id": str(u.id), "path_version_id": v["id"]})
    assert again["id"] == e["id"] and again["status"] == "ACTIVE" and again["cancelled_at"] is None
    async with committed() as s:
        assert {"ENROLLMENT_CANCELLED", "PATH_ASSIGNED"} <= set((await s.execute(select(AuditLog.action))).scalars())


async def test_fr_adm03_list_with_filters(api, make_user):
    a = await make_admin(api, make_user)
    _, v1, _ = await _open_version(a, "A")
    _, v2, _ = await _open_version(a, "B")
    u1, u2 = await make_user("p1@example.pl"), await make_user("p2@example.pl")
    await a.req("POST", "/admin/enrollments", 201, json={"user_id": str(u1.id), "path_version_id": v1["id"]})
    e = await a.req("POST", "/admin/enrollments", 201, json={"user_id": str(u2.id), "path_version_id": v2["id"]})
    await a.req("POST", f"/admin/enrollments/{e['id']}/cancel")
    assert (await a.req("GET", "/admin/enrollments"))["total"] == 2
    assert [
        x["user"]["email"] for x in (await a.req("GET", f"/admin/enrollments?path_version_id={v1['id']}"))["items"]
    ] == ["p1@example.pl"]
    assert [x["user"]["email"] for x in (await a.req("GET", "/admin/enrollments?status=CANCELLED"))["items"]] == [
        "p2@example.pl"
    ]
    assert (await a.req("GET", f"/admin/enrollments?user_id={u1.id}"))["total"] == 1


async def test_unknown_user_or_version_404(api, make_user):
    a = await make_admin(api, make_user)
    _, v, _ = await _open_version(a)
    nope = "00000000-0000-4000-8000-000000000000"
    await a.req("POST", "/admin/enrollments", 404, json={"user_id": nope, "path_version_id": v["id"]})
