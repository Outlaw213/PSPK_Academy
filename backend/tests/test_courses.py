"""M8: course results recorded by instructors (BR-30, FR-INS-06, Q-56, Q-57)."""

from sqlalchemy import select

from app.models import Assessment, AuditLog, Submission
from tests.conftest import bearer, login
from tests.submission_helpers import Participant, pass_in_db, setup


async def _ready(api, make_user):
    a, v, s, ids, u, me, e = await setup(api, make_user)
    m = await make_user("marek@example.pl", "INSTRUCTOR")
    await a.req("POST", "/admin/instructor-permissions", 201, json={"instructor_id": str(m.id), "stage_id": s["id"]})
    mh = bearer(await login(api, "marek@example.pl"))
    return a, v, s, ids, u, me, e, mh


async def record(api, h, task_id, user_id, result, comment=None):
    return await api.post(
        f"/api/v1/instructor/courses/{task_id}/results",
        headers=h,
        json={"user_id": str(user_id), "result": result, "comment": comment},
    )


async def test_fr_ins06_courses_in_scope_and_participants(api, make_user):
    _, v, _, ids, u, _, _, mh = await _ready(api, make_user)
    courses = (await api.get("/api/v1/instructor/courses", headers=mh)).json()
    assert [(c["task"]["label"], c["task"]["name"]) for c in courses] == [("E1.4", "Podkowa")]
    assert courses[0]["enrolled"] == 1 and courses[0]["passed"] == 0
    people = (await api.get(f"/api/v1/instructor/courses/{ids['podkowa']}/participants", headers=mh)).json()
    assert [(p["participant"]["id"], p["status"]) for p in people] == [(str(u.id), "AVAILABLE")]
    await make_user("nikt@example.pl", "INSTRUCTOR")
    nh = bearer(await login(api, "nikt@example.pl"))
    assert (await api.get("/api/v1/instructor/courses", headers=nh)).json() == []
    assert (await api.get(f"/api/v1/instructor/courses/{ids['podkowa']}/participants", headers=nh)).status_code == 403


async def test_br30_instructor_records_pass_and_it_is_final(api, make_user, committed):
    _, _, _, ids, u, me, _, mh = await _ready(api, make_user)
    r = await record(api, mh, ids["podkowa"], u.id, "PASSED", "Podkowa wykonana")
    assert r.status_code == 201
    sub = r.json()["submission"]
    assert sub["status"] == "PASSED" and sub["assessment"]["instructor"]["first_name"] == "Jan"
    assert (await me.req("GET", f"/tasks/{ids['podkowa']}"))["status"] == "PASSED"
    async with committed() as s:
        row = await s.get(Submission, sub["id"])
        assert row.recorded_by == row.instructor_id and row.task_revision_id is not None
        assert (
            await s.execute(select(Assessment).where(Assessment.submission_id == row.id))
        ).scalar_one().result == "PASSED"
        assert "COURSE_RESULT_RECORDED" in set((await s.execute(select(AuditLog.action))).scalars())
    again = await record(api, mh, ids["podkowa"], u.id, "PASSED")
    assert again.status_code == 409 and again.json()["error"]["code"] == "TASK_ALREADY_PASSED"


async def test_br30_needs_improvement_requires_comment_and_allows_next_term(api, make_user):
    _, _, _, ids, u, me, _, mh = await _ready(api, make_user)
    r = await record(api, mh, ids["podkowa"], u.id, "NEEDS_IMPROVEMENT", " ")
    assert r.status_code == 422 and r.json()["error"]["code"] == "ASSESSMENT_COMMENT_REQUIRED"
    r = await record(api, mh, ids["podkowa"], u.id, "NEEDS_IMPROVEMENT", "Podkowa nierówna, przyjdź na kolejny termin")
    assert r.status_code == 201 and r.json()["submission"]["attempt_number"] == 1
    assert (await me.req("GET", f"/tasks/{ids['podkowa']}"))["status"] == "NEEDS_IMPROVEMENT"
    r = await record(api, mh, ids["podkowa"], u.id, "PASSED")
    assert r.status_code == 201 and r.json()["submission"]["attempt_number"] == 2


async def test_br30_rules(api, make_user, committed):
    a, v, _, ids, u, me, e, mh = await _ready(api, make_user)
    r = await record(api, mh, ids["bhp"], u.id, "PASSED")
    assert r.status_code == 409 and r.json()["error"]["code"] == "TASK_NOT_COURSE"
    await make_user("nikt@example.pl", "INSTRUCTOR")
    r = await record(api, bearer(await login(api, "nikt@example.pl")), ids["podkowa"], u.id, "PASSED")
    assert r.status_code == 403 and r.json()["error"]["code"] == "INSTRUCTOR_NOT_AUTHORIZED"
    # Marek may not record a result for himself (BR-25).
    marek = (await a.req("GET", "/admin/users?q=marek"))["items"][0]
    await a.req("PUT", f"/admin/users/{marek['id']}", json={"roles": ["INSTRUCTOR", "PARTICIPANT"]})
    await a.req("POST", "/admin/enrollments", 201, json={"user_id": marek["id"], "path_version_id": v["id"]})
    r = await record(api, mh, ids["podkowa"], marek["id"], "PASSED")
    assert r.status_code == 403 and r.json()["error"]["code"] == "SELF_ASSESSMENT_FORBIDDEN"
    # Not enrolled in this version → 404; enrollment cancelled → 403.
    stranger = await make_user("obcy@example.pl")
    assert (await record(api, mh, ids["podkowa"], stranger.id, "PASSED")).status_code == 404
    await a.req("POST", f"/admin/enrollments/{e['id']}/cancel")
    r = await record(api, mh, ids["podkowa"], u.id, "PASSED")
    assert r.status_code == 403 and r.json()["error"]["code"] == "NO_ACTIVE_ENROLLMENT"


async def test_br31_course_in_closed_stage_locked(api, make_user, committed):
    a, v, _, ids, u, me, _, mh = await _ready(api, make_user)
    s2 = await a.stage(v["id"], "Kowalstwo zaawansowane")
    damast = await a.task(s2["id"], {"name": "Damast", "task_type": "COURSE"})
    await a.req(
        "POST",
        "/admin/instructor-permissions",
        201,
        json={"instructor_id": (await a.req("GET", "/admin/users?q=marek"))["items"][0]["id"], "stage_id": s2["id"]},
    )
    r = await record(api, mh, damast["id"], u.id, "PASSED")
    assert r.status_code == 409 and r.json()["error"]["code"] == "TASK_LOCKED"


async def test_q57_course_result_does_not_depend_on_work_order(api, make_user, committed):
    _, _, _, ids, u, me, _, mh = await _ready(api, make_user)
    # Nothing else passed yet: the course is still open (outside the order within the stage).
    assert (await record(api, mh, ids["podkowa"], u.id, "PASSED")).status_code == 201
    assert (await me.req("GET", f"/tasks/{ids['bhp']}"))["status"] == "AVAILABLE"


async def test_br15_course_as_last_task_completes(api, make_user, committed):
    _, _, _, ids, u, me, _, mh = await _ready(api, make_user)
    for key in ("bhp", "gwozdz", "quiz"):
        await pass_in_db(committed, ids[key], u)
    await record(api, mh, ids["podkowa"], u.id, "PASSED")
    assert (await me.req("GET", "/me/paths"))[0]["status"] == "COMPLETED"


async def test_participant_sees_course_result(api, make_user):
    _, _, _, ids, u, me, _, mh = await _ready(api, make_user)
    await record(api, mh, ids["podkowa"], u.id, "PASSED", "Brawo")
    [h] = await me.req("GET", f"/tasks/{ids['podkowa']}/submissions")
    assert h["status"] == "PASSED" and h["assessment"]["comment"] == "Brawo"
    assert isinstance(me, Participant)
