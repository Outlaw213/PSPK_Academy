"""M1: health check (DoD: /health = 200 and checks the database)."""


async def test_health_ok_checks_database(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "ok"}


async def test_health_database_unreachable_503_error_format(make_client):
    c = make_client(database_url="postgresql+asyncpg://pspk:pspk@127.0.0.1:1/nope")
    r = await c.get("/health")
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "DATABASE_UNAVAILABLE"
