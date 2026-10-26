import os

# Tests run against a dedicated PostgreSQL database, never the development one.
os.environ.setdefault(
    "DATABASE_URL",
    os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://pspk:pspk@localhost:5433/pspk_academy_test"),
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-for-production")
os.environ.setdefault("ENVIRONMENT", "test")

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
        client = AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test")
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
