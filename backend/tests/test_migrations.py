"""M2 DoD: `alembic upgrade head` and `downgrade base` work on a clean database; models match the migration."""

from alembic import command
from alembic.util.exc import CommandError
from tests.conftest import alembic_config


def test_nfr04_upgrade_downgrade_upgrade(migrated_db):
    cfg = alembic_config()
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


def test_nfr04_models_match_migrations(migrated_db):
    try:
        command.check(alembic_config())
    except CommandError as exc:  # pragma: no cover - message is the useful part
        raise AssertionError(f"Models and migrations differ: {exc}") from exc
