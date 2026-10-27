"""M12a: every own attempt across all enrollments (FR-PAR-08, BR-04, BR-17, BR-20)."""

from tests.conftest import bearer, login
from tests.submission_helpers import Participant, setup


async def _sent(me, task_id, text="Odpowiedź"):
    d = await me.draft(task_id, comment=text)
    return await me.submit(d["id"])


async def test_fr_par08_all_my_attempts_newest_first(api, make_user):
    a, v, s, ids, u, me, e = await setup(api, make_user)
    first = await _sent(me, ids["bhp"], "Pierwsza")
    await me.req("POST", f"/submissions/{first['id']}/cancel")
    draft = await me.draft(ids["bhp"], comment="Szkic")

    # A second path the participant is also enrolled in.
    p2 = await a.path("Kowalstwo artystyczne")
    v2 = await a.version(p2["id"])
    await a.req("PUT", f"/admin/path-versions/{v2['id']}", json={"is_active": True})
    s2 = await a.stage(v2["id"], "Formy")
    t2 = await a.task(s2["id"], {"name": "Liść", "task_type": "THEORY"})
    await a.req("POST", "/admin/enrollments", 201, json={"user_id": str(u.id), "path_version_id": v2["id"]})
    other = await _sent(me, t2["id"])

    page = await me.req("GET", "/me/submissions")
    assert page["total"] == 3
    assert [i["submission"]["id"] for i in page["items"]] == [other["id"], draft["id"], first["id"]]
    newest = page["items"][0]
    assert newest["task"] == {"id": t2["id"], "label": "E1.1", "name": "Liść", "task_type": "THEORY"}
    assert newest["path"]["name"] == "Kowalstwo artystyczne" and newest["stage"]["name"] == "Formy"
    assert page["items"][2]["submission"]["status"] == "CANCELLED"  # nothing is ever hidden (BR-04)

    one = await me.req("GET", "/me/submissions?limit=1&offset=1")
    assert [i["submission"]["id"] for i in one["items"]] == [draft["id"]] and one["total"] == 3


async def test_br20_history_stays_after_enrollment_cancelled(api, make_user):
    a, _, _, ids, _, me, e = await setup(api, make_user)
    sent = await _sent(me, ids["bhp"])
    await a.req("POST", f"/admin/enrollments/{e['id']}/cancel")
    [item] = (await me.req("GET", "/me/submissions"))["items"]
    assert item["submission"]["id"] == sent["id"] and item["submission"]["status"] == "CANCELLED"


async def test_br17_only_own_attempts(api, make_user):
    a, v, _, ids, _, me, _ = await setup(api, make_user)
    await _sent(me, ids["bhp"])
    ola = await make_user("ola@example.pl")
    await a.req("POST", "/admin/enrollments", 201, json={"user_id": str(ola.id), "path_version_id": v["id"]})
    oh = Participant(api, bearer(await login(api, "ola@example.pl")))
    assert (await oh.req("GET", "/me/submissions"))["total"] == 0
    instructor = await make_user("marek@example.pl", "INSTRUCTOR")
    assert instructor
    r = await api.get("/api/v1/me/submissions", headers=bearer(await login(api, "marek@example.pl")))
    assert r.status_code == 403  # participants only
