"""FR-AUTH-08: bootstrap the first administrator from the command line."""

import pytest
from sqlalchemy import select

from app import cli
from app.models import User, UserRole
from tests.conftest import PASSWORD, login


async def test_fr_auth08_create_admin(committed, api, monkeypatch, capsys):
    monkeypatch.setattr(cli, "getpass", lambda _prompt="": PASSWORD)
    await cli.create_admin("Szef@Example.pl", "Adam", "Kowal")
    out = capsys.readouterr().out
    assert PASSWORD not in out
    async with committed() as s:
        u = (await s.execute(select(User).where(User.email == "szef@example.pl"))).scalar_one()
        roles = set((await s.execute(select(UserRole.role).where(UserRole.user_id == u.id))).scalars())
    assert u.status == "ACTIVE" and roles == {"ADMIN"}
    await login(api, "szef@example.pl")


async def test_fr_auth08_create_admin_rejects_existing_email(committed, make_user, monkeypatch):
    await make_user("szef@example.pl")
    monkeypatch.setattr(cli, "getpass", lambda _prompt="": PASSWORD)
    with pytest.raises(SystemExit):
        await cli.create_admin("szef@example.pl", "Adam", "Kowal")


async def test_fr_auth08_create_admin_rejects_short_or_mismatched_password(committed, monkeypatch):
    answers = iter(["krotkie", "krotkie"])
    monkeypatch.setattr(cli, "getpass", lambda _prompt="": next(answers))
    with pytest.raises(SystemExit):
        await cli.create_admin("szef@example.pl", "Adam", "Kowal")
    answers2 = iter([PASSWORD, PASSWORD + "x"])
    monkeypatch.setattr(cli, "getpass", lambda _prompt="": next(answers2))
    with pytest.raises(SystemExit):
        await cli.create_admin("szef@example.pl", "Adam", "Kowal")
