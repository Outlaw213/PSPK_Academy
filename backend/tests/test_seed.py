"""M11: development seed (§31, Q-36, Q-63): accounts of every role and the "Podstawy kowalstwa" programme."""

import os

import pytest
from sqlalchemy import func, select

from app import seed
from app.config import Settings
from app.models import AuditLog, User
from app.services.storage_service import LocalDiskStorage
from tests.conftest import bearer, login

PASSWORD = "haslo-danych-startowych-2026"


async def run(committed, **kw):
    return await seed.run(committed, LocalDiskStorage(os.environ["STORAGE_ROOT"]), Settings(**kw), PASSWORD)


async def as_(api, email):
    return bearer(await login(api, email, PASSWORD))


async def test_q36_programme_from_the_task_list(api, committed):
    assert await run(committed) is True
    h = await as_(api, seed.PARTICIPANT)
    [mine] = (await api.get("/api/v1/me/paths", headers=h)).json()
    progress = (await api.get(f"/api/v1/me/paths/{mine['path_version_id']}/progress", headers=h)).json()
    assert progress["path"]["name"] == "Podstawy kowalstwa"
    s1, s2 = progress["stages"]
    assert (s1["name"], s2["name"]) == ("Kowalstwo podstawowe", "Kowalstwo zaawansowane")

    def kinds(stage):
        return [t["task_type"] for t in stage["tasks"]]

    # Q-36: 15 works + 4 courses, then 9 works + 5 courses; plus the example theory task and quiz in stage 1.
    assert kinds(s1).count("PRACTICAL") == 15 and kinds(s1).count("COURSE") == 4
    assert kinds(s1).count("THEORY") == 1 and kinds(s1).count("QUIZ") == 1
    assert kinds(s2).count("PRACTICAL") == 9 and kinds(s2).count("COURSE") == 5 and len(kinds(s2)) == 14
    first, second = s1["tasks"][:2]
    assert (first["label"], first["name"], first["status"]) == ("E1.1", "Bezpieczeństwo pracy w kuźni", "AVAILABLE")
    assert (second["label"], second["name"], second["status"]) == ("E1.2", "Gwóźdź", "LOCKED")
    assert all(t["status"] == "LOCKED" for t in s2["tasks"])
    assert [t["name"] for t in s1["tasks"] if t["task_type"] == "COURSE"] == [
        "Podkowa",
        "Głowa byka",
        "Głowa barana",
        "Zestaw sztućców",
    ]
    assert progress["progress"] == {"completed": 0, "total": 35}


async def test_q36_cards_haczyk_and_serce_with_reference_photos(api, committed):
    await run(committed)
    h = await as_(api, seed.PARTICIPANT)
    vid = (await api.get("/api/v1/me/paths", headers=h)).json()[0]["path_version_id"]
    tasks = {
        t["name"]: t
        for st in (await api.get(f"/api/v1/me/paths/{vid}", headers=h)).json()["stages"]
        for t in st["tasks"]
    }
    haczyk = (await api.get(f"/api/v1/tasks/{tasks['Haczyk / zawieszka']['id']}", headers=h)).json()["revision"]
    assert haczyk["quantity_description"] == "2 sztuki" and "rybiego ogona" in haczyk["instructions"]
    assert [m["caption"] for m in haczyk["materials"]] == ["Wymagane: 2 podobne egzemplarze"]
    serce = (await api.get(f"/api/v1/tasks/{tasks['Serce [dwa sposoby]']['id']}", headers=h)).json()["revision"]
    assert [m["caption"] for m in serce["materials"]] == ["Sposób 1", "Sposób 2"]
    photo = await api.get(
        f"/api/v1/tasks/{tasks['Haczyk / zawieszka']['id']}/materials/{haczyk['materials'][0]['id']}", headers=h
    )
    assert photo.status_code == 200 and photo.headers["content-type"] == "image/webp"
    quiz = (await api.get(f"/api/v1/tasks/{tasks['Stal i ogień — test wiedzy']['id']}", headers=h)).json()["revision"]
    assert len(quiz["questions"]) == 5 and quiz["pass_threshold"] == 80
    assert all("is_correct" not in o for q in quiz["questions"] for o in q["options"])
    bhp = (await api.get(f"/api/v1/tasks/{tasks['Bezpieczeństwo pracy w kuźni']['id']}", headers=h)).json()["revision"]
    assert bhp["content_md"].startswith("Kuźnia to miejsce pracy") and bhp["video_links"]


async def test_accounts_of_every_role(api, committed):
    await run(committed)
    roles = {}
    for email in (seed.ADMIN, seed.INSTRUCTOR, seed.PARTICIPANT, seed.MULTI_ROLE):
        roles[email] = (await api.get("/api/v1/auth/me", headers=await as_(api, email))).json()["roles"]
    assert roles == {
        seed.ADMIN: ["ADMIN"],
        seed.INSTRUCTOR: ["INSTRUCTOR"],
        seed.PARTICIPANT: ["PARTICIPANT"],
        seed.MULTI_ROLE: ["PARTICIPANT", "INSTRUCTOR"],
    }
    # §31: no real personal data — reserved example domain only.
    async with committed() as s:
        assert all(e.endswith("@akademia.example") for e in (await s.execute(select(User.email))).scalars())

    # The instructor covers the whole version; the multi-role person only stage 2 and is enrolled too (BR-25).
    ih, mh = await as_(api, seed.INSTRUCTOR), await as_(api, seed.MULTI_ROLE)
    assert len((await api.get("/api/v1/instructor/courses", headers=ih)).json()) == 9
    assert [c["stage"]["position"] for c in (await api.get("/api/v1/instructor/courses", headers=mh)).json()] == [2] * 5
    assert len((await api.get("/api/v1/me/paths", headers=mh)).json()) == 1


async def test_seeded_path_works_end_to_end(api, committed):
    await run(committed)
    ph, ih = await as_(api, seed.PARTICIPANT), await as_(api, seed.INSTRUCTOR)
    vid = (await api.get("/api/v1/me/paths", headers=ph)).json()[0]["path_version_id"]
    bhp = (await api.get(f"/api/v1/me/paths/{vid}/progress", headers=ph)).json()["stages"][0]["tasks"][0]
    d = (await api.post(f"/api/v1/tasks/{bhp['id']}/submissions", headers=ph, json={"comment": "Pięć zagrożeń"})).json()
    assert (await api.post(f"/api/v1/submissions/{d['id']}/submit", headers=ph)).status_code == 200
    assert (await api.post(f"/api/v1/submissions/{d['id']}/claim", headers=ih)).status_code == 200
    r = await api.post(f"/api/v1/submissions/{d['id']}/assessment", headers=ih, json={"result": "PASSED"})
    assert r.status_code == 201
    second = (await api.get(f"/api/v1/me/paths/{vid}/progress", headers=ph)).json()["stages"][0]["tasks"][1]
    assert second["status"] == "AVAILABLE"


async def test_seed_runs_once(api, committed):
    assert await run(committed) is True
    async with committed() as s:
        before = await s.scalar(select(func.count()).select_from(AuditLog))
    assert await run(committed) is False  # already there: nothing added
    async with committed() as s:
        assert await s.scalar(select(func.count()).select_from(AuditLog)) == before


async def test_seed_refused_in_production(committed):
    with pytest.raises(seed.SeedRefused):
        await run(committed, environment="production", jwt_secret_key="x" * 48)
