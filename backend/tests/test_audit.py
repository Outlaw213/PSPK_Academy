"""M10: audit log in the operation's transaction, admin's read-only views (BR-18, FR-ADM-05, FR-ADM-06, NFR-02)."""

import json
import re
from pathlib import Path

from sqlalchemy import func, select

from app.models import AuditLog
from tests.conftest import PASSWORD, bearer, login
from tests.submission_helpers import pass_in_db, setup

API_MD = Path(__file__).resolve().parents[2] / "docs" / "api.md"


def catalogue() -> set[str]:
    section = API_MD.read_text(encoding="utf-8").split("## AuditLog — akcje", 1)[1]
    return set(re.findall(r"`([A-Z_]+)`", section))


async def actions(committed) -> list[str]:
    async with committed() as s:
        return list((await s.execute(select(AuditLog.action))).scalars())


async def _sent(api, me, task_id, text="Odpowiedź"):
    d = await me.draft(task_id, comment=text)
    return await me.submit(d["id"])


async def _with_instructor(api, make_user):
    a, v, s, ids, u, me, e = await setup(api, make_user)
    m = await make_user("marek@example.pl", "INSTRUCTOR", first_name="Marek")
    await a.req(
        "POST", "/admin/instructor-permissions", 201, json={"instructor_id": str(m.id), "path_version_id": v["id"]}
    )
    mh = bearer(await login(api, "marek@example.pl"))
    return a, v, s, ids, u, me, e, m, mh


async def test_br18_every_catalogued_action_is_written(api, make_user, committed):
    a, v, s, ids, u, me, e, m, mh = await _with_instructor(api, make_user)

    # Accounts.
    r = await api.post(
        "/api/v1/auth/register",
        json={"email": "nowy@example.pl", "password": PASSWORD, "first_name": "Nowy", "last_name": "Kowal"},
    )
    await a.req("POST", f"/admin/users/{r.json()['id']}/approve")
    r = await api.post(
        "/api/v1/auth/register",
        json={"email": "spam@example.pl", "password": PASSWORD, "first_name": "Spam", "last_name": "Bot"},
    )
    await a.req("POST", f"/admin/users/{r.json()['id']}/reject")
    created = await a.req(
        "POST",
        "/admin/users",
        201,
        json={
            "email": "ola@example.pl",
            "password": PASSWORD,
            "first_name": "Ola",
            "last_name": "Nowak",
            "roles": ["PARTICIPANT"],
        },
    )
    await a.req("PUT", f"/admin/users/{created['id']}", json={"last_name": "Nowak-Kowal"})
    await a.req("POST", f"/admin/users/{created['id']}/password", 204, json={"new_password": "nowe-haslo-ola-2026"})
    oh = bearer(await login(api, "ola@example.pl", "nowe-haslo-ola-2026"))
    r = await api.post(
        "/api/v1/auth/change-password",
        headers=oh,
        json={"current_password": "nowe-haslo-ola-2026", "new_password": "moje-haslo-ola-2026"},
    )
    assert r.status_code == 200

    # Content.
    await a.req("PUT", f"/admin/stages/{s['id']}", json={"name": "Kowalstwo podstawowe — etap 1"})
    await a.req(
        "PUT", f"/admin/tasks/{ids['bhp']}", json={"name": "Bezpieczeństwo pracy w kuźni", "task_type": "THEORY"}
    )
    extra = await a.task(s["id"], {"name": "Dodatkowe", "task_type": "THEORY"})
    await a.req("POST", f"/admin/tasks/{extra['id']}/deactivate")
    await a.req("POST", f"/admin/tasks/{extra['id']}/activate")
    order = [t["id"] for t in (await a.structure(v["id"]))["stages"][0]["tasks"]]
    await a.req("PUT", f"/admin/stages/{s['id']}/tasks/order", json={"ids": [order[-1], *order[:-1]]})
    await a.req("PUT", f"/admin/stages/{s['id']}/tasks/order", json={"ids": order})
    await a.req("POST", f"/admin/tasks/{extra['id']}/deactivate")

    # Permissions.
    an = await make_user("anna@example.pl", "INSTRUCTOR")
    perm = await a.req(
        "POST", "/admin/instructor-permissions", 201, json={"instructor_id": str(an.id), "stage_id": s["id"]}
    )
    await a.req("DELETE", f"/admin/instructor-permissions/{perm['id']}", 204)

    # Attempts and assessment.
    d = await me.draft(ids["bhp"], comment="Szkic")
    await me.req("POST", f"/submissions/{d['id']}/cancel")
    sub = await _sent(api, me, ids["bhp"])
    await api.post(f"/api/v1/submissions/{sub['id']}/claim", headers=mh)
    await api.post(f"/api/v1/submissions/{sub['id']}/release", headers=mh)
    await api.post(f"/api/v1/submissions/{sub['id']}/claim", headers=mh)
    r = await api.post(
        f"/api/v1/submissions/{sub['id']}/assessment",
        headers=mh,
        json={"result": "NEEDS_IMPROVEMENT", "comment": "Dopisz"},
    )
    assert r.status_code == 201
    sub = await _sent(api, me, ids["bhp"], "Poprawione")
    await api.post(f"/api/v1/submissions/{sub['id']}/claim", headers=mh)
    r = await api.post(f"/api/v1/submissions/{sub['id']}/assessment", headers=mh, json={"result": "PASSED"})
    assert r.status_code == 201
    await pass_in_db(committed, ids["gwozdz"], u)
    key = {
        q["id"]: [o["id"] for o in q["options"] if o["is_correct"]]
        for q in (await a.req("GET", f"/admin/tasks/{ids['quiz']}"))["revision"]["questions"]
    }
    body = {"answers": [{"question_id": q, "option_ids": o} for q, o in key.items()]}
    await me.req("POST", f"/tasks/{ids['quiz']}/quiz-attempts", 201, json=body)
    r = await api.post(
        f"/api/v1/instructor/courses/{ids['podkowa']}/results",
        headers=mh,
        json={"user_id": str(u.id), "result": "PASSED"},
    )
    assert r.status_code == 201
    assert (await me.req("GET", "/me/paths"))[0]["status"] == "COMPLETED"

    # Enrollment cancelled (another participant).
    ola = await a.req("POST", "/admin/enrollments", 201, json={"user_id": created["id"], "path_version_id": v["id"]})
    await a.req("POST", f"/admin/enrollments/{ola['id']}/cancel")

    written = set(await actions(committed))
    assert catalogue() - written == set()  # every action in docs/api.md is really written
    assert written - catalogue() == set()  # and nothing undocumented


async def test_br18_rejected_operation_leaves_no_entry(api, make_user, committed):
    a, v, _, ids, u, me, e, _, mh = await _with_instructor(api, make_user)
    sub = await _sent(api, me, ids["bhp"])
    await api.post(f"/api/v1/submissions/{sub['id']}/claim", headers=mh)
    before = await actions(committed)

    r = await api.post(f"/api/v1/submissions/{sub['id']}/assessment", headers=mh, json={"result": "NEEDS_IMPROVEMENT"})
    assert r.status_code == 422
    await a.req("POST", "/admin/enrollments", 409, json={"user_id": str(u.id), "path_version_id": v["id"]})
    assert (
        await api.post("/api/v1/auth/login", json={"email": "jan@example.pl", "password": "zle-haslo-123"})
    ).status_code == 401
    await me.draft(ids["gwozdz"], 409)  # locked
    await a.req("PUT", f"/admin/tasks/{ids['quiz']}", 422, json={"name": "Quiz", "task_type": "QUIZ", "questions": []})

    assert sorted(await actions(committed)) == sorted(before)


async def test_nfr02_no_passwords_or_tokens_in_audit(api, make_user, committed):
    a, *_ = await setup(api, make_user)
    secret = "tajne-haslo-kowala-77"
    r = await api.post(
        "/api/v1/auth/register", json={"email": "k@example.pl", "password": secret, "first_name": "K", "last_name": "K"}
    )
    await a.req("POST", f"/admin/users/{r.json()['id']}/approve")
    tokens = (await api.post("/api/v1/auth/login", json={"email": "k@example.pl", "password": secret})).json()
    await a.req("POST", f"/admin/users/{r.json()['id']}/password", 204, json={"new_password": "inne-tajne-haslo-88"})
    async with committed() as s:
        dump = json.dumps([row.meta for row in (await s.execute(select(AuditLog))).scalars()], ensure_ascii=False)
    for needle in (secret, "inne-tajne-haslo-88", tokens["access_token"], "password", "token"):
        assert needle not in dump


async def test_fr_adm06_audit_log_view(api, make_user, committed):
    a, v, _, ids, u, me, e, m, mh = await _with_instructor(api, make_user)
    sub = await _sent(api, me, ids["bhp"])
    await api.post(f"/api/v1/submissions/{sub['id']}/claim", headers=mh)
    await api.post(f"/api/v1/submissions/{sub['id']}/assessment", headers=mh, json={"result": "PASSED"})

    page = await a.req("GET", "/admin/audit-logs?limit=5")
    async with committed() as s:
        total = await s.scalar(select(func.count()).select_from(AuditLog))
    assert page["total"] == total and len(page["items"]) == 5 and page["limit"] == 5
    stamps = [i["created_at"] for i in page["items"]]
    assert stamps == sorted(stamps, reverse=True)  # newest first

    [claimed] = (await a.req("GET", "/admin/audit-logs?action=SUBMISSION_CLAIMED"))["items"]
    assert claimed["user"]["email"] == "marek@example.pl" and claimed["entity_type"] == "submission"
    assert claimed["entity_id"] == sub["id"] and claimed["metadata"] == {}

    trail = await a.req("GET", f"/admin/audit-logs?entity_type=submission&entity_id={sub['id']}")
    assert {i["action"] for i in trail["items"]} == {
        "SUBMISSION_CREATED",
        "SUBMISSION_SUBMITTED",
        "SUBMISSION_CLAIMED",
        "SUBMISSION_ASSESSED",
        "TASK_PASSED",
    }
    by_jan = await a.req("GET", f"/admin/audit-logs?user_id={u.id}")
    assert by_jan["total"] >= 3 and all(i["user"]["id"] == str(u.id) for i in by_jan["items"])

    # Date range: `from` inclusive, `to` exclusive.
    t = claimed["created_at"]
    since = await a.req("GET", "/admin/audit-logs", params={"from": t, "limit": 200})
    until = await a.req("GET", "/admin/audit-logs", params={"to": t, "limit": 200})
    assert claimed["id"] in {i["id"] for i in since["items"]} and claimed["id"] not in {i["id"] for i in until["items"]}
    assert since["total"] + until["total"] == total

    assert (await a.req("GET", "/admin/audit-logs?action=NO_SUCH_ACTION"))["total"] == 0
    assert (await api.get("/api/v1/admin/audit-logs", headers=mh)).status_code == 403


async def test_audit_log_system_actor_is_null(api, make_user, committed):
    _, _, _, ids, u, me, _ = await setup(api, make_user)
    for key in ("bhp", "gwozdz", "podkowa"):
        await pass_in_db(committed, ids[key], u)
    admin_h = bearer(await login(api, "admin@example.pl"))
    quiz = (await api.get(f"/api/v1/admin/tasks/{ids['quiz']}", headers=admin_h)).json()
    body = {
        "answers": [
            {"question_id": q["id"], "option_ids": [o["id"] for o in q["options"] if o["is_correct"]]}
            for q in quiz["revision"]["questions"]
        ]
    }
    await me.req("POST", f"/tasks/{ids['quiz']}/quiz-attempts", 201, json=body)
    page = (await api.get("/api/v1/admin/audit-logs?action=ENROLLMENT_COMPLETED", headers=admin_h)).json()
    assert [i["user"] for i in page["items"]] == [None]  # completed by the system after the quiz


async def test_fr_adm05_submissions_view(api, make_user, committed):
    a, v, _, ids, u, me, e, m, mh = await _with_instructor(api, make_user)
    await a.req(
        "PUT",
        f"/admin/tasks/{ids['bhp']}",
        json={"name": "Bezpieczeństwo pracy", "task_type": "THEORY", "evaluation_criteria": "Pięć zagrożeń"},
    )
    first = await _sent(api, me, ids["bhp"], "Trzy zagrożenia")
    await api.post(f"/api/v1/submissions/{first['id']}/claim", headers=mh)
    await api.post(
        f"/api/v1/submissions/{first['id']}/assessment",
        headers=mh,
        json={"result": "NEEDS_IMPROVEMENT", "comment": "Brakuje dwóch"},
    )
    second = await _sent(api, me, ids["bhp"], "Pięć zagrożeń")
    await me.req("POST", f"/submissions/{second['id']}/cancel")
    draft = await me.draft(ids["bhp"], comment="Szkic")

    page = await a.req("GET", "/admin/submissions")
    assert page["total"] == 3
    assert [i["submission"]["id"] for i in page["items"]] == [draft["id"], second["id"], first["id"]]  # newest first
    one = page["items"][2]
    assert one["participant"]["email"] == "jan@example.pl" and one["instructor"]["first_name"] == "Marek"
    assert one["task"]["label"] == "E1.1" and one["path"]["name"] == "Podstawy kowalstwa" and one["photo_count"] == 0
    assert one["submission"]["assessment"]["comment"] == "Brakuje dwóch"
    assert page["items"][0]["instructor"] is None

    async def ids_of(query):
        return [i["submission"]["id"] for i in (await a.req("GET", f"/admin/submissions?{query}"))["items"]]

    assert await ids_of("status=NEEDS_IMPROVEMENT") == [first["id"]]
    assert await ids_of(f"instructor_id={m.id}") == [first["id"]]
    assert len(await ids_of(f"user_id={u.id}")) == 3 and await ids_of(f"user_id={m.id}") == []
    assert len(await ids_of(f"path_version_id={v['id']}&task_id={ids['bhp']}")) == 3
    assert await ids_of(f"task_id={ids['gwozdz']}") == []
    assert len(await ids_of("limit=1&offset=1")) == 1

    d = await a.req("GET", f"/admin/submissions/{first['id']}")
    assert d["revision"]["evaluation_criteria"] == "Pięć zagrożeń"
    assert [x["id"] for x in d["attempts"]] == [draft["id"], second["id"], first["id"]]
    await a.req("GET", "/admin/submissions/00000000-0000-4000-8000-000000000000", 404)
    assert (await api.get("/api/v1/admin/submissions", headers=mh)).status_code == 403
    assert (await api.get("/api/v1/admin/submissions", headers=me.h)).status_code == 403
