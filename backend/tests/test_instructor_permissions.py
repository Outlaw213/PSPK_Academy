"""M7: instructor permissions managed by the admin (FR-ADM-04, BR-24, BR-26)."""

from sqlalchemy import select

from app.models import AuditLog, Submission
from tests.conftest import bearer, login
from tests.submission_helpers import setup


async def _sent(me, task_id, text="Odpowiedź"):
    d = await me.draft(task_id, comment=text)
    return await me.submit(d["id"])


async def test_fr_adm04_grant_to_version_or_stage_and_list(api, make_user):
    a, v, s, _, _, _, _ = await setup(api, make_user)
    m = await make_user("marek@example.pl", "INSTRUCTOR")
    an = await make_user("anna@example.pl", "INSTRUCTOR")
    pv = await a.req(
        "POST", "/admin/instructor-permissions", 201, json={"instructor_id": str(m.id), "path_version_id": v["id"]}
    )
    ps = await a.req(
        "POST", "/admin/instructor-permissions", 201, json={"instructor_id": str(an.id), "stage_id": s["id"]}
    )
    assert pv["scope"] == "PATH_VERSION" and ps["scope"] == "STAGE" and ps["stage"]["name"] == s["name"]
    page = await a.req("GET", "/admin/instructor-permissions")
    assert page["total"] == 2
    only = await a.req("GET", f"/admin/instructor-permissions?instructor_id={an.id}")
    assert [p["id"] for p in only["items"]] == [ps["id"]]
    by_version = await a.req("GET", f"/admin/instructor-permissions?path_version_id={v['id']}")
    assert by_version["total"] == 2  # stage permissions of the version are included


async def test_fr_adm04_validation(api, make_user):
    a, v, s, _, _, _, _ = await setup(api, make_user)
    m = await make_user("marek@example.pl", "INSTRUCTOR")
    p = await make_user("p@example.pl", "PARTICIPANT")
    await a.req("POST", "/admin/instructor-permissions", 422, json={"instructor_id": str(m.id)})
    await a.req(
        "POST",
        "/admin/instructor-permissions",
        422,
        json={"instructor_id": str(m.id), "path_version_id": v["id"], "stage_id": s["id"]},
    )
    r = await a.req(
        "POST", "/admin/instructor-permissions", 422, json={"instructor_id": str(p.id), "stage_id": s["id"]}
    )
    assert r["error"]["code"] == "USER_NOT_INSTRUCTOR"
    await a.req("POST", "/admin/instructor-permissions", 201, json={"instructor_id": str(m.id), "stage_id": s["id"]})
    r = await a.req(
        "POST", "/admin/instructor-permissions", 409, json={"instructor_id": str(m.id), "stage_id": s["id"]}
    )
    assert r["error"]["code"] == "PERMISSION_EXISTS"


async def test_br26_revoking_releases_only_claims_that_fell_out_of_scope(api, make_user, committed):
    a, v, s, ids, _, me, _ = await setup(api, make_user)
    m = await make_user("marek@example.pl", "INSTRUCTOR")
    stage_perm = await a.req(
        "POST", "/admin/instructor-permissions", 201, json={"instructor_id": str(m.id), "stage_id": s["id"]}
    )
    version_perm = await a.req(
        "POST", "/admin/instructor-permissions", 201, json={"instructor_id": str(m.id), "path_version_id": v["id"]}
    )
    sub = await _sent(me, ids["bhp"])
    mh = bearer(await login(api, "marek@example.pl"))
    assert (await api.post(f"/api/v1/submissions/{sub['id']}/claim", headers=mh)).status_code == 200

    # The version permission still covers the stage: nothing is released.
    await a.req("DELETE", f"/admin/instructor-permissions/{stage_perm['id']}", 204)
    async with committed() as db:
        assert (await db.get(Submission, sub["id"])).status == "UNDER_REVIEW"

    # The last permission goes: the claim returns to the queue.
    await a.req("DELETE", f"/admin/instructor-permissions/{version_perm['id']}", 204)
    async with committed() as db:
        row = await db.get(Submission, sub["id"])
        assert row.status == "SUBMITTED" and row.instructor_id is None and row.claimed_at is None
        acts = set((await db.execute(select(AuditLog.action))).scalars())
    assert {"PERMISSION_GRANTED", "PERMISSION_REVOKED", "SUBMISSION_RELEASED"} <= acts


async def test_unknown_permission_404(api, make_user):
    a, _, _, _, _, _, _ = await setup(api, make_user)
    await a.req("DELETE", "/admin/instructor-permissions/00000000-0000-4000-8000-000000000000", 404)
