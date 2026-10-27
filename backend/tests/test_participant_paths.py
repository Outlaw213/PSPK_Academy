"""M5: participant view of paths and tasks (FR-PAR-01, FR-PAR-02, BR-01, BR-15, BR-17, BR-19, BR-32)."""

from app.models import Task
from tests import factories as f
from tests.conftest import bearer, login
from tests.content_helpers import HACZYK, QUIZ, make_admin


async def _setup(api, make_user):
    """Admin builds E1: Gwóźdź, Haczyk, quiz, Podkowa (course); E2: Kleszcze. Participant enrolled."""
    a = await make_admin(api, make_user)
    p = await a.path()
    v = await a.version(p["id"])
    await a.req("PUT", f"/admin/path-versions/{v['id']}", json={"is_active": True})
    s1, s2 = await a.stage(v["id"], "Kowalstwo podstawowe"), await a.stage(v["id"], "Kowalstwo zaawansowane")
    ids = {
        "gwozdz": (await a.task(s1["id"], {"name": "Gwóźdź", "task_type": "PRACTICAL"}))["id"],
        "haczyk": (await a.task(s1["id"], HACZYK))["id"],
        "quiz": (await a.task(s1["id"], QUIZ))["id"],
        "podkowa": (await a.task(s1["id"], {"name": "Podkowa", "task_type": "COURSE"}))["id"],
        "kleszcze": (await a.task(s2["id"], {"name": "Kleszcze kowalskie", "task_type": "PRACTICAL"}))["id"],
    }
    u = await make_user("jan@example.pl")
    await a.req("POST", "/admin/enrollments", 201, json={"user_id": str(u.id), "path_version_id": v["id"]})
    me = bearer(await login(api, "jan@example.pl"))
    return a, v, ids, u, me


async def test_fr_par01_my_paths(api, make_user):
    _, v, _, _, me = await _setup(api, make_user)
    r = await api.get("/api/v1/me/paths", headers=me)
    assert r.status_code == 200
    [e] = r.json()
    assert e["path_version_id"] == v["id"] and e["status"] == "ACTIVE"
    assert e["path"]["name"] == "Podstawy kowalstwa" and e["path"]["version"] == 1
    assert e["progress"] == {"completed": 0, "total": 5}


async def test_br01_progress_shows_whole_path_with_statuses(api, make_user):
    _, v, _, _, me = await _setup(api, make_user)
    r = await api.get(f"/api/v1/me/paths/{v['id']}/progress", headers=me)
    assert r.status_code == 200
    body = r.json()
    assert body["path"] == {"id": body["path"]["id"], "name": "Podstawy kowalstwa", "version": 1}
    assert body["progress"] == {"completed": 0, "total": 5}
    rows = [(t["label"], t["name"], t["task_type"], t["status"]) for st in body["stages"] for t in st["tasks"]]
    assert rows == [
        ("E1.1", "Gwóźdź", "PRACTICAL", "AVAILABLE"),
        ("E1.2", "Haczyk / zawieszka", "PRACTICAL", "LOCKED"),
        ("E1.3", "Stal i ogień — test wiedzy", "QUIZ", "LOCKED"),
        ("E1.4", "Podkowa", "COURSE", "AVAILABLE"),
        ("E2.1", "Kleszcze kowalskie", "PRACTICAL", "LOCKED"),
    ]
    assert [st["gate_open"] for st in body["stages"]] == [True, False]


async def test_q63_admin_reorder_and_deactivation_change_participant_view(api, make_user):
    a, v, ids, _, me = await _setup(api, make_user)
    s1 = (await a.structure(v["id"]))["stages"][0]["id"]
    await a.req(
        "PUT",
        f"/admin/stages/{s1}/tasks/order",
        json={"ids": [ids["quiz"], ids["gwozdz"], ids["haczyk"], ids["podkowa"]]},
    )
    await a.req("POST", f"/admin/tasks/{ids['haczyk']}/deactivate")
    body = (await api.get(f"/api/v1/me/paths/{v['id']}/progress", headers=me)).json()
    rows = [(t["label"], t["name"], t["status"]) for t in body["stages"][0]["tasks"]]
    assert rows == [
        ("E1.1", "Stal i ogień — test wiedzy", "AVAILABLE"),
        ("E1.2", "Gwóźdź", "LOCKED"),
        ("E1.3", "Podkowa", "AVAILABLE"),
    ]
    assert body["progress"]["total"] == 4


async def test_me_path_structure_without_statuses(api, make_user):
    _, v, _, _, me = await _setup(api, make_user)
    body = (await api.get(f"/api/v1/me/paths/{v['id']}", headers=me)).json()
    tasks = [t for st in body["stages"] for t in st["tasks"]]
    assert len(tasks) == 5 and "status" not in tasks[0] and tasks[0]["label"] == "E1.1"


async def test_br17_other_versions_are_404(api, make_user):
    a, v, ids, _, _ = await _setup(api, make_user)
    await make_user("obcy@example.pl")
    other = bearer(await login(api, "obcy@example.pl"))
    for url in (f"/me/paths/{v['id']}", f"/me/paths/{v['id']}/progress", f"/tasks/{ids['gwozdz']}"):
        r = await api.get(f"/api/v1{url}", headers=other)
        assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"


async def test_participant_endpoints_need_participant_role(api, make_user):
    await make_user("i@example.pl", "INSTRUCTOR")
    r = await api.get("/api/v1/me/paths", headers=bearer(await login(api, "i@example.pl")))
    assert r.status_code == 403


async def test_fr_par02_task_detail_with_status_and_current_content(api, make_user):
    _, _, ids, _, me = await _setup(api, make_user)
    r = await api.get(f"/api/v1/tasks/{ids['haczyk']}", headers=me)
    assert r.status_code == 200
    t = r.json()
    assert t["label"] == "E1.2" and t["status"] == "LOCKED" and t["stage"]["name"] == "Kowalstwo podstawowe"
    assert t["revision"]["material"] == HACZYK["material"]


async def test_br32_quiz_answer_key_hidden_from_participant(api, make_user):
    _, _, ids, _, me = await _setup(api, make_user)
    r = await api.get(f"/api/v1/tasks/{ids['quiz']}", headers=me)
    q = r.json()["revision"]["questions"]
    assert len(q) == 2 and all("is_correct" not in o for qu in q for o in qu["options"])
    assert "is_correct" not in r.text


async def test_br19_passed_task_shows_the_revision_it_was_passed_on(api, make_user, committed):
    a, _, ids, u, me = await _setup(api, make_user)
    rev1 = (await a.req("GET", f"/admin/tasks/{ids['gwozdz']}"))["revision"]["id"]
    async with committed() as s, s.begin():
        task = await s.get(Task, ids["gwozdz"])
        instr = await f.user(s, "INSTRUCTOR")
        await f.submission(s, task, u, 1, status="PASSED", instructor_id=instr.id, task_revision_id=rev1)
    await a.req("PUT", f"/admin/tasks/{ids['gwozdz']}", json={"name": "Gwóźdź kuty", "task_type": "PRACTICAL"})
    t = (await api.get(f"/api/v1/tasks/{ids['gwozdz']}", headers=me)).json()
    assert t["status"] == "PASSED" and t["revision"]["id"] == rev1 and t["revision"]["name"] == "Gwóźdź"
    # A task not passed yet shows the admin's latest content.
    await a.req("PUT", f"/admin/tasks/{ids['haczyk']}", json={**HACZYK, "name": "Haczyk"})
    assert (await api.get(f"/api/v1/tasks/{ids['haczyk']}", headers=me)).json()["revision"]["name"] == "Haczyk"


async def test_br20_deactivated_task_404_for_participant(api, make_user):
    a, _, ids, _, me = await _setup(api, make_user)
    await a.req("POST", f"/admin/tasks/{ids['kleszcze']}/deactivate")
    assert (await api.get(f"/api/v1/tasks/{ids['kleszcze']}", headers=me)).status_code == 404


async def test_br15_deactivating_last_unpassed_task_completes_enrollment(api, make_user, committed):
    a, v, ids, u, me = await _setup(api, make_user)
    async with committed() as s, s.begin():
        instr = await f.user(s, "INSTRUCTOR")
        for key in ("gwozdz", "haczyk", "quiz", "podkowa"):
            await f.submission(s, await s.get(Task, ids[key]), u, 1, status="PASSED", instructor_id=instr.id)
    assert (await api.get("/api/v1/me/paths", headers=me)).json()[0]["status"] == "ACTIVE"
    await a.req("POST", f"/admin/tasks/{ids['kleszcze']}/deactivate")
    [e] = (await api.get("/api/v1/me/paths", headers=me)).json()
    assert e["status"] == "COMPLETED" and e["completed_at"]
    # Q-42: a later new task does not reopen a completed enrollment.
    s2 = (await a.structure(v["id"]))["stages"][1]["id"]
    await a.task(s2, {"name": "Nowe", "task_type": "PRACTICAL"})
    assert (await api.get("/api/v1/me/paths", headers=me)).json()[0]["status"] == "COMPLETED"


async def test_me_profile(api, make_user):
    _, _, _, _, me = await _setup(api, make_user)
    r = await api.get("/api/v1/me", headers=me)
    assert r.status_code == 200 and r.json()["email"] == "jan@example.pl"
