"""M6: auto-graded quiz attempts (BR-32, BR-10 exception, BR-13, BR-15, Q-60)."""

from sqlalchemy import select

from app.models import Assessment, AuditLog, SubmissionAnswer
from tests.submission_helpers import pass_in_db, setup


async def _quiz_ready(api, make_user, committed, **kw):
    a, v, s, ids, u, me, e = await setup(api, make_user, **kw)
    await pass_in_db(committed, ids["bhp"], u)
    await pass_in_db(committed, ids["gwozdz"], u)
    admin_view = await a.req("GET", f"/admin/tasks/{ids['quiz']}")
    key = {q["id"]: [o["id"] for o in q["options"] if o["is_correct"]] for q in admin_view["revision"]["questions"]}
    wrong = {
        q["id"]: [o["id"] for o in q["options"] if not o["is_correct"]][:1] for q in admin_view["revision"]["questions"]
    }
    return a, ids, u, me, e, key, wrong


def answers(mapping):
    return {"answers": [{"question_id": q, "option_ids": o} for q, o in mapping.items()]}


async def test_br32_all_correct_passes_without_instructor(api, make_user, committed):
    _, ids, _, me, _, key, _ = await _quiz_ready(api, make_user, committed)
    r = await me.req("POST", f"/tasks/{ids['quiz']}/quiz-attempts", 201, json=answers(key))
    assert r["passed"] is True and r["score"] == 100 and (r["correct"], r["total"]) == (2, 2)
    assert r["submission"]["status"] == "PASSED" and r["submission"]["assessment"]["instructor"] is None
    assert r["review"] and {q["question_id"]: q["correct_option_ids"] for q in r["review"]} == key
    assert (await me.req("GET", f"/tasks/{ids['quiz']}"))["status"] == "PASSED"
    async with committed() as s:
        a = (await s.execute(select(Assessment).where(Assessment.submission_id == r["submission"]["id"]))).scalar_one()
        assert a.instructor_id is None and a.score == 100  # BR-13: PASSED always has its assessment
        assert len((await s.execute(select(SubmissionAnswer))).scalars().all()) == 2
        assert "QUIZ_ATTEMPTED" in set((await s.execute(select(AuditLog.action))).scalars())


async def test_br32_below_threshold_needs_improvement_hides_key_and_allows_retry(api, make_user, committed):
    _, ids, _, me, _, key, wrong = await _quiz_ready(api, make_user, committed)
    half = {**key, list(key)[1]: wrong[list(key)[1]]}  # 1 of 2 = 50% < 80%
    r = await me.req("POST", f"/tasks/{ids['quiz']}/quiz-attempts", 201, json=answers(half))
    assert r["passed"] is False and r["score"] == 50 and r["review"] is None
    assert r["submission"]["status"] == "NEEDS_IMPROVEMENT" and "is_correct" not in str(r)
    again = await me.req("POST", f"/tasks/{ids['quiz']}/quiz-attempts", 201, json=answers(key))
    assert again["submission"]["attempt_number"] == 2 and again["passed"] is True
    r = await me.req("POST", f"/tasks/{ids['quiz']}/quiz-attempts", 409, json=answers(key))
    assert r["error"]["code"] == "TASK_ALREADY_PASSED"


async def test_br32_multi_needs_exact_set(api, make_user, committed):
    _, ids, _, me, _, key, wrong = await _quiz_ready(api, make_user, committed)
    q_multi = list(key)[1]
    partial = {**key, q_multi: key[q_multi][:1]}  # only one of two correct options
    r = await me.req("POST", f"/tasks/{ids['quiz']}/quiz-attempts", 201, json=answers(partial))
    assert r["correct"] == 1


async def test_quiz_answers_validated(api, make_user, committed):
    _, ids, _, me, _, key, wrong = await _quiz_ready(api, make_user, committed)
    q1, q2 = list(key)
    bad_cases = [
        {q1: key[q1]},  # missing question
        {q1: key[q1], q2: ["00000000-0000-4000-8000-000000000000"]},  # unknown option
        {q1: key[q1] + wrong[q1], q2: key[q2]},  # two answers on a SINGLE question
        {q1: [], q2: key[q2]},  # nothing chosen
    ]
    for case in bad_cases:
        r = await me.req("POST", f"/tasks/{ids['quiz']}/quiz-attempts", 422, json=answers(case))
        assert r["error"]["code"] == "QUIZ_ANSWERS_INVALID"


async def test_quiz_endpoint_rules(api, make_user, committed):
    _, _, _, ids, u, me, _ = await setup(api, make_user)
    r = await me.req("POST", f"/tasks/{ids['quiz']}/quiz-attempts", 409, json={"answers": []})
    assert r["error"]["code"] == "TASK_LOCKED"  # BHP and Gwóźdź come first
    r = await me.req("POST", f"/tasks/{ids['bhp']}/quiz-attempts", 409, json={"answers": []})
    assert r["error"]["code"] == "TASK_NOT_QUIZ"


async def test_br15_passing_last_task_by_quiz_completes_enrollment(api, make_user, committed):
    _, ids, u, me, _, key, _ = await _quiz_ready(api, make_user, committed)
    await pass_in_db(committed, ids["podkowa"], u)
    await me.req("POST", f"/tasks/{ids['quiz']}/quiz-attempts", 201, json=answers(key))
    [e] = await me.req("GET", "/me/paths")
    assert e["status"] == "COMPLETED"
