"""NFR-01: one error format for every error, including 404/422/500. NFR-02: no internals leaked."""

from fastapi import Query

from app.errors import AppError
from app.main import create_app


def _app_with_probe_routes():
    app = create_app()

    @app.get("/_probe/validation")
    async def validation(n: int = Query(...)):  # noqa: ARG001
        return {}

    @app.get("/_probe/business")
    async def business():
        raise AppError("TASK_LOCKED", "Task is locked until the previous task is passed.", 409)

    @app.get("/_probe/crash")
    async def crash():
        raise RuntimeError("password=hunter2 leaked internals")

    return app


async def test_nfr01_unknown_route_404(client):
    r = await client.get("/api/v1/does-not-exist")
    assert r.status_code == 404
    assert r.json() == {"error": {"code": "NOT_FOUND", "message": "Not found.", "details": None}}


async def test_nfr01_validation_error_422(make_client):
    c = make_client(app=_app_with_probe_routes())
    r = await c.get("/_probe/validation?n=abc")
    assert r.status_code == 422
    body = r.json()["error"]
    assert body["code"] == "VALIDATION_ERROR"
    assert body["details"][0]["loc"] == ["query", "n"]


async def test_nfr01_business_error(make_client):
    c = make_client(app=_app_with_probe_routes())
    r = await c.get("/_probe/business")
    assert r.status_code == 409
    assert r.json() == {
        "error": {
            "code": "TASK_LOCKED",
            "message": "Task is locked until the previous task is passed.",
            "details": None,
        }
    }


async def test_nfr01_nfr02_unhandled_500_hides_internals(make_client):
    c = make_client(app=_app_with_probe_routes())
    r = await c.get("/_probe/crash")
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "INTERNAL_ERROR"
    assert "hunter2" not in r.text
