"""M7: instructor queue, claim and release (BR-06, BR-24…BR-27, TEST 10, TEST 11, spec §11, §25)."""

import asyncio

from sqlalchemy import select

from app.models import AuditLog, Submission, Task
from tests import factories as f
from tests.conftest import bearer, login
from tests.submission_helpers import jpeg, setup


async def _sent(me, task_id, text="Odpowiedź", photo=False):
    d = await me.draft(task_id, comment=text)
    if photo:
        await me.photo(d["id"], jpeg())
    return await me.submit(d["id"])


async def _instructor(api, a, make_user, email, **scope):
    u = await make_user(email, "INSTRUCTOR")
    if scope:
        await a.req("POST", "/admin/instructor-permissions", 201, json={"instructor_id": str(u.id), **scope})
    return u, bearer(await login(api, email))


async def claim(api, h, sub_id):
    return await api.post(f"/api/v1/submissions/{sub_id}/claim", headers=h)


async def test_fr_ins01_queue_in_scope_without_own_plus_my_claims(api, make_user, committed):
    a, v, s, ids, u, me, _ = await setup(api, make_user)
    sub = await _sent(me, ids["bhp"])
    _, mh = await _instructor(api, a, make_user, "marek@example.pl", path_version_id=v["id"])
    q = (await api.get("/api/v1/instructor/submissions", headers=mh)).json()
    assert [x["submission"]["id"] for x in q] == [sub["id"]]
    item = q[0]
    assert item["participant"]["first_name"] == "Jan" and item["task"]["label"] == "E1.1"
    assert (
        item["task"]["name"] == "Bezpieczeństwo pracy"
        and item["stage"]["id"] == s["id"]
        and item["path"]["version"] == 1
    )

    # An instructor with no permissions sees nothing.
    _, nh = await _instructor(api, a, make_user, "nikt@example.pl")
    assert (await api.get("/api/v1/instructor/submissions", headers=nh)).json() == []

    # After claiming, it stays in my queue as UNDER_REVIEW; filters work.
    assert (await claim(api, mh, sub["id"])).status_code == 200
    mine = (await api.get("/api/v1/instructor/submissions?status=UNDER_REVIEW", headers=mh)).json()
    assert [x["submission"]["status"] for x in mine] == ["UNDER_REVIEW"]
    assert (await api.get("/api/v1/instructor/submissions?status=SUBMITTED", headers=mh)).json() == []


async def test_br24_stage_permission_covers_only_its_stage(api, make_user, committed):
    a, v, s, ids, u, me, _ = await setup(api, make_user)
    s2 = await a.stage(v["id"], "Kowalstwo zaawansowane")
    t2 = await a.task(s2["id"], {"name": "Kleszcze", "task_type": "THEORY"})
    sub1 = await _sent(me, ids["bhp"])
    async with committed() as db, db.begin():
        task2 = await db.get(Task, t2["id"])
        sub2 = await f.submission(db, task2, u, 1, status="SUBMITTED")
    _, ah = await _instructor(api, a, make_user, "anna@example.pl", stage_id=s2["id"])
    q = (await api.get("/api/v1/instructor/submissions", headers=ah)).json()
    assert [x["submission"]["id"] for x in q] == [str(sub2.id)]
    r = await claim(api, ah, sub1["id"])
    assert r.status_code == 403 and r.json()["error"]["code"] == "INSTRUCTOR_NOT_AUTHORIZED"
    filtered = (await api.get(f"/api/v1/instructor/submissions?path_version_id={v['id']}", headers=ah)).json()
    assert len(filtered) == 1


async def test_fr_ins03_claim_sets_under_review_and_is_audited(api, make_user, committed):
    a, v, _, ids, _, me, _ = await setup(api, make_user)
    sub = await _sent(me, ids["bhp"])
    _, mh = await _instructor(api, a, make_user, "marek@example.pl", path_version_id=v["id"])
    r = await claim(api, mh, sub["id"])
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "UNDER_REVIEW" and body["claimed_at"]
    assert (await me.req("GET", f"/tasks/{ids['bhp']}"))["status"] == "UNDER_REVIEW"
    async with committed() as db:
        assert "SUBMISSION_CLAIMED" in set((await db.execute(select(AuditLog.action))).scalars())


async def test_test10_second_instructor_cannot_claim(api, make_user):
    a, v, _, ids, _, me, _ = await setup(api, make_user)
    sub = await _sent(me, ids["bhp"])
    _, mh = await _instructor(api, a, make_user, "marek@example.pl", path_version_id=v["id"])
    _, ah = await _instructor(api, a, make_user, "anna@example.pl", path_version_id=v["id"])
    assert (await claim(api, mh, sub["id"])).status_code == 200
    r = await claim(api, ah, sub["id"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "SUBMISSION_ALREADY_CLAIMED"


async def test_test11_instructor_without_permission_cannot_claim(api, make_user):
    a, _, _, ids, _, me, _ = await setup(api, make_user)
    sub = await _sent(me, ids["bhp"])
    _, nh = await _instructor(api, a, make_user, "nikt@example.pl")
    r = await claim(api, nh, sub["id"])
    assert r.status_code == 403 and r.json()["error"]["code"] == "INSTRUCTOR_NOT_AUTHORIZED"


async def test_br25_no_claim_of_own_submission(api, make_user):
    a, v, _, ids, u, me, _ = await setup(api, make_user)
    # Jan is a participant; give him the instructor role and a permission on his own path.
    await a.req("PUT", f"/admin/users/{u.id}", json={"roles": ["PARTICIPANT", "INSTRUCTOR"]})
    await a.req(
        "POST", "/admin/instructor-permissions", 201, json={"instructor_id": str(u.id), "path_version_id": v["id"]}
    )
    sub = await _sent(me, ids["bhp"])
    jh = bearer(await login(api, "jan@example.pl"))
    assert (await api.get("/api/v1/instructor/submissions", headers=jh)).json() == []
    r = await claim(api, jh, sub["id"])
    assert r.status_code == 403 and r.json()["error"]["code"] == "SELF_ASSESSMENT_FORBIDDEN"


async def test_br27_admin_role_alone_cannot_claim(api, make_user):
    a, _, _, ids, _, me, _ = await setup(api, make_user)
    sub = await _sent(me, ids["bhp"])
    r = await claim(api, a.h, sub["id"])
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"


async def test_br06_spec25_parallel_claims_exactly_one_wins(api, make_user, committed):
    a, v, _, ids, _, me, _ = await setup(api, make_user)
    sub = await _sent(me, ids["bhp"])
    headers = []
    for n in range(8):
        _, h = await _instructor(api, a, make_user, f"i{n}@example.pl", path_version_id=v["id"])
        headers.append(h)
    results = await asyncio.gather(*(claim(api, h, sub["id"]) for h in headers))
    codes = sorted(r.status_code for r in results)
    assert codes == [200] + [409] * 7
    assert all(r.json()["error"]["code"] == "SUBMISSION_ALREADY_CLAIMED" for r in results if r.status_code == 409)
    async with committed() as db:
        row = await db.get(Submission, sub["id"])
        claimed = (await db.execute(select(AuditLog).where(AuditLog.action == "SUBMISSION_CLAIMED"))).scalars().all()
    assert row.status == "UNDER_REVIEW" and row.instructor_id is not None and len(claimed) == 1


async def test_claim_requires_submitted_state(api, make_user):
    a, v, _, ids, _, me, _ = await setup(api, make_user)
    d = await me.draft(ids["bhp"], comment="szkic")
    _, mh = await _instructor(api, a, make_user, "marek@example.pl", path_version_id=v["id"])
    r = await claim(api, mh, d["id"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_STATE_TRANSITION"
    assert (await claim(api, mh, "00000000-0000-4000-8000-000000000000")).status_code == 404


async def test_br26_release_by_assigned_instructor_or_admin_only(api, make_user):
    a, v, _, ids, _, me, _ = await setup(api, make_user)
    sub = await _sent(me, ids["bhp"])
    _, mh = await _instructor(api, a, make_user, "marek@example.pl", path_version_id=v["id"])
    _, ah = await _instructor(api, a, make_user, "anna@example.pl", path_version_id=v["id"])
    await claim(api, mh, sub["id"])
    r = await api.post(f"/api/v1/submissions/{sub['id']}/release", headers=ah)
    assert r.status_code == 403 and r.json()["error"]["code"] == "NOT_ASSIGNED_INSTRUCTOR"
    r = await api.post(f"/api/v1/submissions/{sub['id']}/release", headers=mh)
    assert r.status_code == 200 and r.json()["status"] == "SUBMITTED" and r.json()["claimed_at"] is None
    assert (await claim(api, ah, sub["id"])).status_code == 200  # back in the queue for everyone
    r = await api.post(f"/api/v1/submissions/{sub['id']}/release", headers=a.h)  # ADMIN may release any claim
    assert r.status_code == 200
    r = await api.post(f"/api/v1/submissions/{sub['id']}/release", headers=a.h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_STATE_TRANSITION"


async def test_br23_participant_cannot_withdraw_claimed(api, make_user):
    a, v, _, ids, _, me, _ = await setup(api, make_user)
    sub = await _sent(me, ids["bhp"])
    _, mh = await _instructor(api, a, make_user, "marek@example.pl", path_version_id=v["id"])
    await claim(api, mh, sub["id"])
    r = await me.req("POST", f"/submissions/{sub['id']}/cancel", 409)
    assert r["error"]["code"] == "SUBMISSION_ALREADY_CLAIMED"


async def test_fr_ins02_detail_with_sent_revision_and_previous_attempts(api, make_user, committed):
    a, v, _, ids, u, me, _ = await setup(api, make_user)
    first = await _sent(me, ids["bhp"], "Pierwsza")
    async with committed() as db, db.begin():
        (await db.get(Submission, first["id"])).status = "NEEDS_IMPROVEMENT"
    await a.req(
        "PUT",
        f"/admin/tasks/{ids['bhp']}",
        json={"name": "BHP v2", "task_type": "THEORY", "evaluation_criteria": "Pięć zagrożeń"},
    )
    second = await _sent(me, ids["bhp"], "Druga")
    _, mh = await _instructor(api, a, make_user, "marek@example.pl", path_version_id=v["id"])
    r = await api.get(f"/api/v1/instructor/submissions/{second['id']}", headers=mh)
    assert r.status_code == 200
    d = r.json()
    assert d["submission"]["comment"] == "Druga" and d["revision"]["name"] == "BHP v2"
    assert d["revision"]["evaluation_criteria"] == "Pięć zagrożeń"
    assert [p["attempt_number"] for p in d["previous_attempts"]] == [1]
    _, nh = await _instructor(api, a, make_user, "nikt@example.pl")
    assert (await api.get(f"/api/v1/instructor/submissions/{second['id']}", headers=nh)).status_code == 404


async def test_photos_visible_to_owner_authorized_instructor_and_admin_only(api, make_user, committed):
    a, v, _, ids, u, me, _ = await setup(api, make_user)
    from tests.submission_helpers import pass_in_db

    await pass_in_db(committed, ids["bhp"], u)
    sub = await _sent(me, ids["gwozdz"], photo=True)
    photo_id = sub["photos"][0]["id"]
    url = f"/api/v1/submissions/{sub['id']}/photos/{photo_id}"
    _, mh = await _instructor(api, a, make_user, "marek@example.pl", path_version_id=v["id"])
    _, nh = await _instructor(api, a, make_user, "nikt@example.pl")
    assert (await api.get(url, headers=me.h)).status_code == 200
    r = await api.get(url, headers=mh)
    assert r.status_code == 200 and r.headers["content-type"] == "image/webp"
    assert (await api.get(url, headers=a.h)).status_code == 200
    assert (await api.get(url, headers=nh)).status_code == 404


async def test_instructor_endpoints_need_instructor_role(api, make_user):
    _, _, _, _, _, me, _ = await setup(api, make_user)
    assert (await api.get("/api/v1/instructor/submissions", headers=me.h)).status_code == 403
