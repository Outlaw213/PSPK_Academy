"""M3: admin user management (FR-ADM-01, BR-26, BR-27, BR-28, BR-18)."""

from sqlalchemy import select

from app.models import AuditLog, Submission
from tests import factories as f
from tests.conftest import PASSWORD, bearer, login


async def admin_headers(api, make_user) -> dict:
    await make_user("admin@example.pl", "ADMIN")
    return bearer(await login(api, "admin@example.pl"))


async def actions(committed) -> list[str]:
    async with committed() as s:
        return list((await s.execute(select(AuditLog.action).order_by(AuditLog.created_at))).scalars())


async def test_fr_adm01_admin_only(api, make_user):
    assert (await api.get("/api/v1/admin/users")).status_code == 401
    await make_user("p@example.pl", "PARTICIPANT", "INSTRUCTOR")
    r = await api.get("/api/v1/admin/users", headers=bearer(await login(api, "p@example.pl")))
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"


async def test_fr_adm01_list_filters_and_pagination(api, make_user):
    h = await admin_headers(api, make_user)
    await make_user("ewa@example.pl", status="PENDING_APPROVAL", first_name="Ewa")
    await make_user("marek@example.pl", "INSTRUCTOR", first_name="Marek")
    await make_user("piotr@example.pl", first_name="Piotr")

    pending = (await api.get("/api/v1/admin/users?status=PENDING_APPROVAL", headers=h)).json()
    assert [u["email"] for u in pending["items"]] == ["ewa@example.pl"]

    instructors = (await api.get("/api/v1/admin/users?role=INSTRUCTOR", headers=h)).json()
    assert [u["email"] for u in instructors["items"]] == ["marek@example.pl"]

    search = (await api.get("/api/v1/admin/users?q=PIOTR", headers=h)).json()
    assert [u["email"] for u in search["items"]] == ["piotr@example.pl"]

    page = (await api.get("/api/v1/admin/users?limit=2&offset=0", headers=h)).json()
    assert page["total"] == 4 and len(page["items"]) == 2 and page["limit"] == 2 and page["offset"] == 0


async def test_fr_adm01_create_user_active_with_roles(api, make_user, committed):
    h = await admin_headers(api, make_user)
    r = await api.post(
        "/api/v1/admin/users",
        json={
            "email": "Marek@Example.pl",
            "password": PASSWORD,
            "first_name": "Marek",
            "last_name": "Nowak",
            "roles": ["INSTRUCTOR", "PARTICIPANT"],
        },
        headers=h,
    )
    assert r.status_code == 201
    assert r.json()["status"] == "ACTIVE" and sorted(r.json()["roles"]) == ["INSTRUCTOR", "PARTICIPANT"]
    await login(api, "marek@example.pl")
    assert "USER_CREATED" in await actions(committed)

    dup = await api.post(
        "/api/v1/admin/users",
        json={"email": "marek@EXAMPLE.pl", "password": PASSWORD, "first_name": "M", "last_name": "N", "roles": []},
        headers=h,
    )
    assert dup.status_code == 409


async def test_br28_approve_then_login_works(api, make_user, committed):
    h = await admin_headers(api, make_user)
    u = await make_user("ewa@example.pl", status="PENDING_APPROVAL")
    r = await api.post(f"/api/v1/admin/users/{u.id}/approve", headers=h)
    assert r.status_code == 200 and r.json()["status"] == "ACTIVE"
    await login(api, "ewa@example.pl")
    # Only from PENDING_APPROVAL.
    again = await api.post(f"/api/v1/admin/users/{u.id}/approve", headers=h)
    assert again.status_code == 409 and again.json()["error"]["code"] == "INVALID_STATE_TRANSITION"
    assert "USER_APPROVED" in await actions(committed)


async def test_br28_reject_keeps_account_and_email_taken(api, make_user):
    h = await admin_headers(api, make_user)
    u = await make_user("ewa@example.pl", status="PENDING_APPROVAL")
    r = await api.post(f"/api/v1/admin/users/{u.id}/reject", headers=h)
    assert r.status_code == 200 and r.json()["status"] == "REJECTED"
    reg = await api.post(
        "/api/v1/auth/register",
        json={"email": "ewa@example.pl", "password": PASSWORD, "first_name": "E", "last_name": "S"},
    )
    assert reg.status_code == 409


async def test_fr_adm01_edit_data_roles_and_reactivate(api, make_user):
    h = await admin_headers(api, make_user)
    u = await make_user("piotr@example.pl")
    r = await api.put(
        f"/api/v1/admin/users/{u.id}",
        json={"first_name": "Piotr", "last_name": "Zieliński", "roles": ["PARTICIPANT", "INSTRUCTOR"]},
        headers=h,
    )
    assert r.status_code == 200
    assert r.json()["last_name"] == "Zieliński" and sorted(r.json()["roles"]) == ["INSTRUCTOR", "PARTICIPANT"]

    r = await api.put(f"/api/v1/admin/users/{u.id}", json={"status": "DEACTIVATED"}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "DEACTIVATED"
    bad = await api.post("/api/v1/auth/login", json={"email": "piotr@example.pl", "password": PASSWORD})
    assert bad.status_code == 403
    r = await api.put(f"/api/v1/admin/users/{u.id}", json={"status": "ACTIVE"}, headers=h)
    assert r.status_code == 200
    await login(api, "piotr@example.pl")


async def test_fr_adm01_status_change_only_between_active_and_deactivated(api, make_user):
    h = await admin_headers(api, make_user)
    pending = await make_user("ewa@example.pl", status="PENDING_APPROVAL")
    r = await api.put(f"/api/v1/admin/users/{pending.id}", json={"status": "ACTIVE"}, headers=h)
    assert r.status_code == 409  # pending accounts go through approve/reject
    r = await api.put(f"/api/v1/admin/users/{pending.id}", json={"status": "REJECTED"}, headers=h)
    assert r.status_code == 422


async def test_fr_adm01_admin_cannot_lock_themselves_out(api, make_user, committed):
    h = await admin_headers(api, make_user)
    async with committed() as s:
        from app.models import User

        me = (await s.execute(select(User).where(User.email == "admin@example.pl"))).scalar_one()
    r = await api.put(f"/api/v1/admin/users/{me.id}", json={"status": "DEACTIVATED"}, headers=h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "CANNOT_MODIFY_SELF"
    r = await api.put(f"/api/v1/admin/users/{me.id}", json={"roles": ["PARTICIPANT"]}, headers=h)
    assert r.status_code == 409


async def test_fr_adm01_admin_sets_password_and_kills_sessions(api, make_user, committed):
    h = await admin_headers(api, make_user)
    u = await make_user("piotr@example.pl")
    old = await login(api, "piotr@example.pl")
    r = await api.post(f"/api/v1/admin/users/{u.id}/password", json={"new_password": "nowe-haslo-od-admina"}, headers=h)
    assert r.status_code == 204
    assert (await api.get("/api/v1/auth/me", headers=bearer(old))).status_code == 401
    assert (await api.post("/api/v1/auth/refresh", json={"refresh_token": old["refresh_token"]})).status_code == 401
    await login(api, "piotr@example.pl", "nowe-haslo-od-admina")
    assert "USER_PASSWORD_RESET" in await actions(committed)


async def test_fr_adm01_unknown_user_404(api, make_user):
    h = await admin_headers(api, make_user)
    r = await api.put("/api/v1/admin/users/00000000-0000-4000-8000-000000000000", json={"first_name": "X"}, headers=h)
    assert r.status_code == 404


async def _under_review(committed, make_user):
    """A participant's submission claimed by an instructor (committed)."""
    instr = await make_user("marek@example.pl", "INSTRUCTOR")
    async with committed() as s, s.begin():
        v = await f.path_version(s)
        st = await f.stage(s, v)
        t = await f.task(s, st)
        p = await f.user(s, "PARTICIPANT")
        sub = await f.submission(s, t, p, status="UNDER_REVIEW", instructor_id=instr.id, claimed_at=f.now())
    return instr, sub


async def _reload(committed, sub) -> Submission:
    async with committed() as s:
        return await s.get(Submission, sub.id)


async def test_br26_deactivating_instructor_releases_claimed_submissions(api, make_user, committed):
    h = await admin_headers(api, make_user)
    instr, sub = await _under_review(committed, make_user)
    r = await api.put(f"/api/v1/admin/users/{instr.id}", json={"status": "DEACTIVATED"}, headers=h)
    assert r.status_code == 200
    s = await _reload(committed, sub)
    assert s.status == "SUBMITTED" and s.instructor_id is None and s.claimed_at is None
    assert "SUBMISSION_RELEASED" in await actions(committed)


async def test_br26_removing_instructor_role_releases_claimed_submissions(api, make_user, committed):
    h = await admin_headers(api, make_user)
    instr, sub = await _under_review(committed, make_user)
    r = await api.put(f"/api/v1/admin/users/{instr.id}", json={"roles": ["PARTICIPANT"]}, headers=h)
    assert r.status_code == 200
    assert (await _reload(committed, sub)).status == "SUBMITTED"


async def test_br26_unrelated_edit_keeps_claim(api, make_user, committed):
    h = await admin_headers(api, make_user)
    instr, sub = await _under_review(committed, make_user)
    r = await api.put(f"/api/v1/admin/users/{instr.id}", json={"first_name": "Marek"}, headers=h)
    assert r.status_code == 200
    assert (await _reload(committed, sub)).status == "UNDER_REVIEW"
