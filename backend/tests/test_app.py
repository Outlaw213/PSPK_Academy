"""NFR-03 (configuration by ENV) and NFR-05 (/docs, /openapi.json)."""

import pytest
from pydantic import ValidationError

from app.config import Settings


async def test_nfr05_openapi_and_docs(client):
    r = await client.get("/openapi.json")
    assert r.status_code == 200
    assert r.json()["info"]["title"] == "PSPK Akademia API"
    assert (await client.get("/docs")).status_code == 200


def test_nfr03_production_rejects_placeholder_secret():
    with pytest.raises(ValidationError):
        Settings(environment="production", jwt_secret_key="CHANGE_ME")


def test_nfr03_upload_limits_from_env(monkeypatch):
    monkeypatch.setenv("MAX_UPLOAD_SIZE_MB", "7")
    monkeypatch.setenv("MAX_SUBMISSION_PHOTOS", "10")
    s = Settings()
    assert s.max_upload_size_mb == 7
    assert s.max_submission_photos == 10
