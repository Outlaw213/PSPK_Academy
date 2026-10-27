"""M12b: who reviews a submission, and the instructor's own assessments (FR-INS-07)."""

from tests.conftest import bearer, login
from tests.submission_helpers import setup


async def _ready(api, make_user):
    a, v, s, ids, u, me, e = await setup(api, make_user)
    for email, first in (("marek@example.pl", "Marek"), ("anna@example.pl", "Anna")):
        m = await make_user(email, "INSTRUCTOR", first_name=first)
        await a.req(
            "POST", "/admin/instructor-permissions", 201, json={"instructor_id": str(m.id), "path_version_id": v["id"]}
        )
    return a, ids, u, me, bearer(await login(api, "marek@example.pl")), bearer(await login(api, "anna@example.pl"))


async def _sent(me, task_id, text="Odpowiedź"):
    d = await me.draft(task_id, comment=text)
    return await me.submit(d["id"])


async def test_queue_item_names_who_reviews(api, make_user):
    _, ids, _, me, mh, ah = await _ready(api, make_user)
    sub = await _sent(me, ids["bhp"])
    [item] = (await api.get("/api/v1/instructor/submissions", headers=mh)).json()
    assert item["instructor"] is None
    await api.post(f"/api/v1/submissions/{sub['id']}/claim", headers=mh)
    d = (await api.get(f"/api/v1/instructor/submissions/{sub['id']}", headers=ah)).json()
    assert d["instructor"]["first_name"] == "Marek"  # Anna sees that someone else is reviewing it


async def test_fr_ins07_my_assessments_and_course_results_newest_first(api, make_user):
    _, ids, u, me, mh, ah = await _ready(api, make_user)
    first = await _sent(me, ids["bhp"])
    await api.post(f"/api/v1/submissions/{first['id']}/claim", headers=mh)
    await api.post(
        f"/api/v1/submissions/{first['id']}/assessment",
        headers=mh,
        json={"result": "NEEDS_IMPROVEMENT", "comment": "Dopisz"},
    )
    second = await _sent(me, ids["bhp"], "Poprawione")
    await api.post(f"/api/v1/submissions/{second['id']}/claim", headers=mh)
    await api.post(f"/api/v1/submissions/{second['id']}/assessment", headers=mh, json={"result": "PASSED"})
    course = await api.post(
        f"/api/v1/instructor/courses/{ids['podkowa']}/results",
        headers=mh,
        json={"user_id": str(u.id), "result": "PASSED"},
    )

    page = (await api.get("/api/v1/instructor/assessed", headers=mh)).json()
    assert page["total"] == 3
    assert [i["submission"]["id"] for i in page["items"]] == [
        course.json()["submission"]["id"],
        second["id"],
        first["id"],
    ]
    top = page["items"][0]
    assert top["task"]["name"] == "Podkowa" and top["submission"]["assessment"]["result"] == "PASSED"
    assert top["participant"]["id"] == str(u.id) and top["instructor"]["first_name"] == "Marek"
    assert page["items"][2]["submission"]["assessment"]["comment"] == "Dopisz"

    one = (await api.get("/api/v1/instructor/assessed?limit=1&offset=2", headers=mh)).json()
    assert [i["submission"]["id"] for i in one["items"]] == [first["id"]]
    assert (await api.get("/api/v1/instructor/assessed", headers=ah)).json()["total"] == 0  # only my own


async def test_fr_ins07_quiz_grading_is_nobodys(api, make_user):
    _, _, _, _, mh, _ = await _ready(api, make_user)
    assert (await api.get("/api/v1/instructor/assessed", headers=mh)).json() == {
        "items": [],
        "total": 0,
        "limit": 50,
        "offset": 0,
    }


async def test_fr_ins07_instructors_only(api, make_user):
    _, _, _, me, _, _ = await _ready(api, make_user)
    assert (await api.get("/api/v1/instructor/assessed", headers=me.h)).status_code == 403
