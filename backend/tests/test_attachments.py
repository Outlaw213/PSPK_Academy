"""M9: reference photos and PDF attachments of tasks (BR-17, BR-19, BR-33, Q-07, Q-43, ADR-24, ADR-25)."""

import io
import os

from PIL import Image

from tests.conftest import bearer, login
from tests.submission_helpers import jpeg, pass_in_db, png, setup

PDF = b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"


def files_on_disk() -> int:
    return sum(len(f) for _, _, f in os.walk(os.environ["STORAGE_ROOT"]))


async def upload_material(a, task_id, data=None, expect=201, caption=None, name="wzor.jpg", ctype="image/jpeg"):
    form = {"caption": caption} if caption is not None else {}
    return await a.req(
        "POST", f"/admin/tasks/{task_id}/materials", expect, files={"file": (name, data or jpeg(), ctype)}, data=form
    )


async def upload_pdf(a, task_id, data=PDF, expect=201, title=None, name="instrukcja.pdf"):
    form = {"title": title} if title is not None else {}
    files = {"file": (name, data, "application/pdf")}
    return await a.req("POST", f"/admin/tasks/{task_id}/attachments", expect, files=files, data=form)


async def get(api, h, url):
    return await api.get(f"/api/v1{url}", headers=h)


async def test_q43_material_upload_adds_processed_photo_in_new_revision(api, make_user):
    a, _, _, ids, *_ = await setup(api, make_user)
    t = await upload_material(a, ids["gwozdz"], jpeg(4000, 3000), caption="Wymagane: 2 podobne egzemplarze")
    assert t["revision"]["revision_number"] == 2
    [m] = t["revision"]["materials"]
    assert m["position"] == 1 and m["caption"] == "Wymagane: 2 podobne egzemplarze"
    assert m["mime_type"] == "image/webp" and (m["width"], m["height"]) == (2560, 1920)
    r = await get(api, a.h, f"/tasks/{ids['gwozdz']}/materials/{m['id']}")
    assert r.status_code == 200 and r.headers["content-type"] == "image/webp"
    img = Image.open(io.BytesIO(r.content))
    assert img.format == "WEBP" and not img.getexif()  # EXIF from the camera is gone (ADR-25)
    assert len(r.content) == m["file_size"]


async def test_br33_pdf_upload_kept_as_is_and_titled(api, make_user):
    a, _, _, ids, *_ = await setup(api, make_user)
    t = await upload_pdf(a, ids["bhp"], title="Karta BHP kuźni")
    [att] = t["revision"]["attachments"]
    assert att["title"] == "Karta BHP kuźni" and att["file_size"] == len(PDF) and att["position"] == 1
    t = await upload_pdf(a, ids["bhp"], name="Tabela żarów.pdf")
    assert [x["title"] for x in t["revision"]["attachments"]] == ["Karta BHP kuźni", "Tabela żarów"]
    r = await get(api, a.h, f"/tasks/{ids['bhp']}/attachments/{att['id']}")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf" and r.content == PDF
    assert r.headers["content-disposition"].startswith("inline")


async def test_br33_files_checked_by_content_and_size(api, make_user):
    a, _, _, ids, *_ = await setup(api, make_user)
    before = files_on_disk()
    r = await upload_pdf(a, ids["bhp"], jpeg(), 422, name="udaje.pdf")
    assert r["error"]["code"] == "INVALID_ATTACHMENT_TYPE"
    r = await upload_pdf(a, ids["bhp"], b"%PDF-1.7\ntruncated", 422)
    assert r["error"]["code"] == "INVALID_ATTACHMENT_TYPE"
    big = b"%PDF-1.7\n" + b"0" * (20 * 1024 * 1024) + b"\n%%EOF\n"
    r = await upload_pdf(a, ids["bhp"], big, 413)
    assert r["error"]["code"] == "ATTACHMENT_TOO_LARGE"
    r = await upload_material(a, ids["bhp"], PDF, 422, name="foto.jpg")
    assert r["error"]["code"] == "INVALID_PHOTO_TYPE"
    assert files_on_disk() == before
    revs = await a.req("GET", f"/admin/tasks/{ids['bhp']}/revisions")
    assert len(revs) == 1  # nothing failed half-way into a revision


async def test_br19_put_orders_captions_and_removes_files_keeping_history(api, make_user):
    a, _, _, ids, *_ = await setup(api, make_user)
    tid = ids["gwozdz"]
    await upload_material(a, tid, jpeg(), caption="Widok z boku")
    await upload_material(a, tid, png(), caption="Grot")
    t = await upload_pdf(a, tid, title="Rysunek")
    rev = t["revision"]
    m1, m2 = rev["materials"]
    base = {"name": "Gwóźdź", "task_type": "PRACTICAL"}

    # Lists left out: unchanged, and an identical save makes no new revision.
    t = await a.req("PUT", f"/admin/tasks/{tid}", json=base)
    assert t["revision"]["revision_number"] == rev["revision_number"]
    assert len(t["revision"]["materials"]) == 2 and len(t["revision"]["attachments"]) == 1

    # Reorder, re-caption, drop the PDF.
    t = await a.req(
        "PUT",
        f"/admin/tasks/{tid}",
        json={**base, "materials": [{"id": m2["id"], "caption": "Grot z bliska"}, {"id": m1["id"]}], "attachments": []},
    )
    new = t["revision"]
    assert new["revision_number"] == rev["revision_number"] + 1
    assert [(m["id"], m["position"], m["caption"]) for m in new["materials"]] == [
        (m2["id"], 1, "Grot z bliska"),
        (m1["id"], 2, None),
    ]
    assert new["attachments"] == []
    old = next(r for r in await a.req("GET", f"/admin/tasks/{tid}/revisions") if r["id"] == rev["id"])
    assert [x["title"] for x in old["attachments"]] == ["Rysunek"]  # BR-19: earlier revisions stay as they were
    # The PDF of the older revision can still be read (files are never deleted).
    r = await get(api, a.h, f"/tasks/{tid}/attachments/{old['attachments'][0]['id']}")
    assert r.status_code == 200

    # Bring the PDF back by its id from the older revision.
    t = await a.req("PUT", f"/admin/tasks/{tid}", json={**base, "attachments": [{"id": old["attachments"][0]["id"]}]})
    assert [x["title"] for x in t["revision"]["attachments"]] == ["Rysunek"]


async def test_unknown_or_repeated_file_rejected(api, make_user):
    a, _, _, ids, *_ = await setup(api, make_user)
    other = (await upload_material(a, ids["bhp"]))["revision"]["materials"][0]
    base = {"name": "Gwóźdź", "task_type": "PRACTICAL"}
    r = await a.req("PUT", f"/admin/tasks/{ids['gwozdz']}", 422, json={**base, "materials": [{"id": other["id"]}]})
    assert r["error"]["code"] == "UNKNOWN_FILE"
    own = (await upload_material(a, ids["gwozdz"]))["revision"]["materials"][0]
    r = await a.req(
        "PUT", f"/admin/tasks/{ids['gwozdz']}", 422, json={**base, "materials": [{"id": own["id"]}, {"id": own["id"]}]}
    )
    assert r["error"]["code"] == "UNKNOWN_FILE"
    pdf = (await upload_pdf(a, ids["bhp"]))["revision"]["attachments"][0]
    r = await a.req("PUT", f"/admin/tasks/{ids['gwozdz']}", 422, json={**base, "attachments": [{"id": pdf["id"]}]})
    assert r["error"]["code"] == "UNKNOWN_FILE"
    # Ids exist, but not for this task: the download is 404 too.
    assert (await get(api, a.h, f"/tasks/{ids['gwozdz']}/materials/{other['id']}")).status_code == 404
    assert (await get(api, a.h, f"/tasks/{ids['gwozdz']}/attachments/{pdf['id']}")).status_code == 404


async def test_br17_who_can_download(api, make_user):
    a, v, s, ids, _, me, _ = await setup(api, make_user)
    m = (await upload_material(a, ids["bhp"], caption="Stanowisko"))["revision"]["materials"][0]
    pdf = (await upload_pdf(a, ids["bhp"], title="Karta BHP"))["revision"]["attachments"][0]
    murl, purl = f"/tasks/{ids['bhp']}/materials/{m['id']}", f"/tasks/{ids['bhp']}/attachments/{pdf['id']}"

    # The enrolled participant sees them in the task and downloads them.
    detail = await me.req("GET", f"/tasks/{ids['bhp']}")
    assert [x["caption"] for x in detail["revision"]["materials"]] == ["Stanowisko"]
    assert [x["title"] for x in detail["revision"]["attachments"]] == ["Karta BHP"]
    assert (await get(api, me.h, murl)).status_code == 200 and (await get(api, me.h, purl)).status_code == 200

    # A participant of another path does not.
    await make_user("obcy@example.pl")
    oh = bearer(await login(api, "obcy@example.pl"))
    assert (await get(api, oh, murl)).status_code == 404 and (await get(api, oh, purl)).status_code == 404

    # An instructor only within their permission.
    ins = await make_user("marek@example.pl", "INSTRUCTOR")
    ih = bearer(await login(api, "marek@example.pl"))
    assert (await get(api, ih, murl)).status_code == 404
    await a.req("POST", "/admin/instructor-permissions", 201, json={"instructor_id": str(ins.id), "stage_id": s["id"]})
    assert (await get(api, ih, murl)).status_code == 200 and (await get(api, ih, purl)).status_code == 200

    # Without a token: 401.
    assert (await api.get(f"/api/v1{murl}")).status_code == 401


async def test_br19_passed_task_keeps_the_files_it_was_passed_with(api, make_user, committed):
    a, _, _, ids, u, me, e = await setup(api, make_user)
    first = (await upload_material(a, ids["bhp"], caption="Stary wzór"))["revision"]["materials"][0]
    await pass_in_db(committed, ids["bhp"], u)
    await upload_material(a, ids["bhp"], caption="Nowy wzór")
    detail = await me.req("GET", f"/tasks/{ids['bhp']}")
    assert [x["caption"] for x in detail["revision"]["materials"]] == ["Stary wzór"]
    # After the enrollment ends the history stays readable (BR-20).
    await a.req("POST", f"/admin/enrollments/{e['id']}/cancel")
    assert (await get(api, me.h, f"/tasks/{ids['bhp']}/materials/{first['id']}")).status_code == 200


async def test_q07_copied_version_carries_the_files(api, make_user):
    a, v, _, ids, *_ = await setup(api, make_user)
    await upload_material(a, ids["gwozdz"], caption="Wzór")
    await upload_pdf(a, ids["gwozdz"], title="Rysunek")
    v2 = await a.version(v["learning_path_id"], copy_from=v["id"])
    tasks = [t for st in (await a.structure(v2["id"]))["stages"] for t in st["tasks"]]
    copy = next(t for t in tasks if t["revision"]["name"] == "Gwóźdź")
    [m] = copy["revision"]["materials"]
    [p] = copy["revision"]["attachments"]
    assert m["caption"] == "Wzór" and p["title"] == "Rysunek"
    assert (await get(api, a.h, f"/tasks/{copy['id']}/materials/{m['id']}")).status_code == 200
    assert (await get(api, a.h, f"/tasks/{copy['id']}/attachments/{p['id']}")).status_code == 200
    # The copy is edited on its own: its PUT accepts its own files.
    r = await a.req(
        "PUT", f"/admin/tasks/{copy['id']}", json={"name": "Gwóźdź", "task_type": "PRACTICAL", "materials": []}
    )
    assert r["revision"]["materials"] == []
    original = await a.req("GET", f"/admin/tasks/{ids['gwozdz']}")
    assert len(original["revision"]["materials"]) == 1


async def test_only_admin_uploads(api, make_user):
    a, _, _, ids, _, me, _ = await setup(api, make_user)
    pdf = {"file": ("a.pdf", PDF, "application/pdf")}
    await me.req("POST", f"/admin/tasks/{ids['bhp']}/attachments", 403, files=pdf)
    await a.req("POST", "/admin/tasks/00000000-0000-4000-8000-000000000000/attachments", 404, files=pdf)
