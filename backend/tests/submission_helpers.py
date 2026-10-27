"""Shared setup for participant submission tests (M6)."""

import io

from PIL import Image

from tests.conftest import bearer, login
from tests.content_helpers import QUIZ, make_admin


def jpeg(width=800, height=600, orientation: int | None = None, color=(180, 90, 30)) -> bytes:
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    exif = Image.Exif()
    exif[0x010F] = "Kowal Camera"  # Make — must disappear after processing
    if orientation:
        exif[0x0112] = orientation
    img.save(buf, "JPEG", exif=exif.tobytes(), quality=90)
    return buf.getvalue()


def png(width=300, height=200) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (40, 40, 40)).save(buf, "PNG")
    return buf.getvalue()


class Participant:
    def __init__(self, api, headers):
        self.api, self.h = api, headers

    async def req(self, method, url, expect=200, **kw):
        r = await self.api.request(method, f"/api/v1{url}", headers=self.h, **kw)
        assert r.status_code == expect, f"{method} {url}: {r.status_code} {r.text}"
        return r.json() if r.content and r.headers.get("content-type", "").startswith("application/json") else r

    async def draft(self, task_id, expect=201, **body):
        return await self.req("POST", f"/tasks/{task_id}/submissions", expect, json=body)

    async def photo(self, sub_id, data: bytes, expect=201, name="foto.jpg", ctype="image/jpeg"):
        return await self.req("POST", f"/submissions/{sub_id}/photos", expect, files={"file": (name, data, ctype)})

    async def submit(self, sub_id, expect=200):
        return await self.req("POST", f"/submissions/{sub_id}/submit", expect)


async def setup(api, make_user, extra_tasks=()):
    """Admin: E1 = BHP (theory), Gwóźdź (work), quiz, Podkowa (course); participant Jan enrolled."""
    a = await make_admin(api, make_user)
    p = await a.path()
    v = await a.version(p["id"])
    await a.req("PUT", f"/admin/path-versions/{v['id']}", json={"is_active": True})
    s = await a.stage(v["id"])
    ids = {
        "bhp": (await a.task(s["id"], {"name": "Bezpieczeństwo pracy", "task_type": "THEORY"}))["id"],
        "gwozdz": (await a.task(s["id"], {"name": "Gwóźdź", "task_type": "PRACTICAL"}))["id"],
        "quiz": (await a.task(s["id"], QUIZ))["id"],
        "podkowa": (await a.task(s["id"], {"name": "Podkowa", "task_type": "COURSE"}))["id"],
    }
    for name, content in extra_tasks:
        ids[name] = (await a.task(s["id"], content))["id"]
    u = await make_user("jan@example.pl")
    enrollment = await a.req("POST", "/admin/enrollments", 201, json={"user_id": str(u.id), "path_version_id": v["id"]})
    me = Participant(api, bearer(await login(api, "jan@example.pl")))
    return a, v, s, ids, u, me, enrollment


async def pass_in_db(committed, task_id, user):
    """Mark a task PASSED for the user directly (instructor grading arrives in M7–M8)."""
    from sqlalchemy import func, select

    from app.models import Submission, Task
    from tests import factories as f

    async with committed() as s, s.begin():
        n = (
            await s.scalar(
                select(func.max(Submission.attempt_number)).where(
                    Submission.task_id == task_id, Submission.user_id == user.id
                )
            )
        ) or 0
        instr = await f.user(s, "INSTRUCTOR")
        await f.submission(s, await s.get(Task, task_id), user, n + 1, status="PASSED", instructor_id=instr.id)
