"""M3: authentication (FR-AUTH-01…07, BR-27, BR-28, ADR-09, ADR-19, ADR-26)."""

import logging

from sqlalchemy import func, select

from app.models import AuditLog, RefreshToken, User
from tests.conftest import PASSWORD, bearer, login

REG = {"email": "Nowy.Kowal@Example.pl", "password": PASSWORD, "first_name": "Ewa", "last_name": "Szymańska"}


async def audit_actions(committed) -> list[str]:
    async with committed() as s:
        return list((await s.execute(select(AuditLog.action).order_by(AuditLog.created_at))).scalars())


# --- register ------------------------------------------------------------------------------


async def test_fr_auth01_register_pending_participant_without_tokens(api, committed, caplog):
    caplog.set_level(logging.DEBUG)
    r = await api.post("/api/v1/auth/register", json=REG)
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "PENDING_APPROVAL"
    assert body["roles"] == ["PARTICIPANT"]
    assert body["email"] == "nowy.kowal@example.pl"
    assert "access_token" not in body and "password" not in r.text and "password_hash" not in r.text
    assert PASSWORD not in caplog.text  # NFR-02
    assert await audit_actions(committed) == ["USER_REGISTERED"]


async def test_fr_auth01_email_taken_case_insensitive(api, make_user):
    await make_user("nowy.kowal@example.pl")
    r = await api.post("/api/v1/auth/register", json=REG)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "EMAIL_ALREADY_EXISTS"


async def test_fr_auth01_password_min_10_chars(api):
    r = await api.post("/api/v1/auth/register", json={**REG, "password": "krotkie9!"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "krotkie9!" not in r.text  # validation errors never echo input


async def test_fr_auth01_invalid_email(api):
    r = await api.post("/api/v1/auth/register", json={**REG, "email": "nie-email"})
    assert r.status_code == 422


# --- login ---------------------------------------------------------------------------------


async def test_br28_pending_account_cannot_log_in_until_approved(api, make_user):
    await make_user("a@example.pl", status="PENDING_APPROVAL")
    r = await api.post("/api/v1/auth/login", json={"email": "a@example.pl", "password": PASSWORD})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "ACCOUNT_PENDING_APPROVAL"


async def test_br28_rejected_and_deactivated_cannot_log_in(api, make_user):
    for i, status in enumerate(["REJECTED", "DEACTIVATED"]):
        await make_user(f"x{i}@example.pl", status=status)
        r = await api.post("/api/v1/auth/login", json={"email": f"x{i}@example.pl", "password": PASSWORD})
        assert r.status_code == 403
        assert r.json()["error"]["code"] == "ACCOUNT_INACTIVE"


async def test_fr_auth02_bad_credentials_do_not_reveal_which_field(api, make_user):
    await make_user("a@example.pl")
    wrong_pw = await api.post("/api/v1/auth/login", json={"email": "a@example.pl", "password": "zle-haslo-123"})
    no_user = await api.post("/api/v1/auth/login", json={"email": "nikt@example.pl", "password": PASSWORD})
    assert wrong_pw.status_code == no_user.status_code == 401
    assert wrong_pw.json() == no_user.json()
    assert wrong_pw.json()["error"]["code"] == "INVALID_CREDENTIALS"


async def test_fr_auth02_login_returns_tokens_and_is_audited(api, make_user, committed, caplog):
    caplog.set_level(logging.DEBUG)
    await make_user("A@Example.pl")
    tokens = await login(api, "a@example.PL")  # e-mail matched case-insensitively
    assert tokens["token_type"] == "bearer" and tokens["expires_in"] > 0
    assert tokens["access_token"] and tokens["refresh_token"]
    assert PASSWORD not in caplog.text and tokens["access_token"] not in caplog.text
    assert "USER_LOGIN" in await audit_actions(committed)


# --- me + token checks ---------------------------------------------------------------------


async def test_fr_auth04_me_returns_profile_and_all_roles(api, make_user):
    await make_user("a@example.pl", "PARTICIPANT", "INSTRUCTOR")
    tokens = await login(api, "a@example.pl")
    r = await api.get("/api/v1/auth/me", headers=bearer(tokens))
    assert r.status_code == 200
    me = r.json()
    assert me["email"] == "a@example.pl" and me["first_name"] == "Jan" and me["last_name"] == "Kowalski"
    assert sorted(me["roles"]) == ["INSTRUCTOR", "PARTICIPANT"]


async def test_nfr01_missing_or_bad_token_401(api):
    r = await api.get("/api/v1/auth/me")
    assert r.status_code == 401 and r.json()["error"]["code"] == "UNAUTHENTICATED"
    r = await api.get("/api/v1/auth/me", headers={"Authorization": "Bearer abc.def.ghi"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "INVALID_TOKEN"


async def test_refresh_token_is_not_accepted_as_access_token(api, make_user):
    await make_user("a@example.pl")
    tokens = await login(api, "a@example.pl")
    r = await api.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['refresh_token']}"})
    assert r.status_code == 401


async def test_fr_auth05_deactivated_account_loses_access_with_valid_token(api, make_user, committed):
    u = await make_user("a@example.pl")
    tokens = await login(api, "a@example.pl")
    async with committed() as s, s.begin():
        (await s.get(User, u.id)).status = "DEACTIVATED"
    r = await api.get("/api/v1/auth/me", headers=bearer(tokens))
    assert r.status_code == 403 and r.json()["error"]["code"] == "ACCOUNT_INACTIVE"
    r = await api.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 403


# --- refresh / logout (ADR-09) -------------------------------------------------------------


async def test_fr_auth03_refresh_rotates_token(api, make_user):
    await make_user("a@example.pl")
    t1 = await login(api, "a@example.pl")
    r = await api.post("/api/v1/auth/refresh", json={"refresh_token": t1["refresh_token"]})
    assert r.status_code == 200
    t2 = r.json()
    assert t2["refresh_token"] != t1["refresh_token"]
    assert (await api.get("/api/v1/auth/me", headers=bearer(t2))).status_code == 200


async def test_adr09_reusing_spent_refresh_token_kills_the_whole_session(api, make_user, committed):
    await make_user("a@example.pl")
    t1 = await login(api, "a@example.pl")
    t2 = (await api.post("/api/v1/auth/refresh", json={"refresh_token": t1["refresh_token"]})).json()
    replay = await api.post("/api/v1/auth/refresh", json={"refresh_token": t1["refresh_token"]})
    assert replay.status_code == 401 and replay.json()["error"]["code"] == "INVALID_TOKEN"
    # The legitimate newer token of the same family is revoked too.
    r = await api.post("/api/v1/auth/refresh", json={"refresh_token": t2["refresh_token"]})
    assert r.status_code == 401
    async with committed() as s:
        live = await s.scalar(select(func.count()).select_from(RefreshToken).where(RefreshToken.revoked_at.is_(None)))
    assert live == 0


async def test_fr_auth03_logout_revokes_session(api, make_user):
    await make_user("a@example.pl")
    t = await login(api, "a@example.pl")
    r = await api.post("/api/v1/auth/logout", json={"refresh_token": t["refresh_token"]})
    assert r.status_code == 204
    r = await api.post("/api/v1/auth/refresh", json={"refresh_token": t["refresh_token"]})
    assert r.status_code == 401


async def test_logout_with_garbage_token_is_harmless(api):
    r = await api.post("/api/v1/auth/logout", json={"refresh_token": "nonsense"})
    assert r.status_code == 204


# --- web client cookie (ADR-26) ------------------------------------------------------------


async def test_adr26_web_client_gets_refresh_in_httponly_cookie(api, make_user):
    await make_user("a@example.pl")
    r = await api.post(
        "/api/v1/auth/login", json={"email": "a@example.pl", "password": PASSWORD}, headers={"X-Client": "web"}
    )
    assert r.status_code == 200
    assert "refresh_token" not in r.json()
    cookie = r.headers["set-cookie"]
    assert cookie.startswith("pspk_refresh=")
    for attr in ("HttpOnly", "Secure", "SameSite=strict", "Path=/api/v1/auth"):
        assert attr.lower() in cookie.lower()

    # The browser sends the cookie back on its own: refresh and logout need no body.
    r = await api.post("/api/v1/auth/refresh", headers={"X-Client": "web"})
    assert r.status_code == 200 and "access_token" in r.json()
    r = await api.post("/api/v1/auth/logout", headers={"X-Client": "web"})
    assert r.status_code == 204
    assert "pspk_refresh=" in r.headers["set-cookie"] and "max-age=0" in r.headers["set-cookie"].lower()
    r = await api.post("/api/v1/auth/refresh", headers={"X-Client": "web"})
    assert r.status_code == 401


# --- change password (FR-AUTH-07, ADR-19) --------------------------------------------------


async def test_fr_auth07_change_password_invalidates_other_sessions(api, make_user, committed):
    await make_user("a@example.pl")
    phone = await login(api, "a@example.pl")
    laptop = await login(api, "a@example.pl")
    r = await api.post(
        "/api/v1/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "nowe-haslo-kowala-1"},
        headers=bearer(laptop),
    )
    assert r.status_code == 200
    # The current session continues with a fresh access token (Q-38: only *other* sessions end).
    fresh = r.json()
    assert (await api.get("/api/v1/auth/me", headers=bearer(fresh))).status_code == 200
    assert (await api.post("/api/v1/auth/refresh", json={"refresh_token": laptop["refresh_token"]})).status_code == 200
    # Other sessions: old access tokens (token_version) and refresh tokens stop working.
    assert (await api.get("/api/v1/auth/me", headers=bearer(phone))).status_code == 401
    assert (await api.get("/api/v1/auth/me", headers=bearer(laptop))).status_code == 401
    assert (await api.post("/api/v1/auth/refresh", json={"refresh_token": phone["refresh_token"]})).status_code == 401
    await login(api, "a@example.pl", "nowe-haslo-kowala-1")
    assert "USER_PASSWORD_CHANGED" in await audit_actions(committed)


async def test_fr_auth07_wrong_current_password(api, make_user):
    await make_user("a@example.pl")
    t = await login(api, "a@example.pl")
    r = await api.post(
        "/api/v1/auth/change-password",
        json={"current_password": "nie-to-haslo-1", "new_password": "nowe-haslo-kowala-1"},
        headers=bearer(t),
    )
    assert r.status_code == 401 and r.json()["error"]["code"] == "INVALID_CREDENTIALS"


# --- roles (FR-AUTH-06, BR-27) -------------------------------------------------------------


async def test_br27_admin_without_instructor_role_is_not_instructor(api, make_user):
    await make_user("admin@example.pl", "ADMIN")
    t = await login(api, "admin@example.pl")
    r = await api.get("/api/v1/admin/users", headers=bearer(t))
    assert r.status_code == 200
    me = (await api.get("/api/v1/auth/me", headers=bearer(t))).json()
    assert me["roles"] == ["ADMIN"]


async def test_fr_auth06_role_dependencies_check_membership(committed, make_client, make_user):
    from fastapi import Depends

    from app.dependencies.auth import require_admin, require_instructor, require_participant
    from app.main import create_app

    app = create_app()
    for name, dep in {
        "admin": require_admin,
        "instructor": require_instructor,
        "participant": require_participant,
    }.items():
        app.get(f"/_probe/{name}")(lambda _=Depends(dep): {"ok": True})
    c = make_client(app=app)

    await make_user("both@example.pl", "PARTICIPANT", "INSTRUCTOR")
    await make_user("p@example.pl", "PARTICIPANT")
    both, only_p = bearer(await login(c, "both@example.pl")), bearer(await login(c, "p@example.pl"))

    assert (await c.get("/_probe/instructor", headers=both)).status_code == 200
    assert (await c.get("/_probe/participant", headers=both)).status_code == 200
    assert (await c.get("/_probe/admin", headers=both)).status_code == 403
    r = await c.get("/_probe/instructor", headers=only_p)
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"
