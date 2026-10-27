"""Helpers for admin content API tests (M4)."""

from httpx import AsyncClient

from tests.conftest import bearer, login

HACZYK = {
    "name": "Haczyk / zawieszka",
    "task_type": "PRACTICAL",
    "description": "Nauka pracy z płaskownikiem oraz łączenia kilku podstawowych operacji w jednym wyrobie.",
    "instructions": "1. Rozcięcie części górnej\n2. Odgięcie wąsów",
    "assignment": "Samodzielnie wykonaj 2 haczyki / zawieszki według jednego wzorca.",
    "evaluation_criteria": "Równe i kontrolowane rozcięcie; równy łuk haka.",
    "submission_requirements": "Dodaj zdjęcie obu zawieszek ułożonych obok siebie.",
    "material": "płaskownik 30–50 × 3–5 mm, stal niskowęglowa",
    "quantity_description": "2 sztuki",
    "expected_duration_days": 14,
}

QUIZ = {
    "name": "Stal i ogień — test wiedzy",
    "task_type": "QUIZ",
    "content_md": "Krótki test.",
    "expected_duration_days": 7,
    "pass_threshold": 80,
    "questions": [
        {
            "text": "Kolor żaru przy kuciu stali niskowęglowej?",
            "kind": "SINGLE",
            "options": [{"text": "Wiśniowy", "is_correct": False}, {"text": "Żółto-pomarańczowy", "is_correct": True}],
        },
        {
            "text": "Stale niskowęglowe?",
            "kind": "MULTI",
            "options": [
                {"text": "S235", "is_correct": True},
                {"text": "C45", "is_correct": False},
                {"text": "St3S", "is_correct": True},
            ],
        },
    ],
    "video_links": [{"title": "Rozpalanie paleniska", "url": "https://www.youtube.com/watch?v=abc"}],
}


class Admin:
    """Thin client for the admin content API that asserts on unexpected status codes."""

    def __init__(self, api: AsyncClient, headers: dict):
        self.api, self.h = api, headers

    async def req(self, method: str, url: str, expect: int = 200, **kw):
        r = await self.api.request(method, f"/api/v1{url}", headers=self.h, **kw)
        assert r.status_code == expect, f"{method} {url}: {r.status_code} {r.text}"
        return r.json() if r.content else None

    async def path(self, name: str = "Podstawy kowalstwa") -> dict:
        return await self.req("POST", "/admin/paths", 201, json={"name": name, "description": ""})

    async def version(self, path_id: str, copy_from: str | None = None) -> dict:
        body = {"description": "", **({"copy_from_version_id": copy_from} if copy_from else {})}
        return await self.req("POST", f"/admin/paths/{path_id}/versions", 201, json=body)

    async def stage(self, version_id: str, name: str = "Kowalstwo podstawowe", **kw) -> dict:
        return await self.req("POST", "/admin/stages", 201, json={"path_version_id": version_id, "name": name, **kw})

    async def task(self, stage_id: str, content: dict | None = None, **kw) -> dict:
        body = {"stage_id": stage_id, **(content or {"name": "Gwóźdź", "task_type": "PRACTICAL"}), **kw}
        return await self.req("POST", "/admin/tasks", 201, json=body)

    async def structure(self, version_id: str) -> dict:
        return await self.req("GET", f"/admin/path-versions/{version_id}")

    async def labels(self, version_id: str) -> list[tuple[str | None, str]]:
        s = await self.structure(version_id)
        return [(t["label"], t["revision"]["name"]) for st in s["stages"] for t in st["tasks"]]


async def make_admin(api, make_user) -> Admin:
    await make_user("admin@example.pl", "ADMIN")
    return Admin(api, bearer(await login(api, "admin@example.pl")))
