"""Q-68: a locked task can be read in full but not started; a locked quiz hides its questions (BR-01, BR-32)."""

from tests.content_helpers import HACZYK
from tests.submission_helpers import jpeg, pass_in_db, setup


async def test_br01_q68_locked_task_content_visible(api, make_user):
    a, _, _, ids, _, me, _ = await setup(api, make_user, extra_tasks=[("haczyk", HACZYK)])
    t = await a.req(
        "POST",
        f"/admin/tasks/{ids['haczyk']}/materials",
        201,
        files={"file": ("wzor.jpg", jpeg(), "image/jpeg")},
        data={"caption": "Wzór"},
    )
    material = t["revision"]["materials"][0]

    detail = await me.req("GET", f"/tasks/{ids['haczyk']}")
    assert detail["status"] == "LOCKED"
    r = detail["revision"]
    assert r["assignment"] == HACZYK["assignment"] and r["evaluation_criteria"] == HACZYK["evaluation_criteria"]
    assert [m["caption"] for m in r["materials"]] == ["Wzór"]
    photo = await me.req("GET", f"/tasks/{ids['haczyk']}/materials/{material['id']}")
    assert photo.status_code == 200 and photo.headers["content-type"] == "image/webp"

    err = await me.draft(ids["haczyk"], 409)  # readable, but cannot be started
    assert err["error"]["code"] == "TASK_LOCKED"


async def test_q68_locked_quiz_hides_questions(api, make_user, committed):
    _, _, _, ids, u, me, _ = await setup(api, make_user)
    locked = await me.req("GET", f"/tasks/{ids['quiz']}")
    assert locked["status"] == "LOCKED"
    assert locked["revision"]["questions"] == [] and locked["revision"]["question_count"] == 2
    assert locked["revision"]["pass_threshold"] == 80 and locked["revision"]["content_md"]

    await pass_in_db(committed, ids["bhp"], u)
    await pass_in_db(committed, ids["gwozdz"], u)
    open_ = await me.req("GET", f"/tasks/{ids['quiz']}")
    assert open_["status"] == "AVAILABLE"
    questions = open_["revision"]["questions"]
    assert len(questions) == 2 and open_["revision"]["question_count"] == 2
    assert all("is_correct" not in o for q in questions for o in q["options"])  # the key never leaves the server


async def test_q68_question_count_for_other_tasks_is_zero(api, make_user):
    _, _, _, ids, _, me, _ = await setup(api, make_user)
    assert (await me.req("GET", f"/tasks/{ids['bhp']}"))["revision"]["question_count"] == 0
