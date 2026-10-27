"""M4: learning paths and versions (FR-ADM-02, BR-12, BR-24, Q-07, TEST 13)."""

from sqlalchemy import select

from app.models import Enrollment, InstructorPathPermission, InstructorStagePermission
from tests.conftest import bearer, login
from tests.content_helpers import HACZYK, QUIZ, make_admin


async def test_fr_adm02_content_endpoints_are_admin_only(api, make_user):
    assert (await api.get("/api/v1/admin/paths")).status_code == 401
    await make_user("i@example.pl", "INSTRUCTOR", "PARTICIPANT")
    r = await api.post("/api/v1/admin/paths", json={"name": "X"}, headers=bearer(await login(api, "i@example.pl")))
    assert r.status_code == 403


async def test_fr_adm02_create_path_and_list(api, make_user):
    a = await make_admin(api, make_user)
    p = await a.path()
    assert p["name"] == "Podstawy kowalstwa" and p["is_active"] is True
    page = await a.req("GET", "/admin/paths")
    assert page["total"] == 1 and page["items"][0]["id"] == p["id"]


async def test_br12_versions_numbered_and_start_closed_for_enrollment(api, make_user):
    a = await make_admin(api, make_user)
    p = await a.path()
    v1 = await a.version(p["id"])
    v2 = await a.version(p["id"])
    assert (v1["version_number"], v2["version_number"]) == (1, 2)
    assert v1["is_active"] is False
    opened = await a.req("PUT", f"/admin/path-versions/{v1['id']}", json={"is_active": True})
    assert opened["is_active"] is True
    detail = await a.req("GET", f"/admin/paths/{p['id']}")
    assert [v["version_number"] for v in detail["versions"]] == [1, 2]


async def test_test13_new_version_does_not_move_existing_enrollment(api, make_user, committed):
    a = await make_admin(api, make_user)
    p = await a.path()
    v1 = await a.version(p["id"])
    u = await make_user("p@example.pl")
    async with committed() as s, s.begin():
        s.add(Enrollment(user_id=u.id, path_version_id=v1["id"], learning_path_id=p["id"], status="ACTIVE"))
    await a.version(p["id"], copy_from=v1["id"])
    async with committed() as s:
        e = (await s.execute(select(Enrollment).where(Enrollment.user_id == u.id))).scalar_one()
    assert str(e.path_version_id) == v1["id"]


async def test_q07_br24_copy_version_copies_structure_content_and_permissions(api, make_user, committed):
    a = await make_admin(api, make_user)
    p = await a.path()
    v1 = await a.version(p["id"])
    s1 = await a.stage(v1["id"], "Kowalstwo podstawowe")
    s2 = await a.stage(v1["id"], "Kowalstwo zaawansowane")
    await a.task(s1["id"], {"name": "Gwóźdź", "task_type": "PRACTICAL"})
    await a.task(s1["id"], HACZYK)
    await a.task(s2["id"], QUIZ)
    whole = await make_user("marek@example.pl", "INSTRUCTOR")
    one_stage = await make_user("anna@example.pl", "INSTRUCTOR")
    async with committed() as s, s.begin():
        s.add(InstructorPathPermission(instructor_id=whole.id, path_version_id=v1["id"]))
        s.add(InstructorStagePermission(instructor_id=one_stage.id, stage_id=s2["id"]))

    v2 = await a.version(p["id"], copy_from=v1["id"])
    assert v2["copied_from_version_id"] == v1["id"] and v2["version_number"] == 2 and v2["is_active"] is False

    old, new = await a.structure(v1["id"]), await a.structure(v2["id"])
    shape = lambda s: [(st["name"], [(t["label"], t["revision"]["name"]) for t in st["tasks"]]) for st in s["stages"]]  # noqa: E731
    assert shape(new) == shape(old)
    new_ids = {t["id"] for st in new["stages"] for t in st["tasks"]}
    old_ids = {t["id"] for st in old["stages"] for t in st["tasks"]}
    assert not new_ids & old_ids  # separate tasks, history of v1 untouched

    copied_quiz = new["stages"][1]["tasks"][0]["revision"]
    assert [q["text"] for q in copied_quiz["questions"]] == [q["text"] for q in QUIZ["questions"]]
    assert copied_quiz["questions"][1]["options"][2]["is_correct"] is True
    assert copied_quiz["video_links"][0]["url"] == QUIZ["video_links"][0]["url"]
    assert new["stages"][0]["tasks"][1]["revision"]["material"] == HACZYK["material"]

    async with committed() as s:
        path_perms = (
            await s.execute(
                select(InstructorPathPermission.path_version_id).where(
                    InstructorPathPermission.instructor_id == whole.id
                )
            )
        ).scalars()
        stage_perms = (
            await s.execute(
                select(InstructorStagePermission.stage_id).where(
                    InstructorStagePermission.instructor_id == one_stage.id
                )
            )
        ).scalars()
        assert {str(x) for x in path_perms} == {v1["id"], v2["id"]}
        assert {str(x) for x in stage_perms} == {s2["id"], new["stages"][1]["id"]}  # mapped to the new stage


async def test_copy_from_version_of_another_path_rejected(api, make_user):
    a = await make_admin(api, make_user)
    p1, p2 = await a.path("A"), await a.path("B")
    v = await a.version(p1["id"])
    await a.req("POST", f"/admin/paths/{p2['id']}/versions", 422, json={"copy_from_version_id": v["id"]})


async def test_unknown_ids_404(api, make_user):
    a = await make_admin(api, make_user)
    nope = "00000000-0000-4000-8000-000000000000"
    await a.req("GET", f"/admin/paths/{nope}", 404)
    await a.req("GET", f"/admin/path-versions/{nope}", 404)
    await a.req("POST", "/admin/stages", 404, json={"path_version_id": nope, "name": "X"})
    await a.req("POST", "/admin/tasks", 404, json={"stage_id": nope, "name": "X", "task_type": "PRACTICAL"})
