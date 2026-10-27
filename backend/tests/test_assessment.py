"""M8: instructor assessment and final pass (BR-02, BR-05, BR-07, BR-13, BR-15, BR-19, TEST 3, TEST 4, TEST 6)."""

from sqlalchemy import func, select

from app.models import Assessment, AuditLog, Submission
from tests.conftest import bearer, login
from tests.submission_helpers import pass_in_db, setup


async def _claimed(api, make_user, task="bhp", committed=None, **kw):
    """A theory attempt sent by Jan and claimed by Marek (version permission)."""
    a, v, s, ids, u, me, e = await setup(api, make_user, **kw)
    m = await make_user("marek@example.pl", "INSTRUCTOR")
    await a.req(
        "POST", "/admin/instructor-permissions", 201, json={"instructor_id": str(m.id), "path_version_id": v["id"]}
    )
    mh = bearer(await login(api, "marek@example.pl"))
    d = await me.draft(ids[task], comment="Pięć zagrożeń i ochrona")
    sub = await me.submit(d["id"])
    assert (await api.post(f"/api/v1/submissions/{sub['id']}/claim", headers=mh)).status_code == 200
    return a, v, ids, u, me, e, mh, sub


async def assess(api, h, sub_id, result, comment=None):
    return await api.post(
        f"/api/v1/submissions/{sub_id}/assessment", headers=h, json={"result": result, "comment": comment}
    )


async def test_test3_pass_unlocks_next_task(api, make_user, committed):
    _, _, ids, _, me, _, mh, sub = await _claimed(api, make_user)
    r = await assess(api, mh, sub["id"], "PASSED", "Komplet")
    assert r.status_code == 201
    body = r.json()["submission"]
    assert body["status"] == "PASSED" and body["assessed_at"]
    assert body["assessment"]["result"] == "PASSED" and body["assessment"]["instructor"]["first_name"] == "Jan"
    assert (await me.req("GET", f"/tasks/{ids['bhp']}"))["status"] == "PASSED"
    assert (await me.req("GET", f"/tasks/{ids['gwozdz']}"))["status"] == "AVAILABLE"


async def test_test4_needs_improvement_keeps_next_locked_and_allows_new_attempt(api, make_user):
    _, _, ids, _, me, _, mh, sub = await _claimed(api, make_user)
    r = await assess(api, mh, sub["id"], "NEEDS_IMPROVEMENT", "Brakuje dwóch zagrożeń")
    assert r.status_code == 201 and r.json()["submission"]["status"] == "NEEDS_IMPROVEMENT"
    assert (await me.req("GET", f"/tasks/{ids['bhp']}"))["status"] == "NEEDS_IMPROVEMENT"
    assert (await me.req("GET", f"/tasks/{ids['gwozdz']}"))["status"] == "LOCKED"
    assert (await me.draft(ids["bhp"], comment="Poprawione"))["attempt_number"] == 2


async def test_br07_comment_required_for_needs_improvement(api, make_user):
    _, _, _, _, _, _, mh, sub = await _claimed(api, make_user)
    for comment in (None, "", "   "):
        r = await assess(api, mh, sub["id"], "NEEDS_IMPROVEMENT", comment)
        assert r.status_code == 422 and r.json()["error"]["code"] == "ASSESSMENT_COMMENT_REQUIRED"
    assert (await assess(api, mh, sub["id"], "PASSED")).status_code == 201  # comment optional on a pass


async def test_br07_only_the_assigned_instructor_assesses(api, make_user):
    a, v, _, _, _, _, mh, sub = await _claimed(api, make_user)
    an = await make_user("anna@example.pl", "INSTRUCTOR")
    await a.req(
        "POST", "/admin/instructor-permissions", 201, json={"instructor_id": str(an.id), "path_version_id": v["id"]}
    )
    r = await assess(api, bearer(await login(api, "anna@example.pl")), sub["id"], "PASSED")
    assert r.status_code == 403 and r.json()["error"]["code"] == "NOT_ASSIGNED_INSTRUCTOR"


async def test_br07_assigned_instructor_without_permission_any_more_cannot_assess(api, make_user, committed):
    # Removing the permission releases the claim (BR-26), so the attempt is no longer UNDER_REVIEW.
    a, v, _, _, _, _, mh, sub = await _claimed(api, make_user)
    perms = await a.req("GET", "/admin/instructor-permissions")
    await a.req("DELETE", f"/admin/instructor-permissions/{perms['items'][0]['id']}", 204)
    r = await assess(api, mh, sub["id"], "PASSED")
    assert r.status_code == 403 and r.json()["error"]["code"] == "INSTRUCTOR_NOT_AUTHORIZED"


async def test_assessment_requires_claim_first(api, make_user):
    a, v, _, ids, _, me, _ = (await setup(api, make_user))[:7]
    m = await make_user("marek@example.pl", "INSTRUCTOR")
    await a.req(
        "POST", "/admin/instructor-permissions", 201, json={"instructor_id": str(m.id), "path_version_id": v["id"]}
    )
    d = await me.draft(ids["bhp"], comment="x")
    sub = await me.submit(d["id"])
    r = await assess(api, bearer(await login(api, "marek@example.pl")), sub["id"], "PASSED")
    assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_STATE_TRANSITION"


async def test_br05_test6_pass_is_final(api, make_user, committed):
    _, _, ids, _, me, _, mh, sub = await _claimed(api, make_user)
    await assess(api, mh, sub["id"], "PASSED")
    again = await assess(api, mh, sub["id"], "NEEDS_IMPROVEMENT", "Jednak nie")
    assert again.status_code == 409
    assert (await me.draft(ids["bhp"], 409))["error"]["code"] == "TASK_ALREADY_PASSED"
    async with committed() as s:
        assert (
            await s.scalar(select(func.count()).select_from(Assessment).where(Assessment.submission_id == sub["id"]))
            == 1
        )


async def test_br13_passed_always_has_its_assessment(api, make_user, committed):
    _, _, _, _, _, _, mh, sub = await _claimed(api, make_user)
    await assess(api, mh, sub["id"], "PASSED")
    async with committed() as s:
        orphan = await s.scalar(
            select(func.count())
            .select_from(Submission)
            .outerjoin(Assessment, Assessment.submission_id == Submission.id)
            .where(Submission.status == "PASSED", Assessment.id.is_(None))
        )
        acts = set((await s.execute(select(AuditLog.action))).scalars())
    assert orphan == 0 and {"SUBMISSION_ASSESSED", "TASK_PASSED"} <= acts


async def test_br19_assessed_against_revision_at_send_time(api, make_user):
    a, _, ids, _, me, _, mh, sub = await _claimed(api, make_user)
    await a.req(
        "PUT",
        f"/admin/tasks/{ids['bhp']}",
        json={"name": "BHP po zmianie", "task_type": "THEORY", "evaluation_criteria": "Nowe kryteria"},
    )
    detail = (await api.get(f"/api/v1/instructor/submissions/{sub['id']}", headers=mh)).json()
    assert detail["revision"]["name"] == "Bezpieczeństwo pracy"  # what Jan answered
    await assess(api, mh, sub["id"], "PASSED")
    t = await me.req("GET", f"/tasks/{ids['bhp']}")
    assert t["revision"]["name"] == "Bezpieczeństwo pracy"  # the passed task keeps its revision


async def test_br15_last_pass_completes_enrollment(api, make_user, committed):
    _, _, ids, u, me, _, mh, sub = await _claimed(api, make_user)
    for key in ("gwozdz", "quiz", "podkowa"):
        await pass_in_db(committed, ids[key], u)
    assert (await me.req("GET", "/me/paths"))[0]["status"] == "ACTIVE"
    await assess(api, mh, sub["id"], "PASSED")
    [e] = await me.req("GET", "/me/paths")
    assert e["status"] == "COMPLETED" and e["completed_at"]
    async with committed() as s:
        assert "ENROLLMENT_COMPLETED" in set((await s.execute(select(AuditLog.action))).scalars())


async def test_participant_sees_feedback(api, make_user):
    _, _, ids, _, me, _, mh, sub = await _claimed(api, make_user)
    await assess(api, mh, sub["id"], "NEEDS_IMPROVEMENT", "Dopisz zatrucie tlenkiem węgla")
    [h] = await me.req("GET", f"/tasks/{ids['bhp']}/submissions")
    assert (
        h["assessment"]["comment"] == "Dopisz zatrucie tlenkiem węgla"
        and h["assessment"]["instructor"]["last_name"] == "Kowalski"
    )
