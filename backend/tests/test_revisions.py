"""M4: immutable task content revisions (BR-19, Q-06, ADR-14) — admin side."""

from tests.content_helpers import HACZYK, QUIZ, make_admin


async def _setup(api, make_user, content=HACZYK):
    a = await make_admin(api, make_user)
    p = await a.path()
    v = await a.version(p["id"])
    s = await a.stage(v["id"])
    t = await a.task(s["id"], content)
    return a, t


async def test_br19_create_makes_revision_1(api, make_user):
    _, t = await _setup(api, make_user)
    assert t["revision"]["revision_number"] == 1
    assert t["revision"]["name"] == "Haczyk / zawieszka" and t["revision"]["quantity_description"] == "2 sztuki"


async def test_br19_every_edit_creates_new_revision_old_ones_unchanged(api, make_user):
    a, t = await _setup(api, make_user)
    edited = await a.req("PUT", f"/admin/tasks/{t['id']}", json={**HACZYK, "material": "pręt Ø 10 mm"})
    assert edited["revision"]["revision_number"] == 2 and edited["revision"]["material"] == "pręt Ø 10 mm"
    await a.req("PUT", f"/admin/tasks/{t['id']}", json={**HACZYK, "name": "Haczyk"})
    history = await a.req("GET", f"/admin/tasks/{t['id']}/revisions")
    assert [r["revision_number"] for r in history] == [3, 2, 1]
    assert history[2]["material"] == HACZYK["material"]  # revision 1 still as it was
    assert history[2]["id"] == t["revision"]["id"]


async def test_br19_saving_identical_content_does_not_create_revision(api, make_user):
    a, t = await _setup(api, make_user)
    same = await a.req("PUT", f"/admin/tasks/{t['id']}", json=HACZYK)
    assert same["revision"]["revision_number"] == 1
    assert len(await a.req("GET", f"/admin/tasks/{t['id']}/revisions")) == 1


async def test_br19_quiz_questions_belong_to_their_revision(api, make_user):
    a, t = await _setup(api, make_user, QUIZ)
    changed = {**QUIZ, "questions": [QUIZ["questions"][0]], "video_links": []}
    edited = await a.req("PUT", f"/admin/tasks/{t['id']}", json=changed)
    assert len(edited["revision"]["questions"]) == 1 and edited["revision"]["video_links"] == []
    first = (await a.req("GET", f"/admin/tasks/{t['id']}/revisions"))[-1]
    assert len(first["questions"]) == 2 and len(first["video_links"]) == 1


async def test_task_type_can_change_between_revisions(api, make_user):
    a, t = await _setup(api, make_user)
    edited = await a.req("PUT", f"/admin/tasks/{t['id']}", json={**QUIZ})
    assert edited["revision"]["task_type"] == "QUIZ" and len(edited["revision"]["questions"]) == 2
