import os

# Tests run against a dedicated PostgreSQL database, never the development one.
os.environ.setdefault(
    "DATABASE_URL",
    os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://pspk:pspk@localhost:5433/pspk_academy_test"),
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-for-production")
os.environ.setdefault("ENVIRONMENT", "test")
# Photos go to a throwaway directory, never the real photo disk.
import tempfile  # noqa: E402

os.environ.setdefault("STORAGE_ROOT", tempfile.mkdtemp(prefix="pspk-test-storage-"))

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture
async def make_client():
    """Return a factory for HTTP clients bound to a fresh app; disposes every app's engine afterwards."""
    apps: list[FastAPI] = []
    clients: list[AsyncClient] = []

    def _make(app: FastAPI | None = None, **overrides) -> AsyncClient:
        app = app or create_app(Settings(**overrides) if overrides else None)
        apps.append(app)
        client = AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="https://test")
        clients.append(client)
        return client

    yield _make
    for c in clients:
        await c.aclose()
    for a in apps:
        await a.state.engine.dispose()


@pytest.fixture
async def client(make_client) -> AsyncClient:
    return make_client()


# --- Database fixtures (M2) -------------------------------------------------

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def alembic_config() -> Config:
    cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic"))
    return cfg


@pytest.fixture(scope="session")
def migrated_db() -> None:
    """Schema comes only from Alembic migrations, never create_all() (NFR-04)."""
    command.downgrade(alembic_config(), "base")
    command.upgrade(alembic_config(), "head")


@pytest.fixture
async def db(migrated_db) -> AsyncSession:
    """A session inside a transaction that is rolled back after the test.

    Statements expected to fail should run inside `session.begin_nested()` so the
    outer transaction survives the error.
    """
    engine = create_async_engine(os.environ["DATABASE_URL"])
    async with engine.connect() as conn:
        trans = await conn.begin()
        session = AsyncSession(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
        await session.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
        try:
            yield session
        finally:
            await session.close()
            await trans.rollback()
    await engine.dispose()


# --- API fixtures (M3) ------------------------------------------------------
# API tests go through the app's own sessions, so their data must be committed.
# Every API test starts from empty tables instead of a rolled-back transaction.

from sqlalchemy.ext.asyncio import async_sessionmaker  # noqa: E402

from app.models import Base, User, UserRole  # noqa: E402
from app.utils.security import hash_password  # noqa: E402

PASSWORD = "kowadlo-i-mlot-2026"


@pytest.fixture
async def committed(migrated_db):
    """Sessionmaker writing committed rows; truncates every table before and after the test,
    so committed rows never leak into tests using the rolled-back `db` session."""
    engine = create_async_engine(os.environ["DATABASE_URL"])
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} CASCADE"))
    yield async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} CASCADE"))
    await engine.dispose()


@pytest.fixture
async def api(committed, make_client) -> AsyncClient:
    return make_client()


@pytest.fixture
def make_user(committed):
    async def _make(
        email: str, *roles: str, status: str = "ACTIVE", password: str = PASSWORD, first_name: str = "Jan"
    ) -> User:
        async with committed() as s, s.begin():
            u = User(
                email=email,
                password_hash=hash_password(password),
                first_name=first_name,
                last_name="Kowalski",
                status=status,
            )
            s.add(u)
            await s.flush()
            for r in roles or ("PARTICIPANT",):
                s.add(UserRole(user_id=u.id, role=r))
        return u

    return _make


async def login(client: AsyncClient, email: str, password: str = PASSWORD, web: bool = False) -> dict:
    r = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}, headers={"X-Client": "web"} if web else {}
    )
    assert r.status_code == 200, r.text
    return r.json()


def bearer(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}
