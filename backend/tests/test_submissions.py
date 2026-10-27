"""M6: participant attempts — draft, submit, cancel, history (BR-03, BR-04, BR-05, BR-11, BR-14, BR-17, BR-21–23)."""

from sqlalchemy import func, select, update

from app.models import AuditLog, Submission
from tests.conftest import bearer, login
from tests.submission_helpers import Participant, jpeg, pass_in_db, setup


async def count_submissions(committed) -> int:
    async with committed() as s:
        return await s.scalar(select(func.count()).select_from(Submission))


async def set_status(committed, sub_id, **values):
    async with committed() as s, s.begin():
        await s.execute(update(Submission).where(Submission.id == sub_id).values(**values))


async def test_test12_br11_draft_for_locked_task_rejected_and_nothing_saved(api, make_user, committed):
    _, _, _, ids, _, me, _ = await setup(api, make_user)
    r = await me.draft(ids["gwozdz"], 409)  # BHP comes first and is not passed
    assert r["error"]["code"] == "TASK_LOCKED"
    assert await count_submissions(committed) == 0


async def test_br21_draft_created_and_br14_second_open_attempt_rejected(api, make_user, committed):
    _, _, _, ids, _, me, _ = await setup(api, make_user)
    d = await me.draft(ids["bhp"], comment="Notatka")
    assert (
        d["status"] == "DRAFT"
        and d["attempt_number"] == 1
        and d["comment"] == "Notatka"
        and d["task_revision_id"] is None
    )
    r = await me.draft(ids["bhp"], 409)
    assert r["error"]["code"] == "SUBMISSION_PENDING"
    progress = await me.req("GET", f"/tasks/{ids['bhp']}")
    assert progress["status"] == "IN_PROGRESS"
    async with committed() as s:
        assert "SUBMISSION_CREATED" in set((await s.execute(select(AuditLog.action))).scalars())


async def test_br30_br32_course_and_quiz_have_no_drafts(api, make_user):
    _, _, _, ids, _, me, _ = await setup(api, make_user)
    assert (await me.draft(ids["podkowa"], 409))["error"]["code"] == "TASK_IS_COURSE"
    assert (await me.draft(ids["quiz"], 409))["error"]["code"] == "TASK_IS_QUIZ"


async def test_no_active_enrollment_403(api, make_user):
    a, _, _, ids, _, me, e = await setup(api, make_user)
    await a.req("POST", f"/admin/enrollments/{e['id']}/cancel")
    r = await me.draft(ids["bhp"], 403)
    assert r["error"]["code"] == "NO_ACTIVE_ENROLLMENT"


async def test_br22_practical_needs_photo_theory_needs_comment_or_photo(api, make_user, committed):
    _, _, _, ids, u, me, _ = await setup(api, make_user)
    d = await me.draft(ids["bhp"])
    r = await me.submit(d["id"], 422)
    assert r["error"]["code"] == "SUBMISSION_REQUIREMENTS_NOT_MET"
    await me.req("PATCH", f"/submissions/{d['id']}", json={"comment": "   "})
    await me.submit(d["id"], 422)  # whitespace is not a comment
    await me.req("PATCH", f"/submissions/{d['id']}", json={"comment": "Pięć zagrożeń: …"})
    assert (await me.submit(d["id"]))["status"] == "SUBMITTED"

    await pass_in_db(committed, ids["bhp"], u)
    w = await me.draft(ids["gwozdz"], comment="Bez zdjęcia")
    await me.submit(w["id"], 422)
    await me.photo(w["id"], jpeg())
    sent = await me.submit(w["id"])
    assert sent["status"] == "SUBMITTED" and sent["submitted_at"] and sent["task_revision_id"]


async def test_br21_sent_submission_is_immutable(api, make_user):
    _, _, _, ids, _, me, _ = await setup(api, make_user)
    d = await me.draft(ids["bhp"], comment="Odpowiedź")
    await me.submit(d["id"])
    for method, url, kw in [
        ("PATCH", f"/submissions/{d['id']}", {"json": {"comment": "zmiana"}}),
        ("POST", f"/submissions/{d['id']}/photos", {"files": {"file": ("a.jpg", jpeg(), "image/jpeg")}}),
        ("POST", f"/submissions/{d['id']}/submit", {}),
    ]:
        r = await me.req(method, url, 409, **kw)
        assert r["error"]["code"] == "INVALID_STATE_TRANSITION"


async def test_br19_submission_remembers_revision_at_send_time(api, make_user):
    a, _, _, ids, _, me, _ = await setup(api, make_user)
    d = await me.draft(ids["bhp"], comment="x")
    await a.req("PUT", f"/admin/tasks/{ids['bhp']}", json={"name": "BHP (nowa treść)", "task_type": "THEORY"})
    sent = await me.submit(d["id"])
    detail = await me.req("GET", f"/submissions/{d['id']}")
    assert detail["revision"]["name"] == "BHP (nowa treść)" and detail["task_revision_id"] == sent["task_revision_id"]
    await a.req("PUT", f"/admin/tasks/{ids['bhp']}", json={"name": "BHP v3", "task_type": "THEORY"})
    assert (await me.req("GET", f"/submissions/{d['id']}"))["revision"]["name"] == "BHP (nowa treść)"


async def test_br23_cancel_draft_or_sent_before_claim_but_not_after(api, make_user, committed):
    _, _, _, ids, _, me, _ = await setup(api, make_user)
    d = await me.draft(ids["bhp"])
    c = await me.req("POST", f"/submissions/{d['id']}/cancel")
    assert c["status"] == "CANCELLED" and c["cancelled_at"]
    d2 = await me.draft(ids["bhp"], comment="x")
    assert d2["attempt_number"] == 2  # the cancelled attempt stays in history (BR-04)
    await me.submit(d2["id"])
    assert (await me.req("POST", f"/submissions/{d2['id']}/cancel"))["status"] == "CANCELLED"
    d3 = await me.draft(ids["bhp"], comment="x")
    await me.submit(d3["id"])
    instr = await make_user("i@example.pl", "INSTRUCTOR")
    await set_status(committed, d3["id"], status="UNDER_REVIEW", instructor_id=instr.id)
    r = await me.req("POST", f"/submissions/{d3['id']}/cancel", 409)
    assert r["error"]["code"] == "SUBMISSION_ALREADY_CLAIMED"


async def test_test5_test7_br03_br04_twenty_attempts_all_kept_and_next_possible(api, make_user, committed):
    _, _, _, ids, _, me, _ = await setup(api, make_user)
    for n in range(1, 21):
        d = await me.draft(ids["bhp"], comment=f"Próba {n}")
        assert d["attempt_number"] == n
        await me.submit(d["id"])
        await set_status(committed, d["id"], status="NEEDS_IMPROVEMENT")  # instructor's verdict (M8)
    nxt = await me.draft(ids["bhp"], comment="Próba 21")
    assert nxt["attempt_number"] == 21
    history = await me.req("GET", f"/tasks/{ids['bhp']}/submissions")
    assert [h["attempt_number"] for h in history] == list(range(21, 0, -1))
    assert history[-1]["comment"] == "Próba 1"


async def test_test6_br05_no_attempt_after_pass(api, make_user, committed):
    _, _, _, ids, u, me, _ = await setup(api, make_user)
    await pass_in_db(committed, ids["bhp"], u)
    r = await me.draft(ids["bhp"], 409)
    assert r["error"]["code"] == "TASK_ALREADY_PASSED"


async def test_br02_submit_rechecks_order_after_admin_reorder(api, make_user, committed):
    a, _, s, ids, u, me, _ = await setup(api, make_user)
    await pass_in_db(committed, ids["bhp"], u)
    d = await me.draft(ids["gwozdz"])
    await me.photo(d["id"], jpeg())
    # Admin puts the quiz before Gwóźdź: Gwóźdź is no longer in order.
    await a.req(
        "PUT",
        f"/admin/stages/{s['id']}/tasks/order",
        json={"ids": [ids["bhp"], ids["quiz"], ids["gwozdz"], ids["podkowa"]]},
    )
    r = await me.submit(d["id"], 409)
    assert r["error"]["code"] == "TASK_LOCKED"
    assert (await me.req("GET", f"/tasks/{ids['gwozdz']}"))["status"] == "IN_PROGRESS"  # Q-40


async def test_br17_other_peoples_submissions_are_404(api, make_user):
    _, _, _, ids, _, me, _ = await setup(api, make_user)
    d = await me.draft(ids["bhp"], comment="moje")
    await make_user("obcy@example.pl")
    other = Participant(api, bearer(await login(api, "obcy@example.pl")))
    for method, url in [
        ("GET", f"/submissions/{d['id']}"),
        ("PATCH", f"/submissions/{d['id']}"),
        ("POST", f"/submissions/{d['id']}/submit"),
        ("POST", f"/submissions/{d['id']}/cancel"),
        ("GET", f"/tasks/{ids['bhp']}/submissions"),
    ]:
        kw = {"json": {"comment": "x"}} if method == "PATCH" else {}
        r = await other.req(method, url, 404, **kw)
        assert r["error"]["code"] == "NOT_FOUND"


async def test_audit_trail_of_an_attempt(api, make_user, committed):
    _, _, _, ids, _, me, _ = await setup(api, make_user)
    d = await me.draft(ids["bhp"], comment="x")
    await me.submit(d["id"])
    await me.req("POST", f"/submissions/{d['id']}/cancel")
    async with committed() as s:
        acts = list(
            (
                await s.execute(
                    select(AuditLog.action).where(AuditLog.entity_id == d["id"]).order_by(AuditLog.created_at)
                )
            ).scalars()
        )
    assert acts == ["SUBMISSION_CREATED", "SUBMISSION_SUBMITTED", "SUBMISSION_CANCELLED"]
