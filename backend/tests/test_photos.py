"""M6: submission photos (BR-08, BR-09, ADR-24, ADR-25, TEST 8, TEST 9)."""

import io
import os

from PIL import Image
from sqlalchemy import select

from app.models import SubmissionPhoto
from tests.conftest import bearer, login
from tests.submission_helpers import Participant, jpeg, png, setup


async def _draft(api, make_user):
    _, _, _, ids, _, me, _ = await setup(api, make_user)
    return me, await me.draft(ids["bhp"])


async def test_test8_ten_photos_accepted(api, make_user):
    me, d = await _draft(api, make_user)
    for n in range(1, 11):
        p = await me.photo(d["id"], jpeg(color=(n * 20, 50, 50)))
        assert p["position"] == n
    detail = await me.req("GET", f"/submissions/{d['id']}")
    assert [p["position"] for p in detail["photos"]] == list(range(1, 11))


async def test_test9_br08_eleventh_photo_rejected_and_nothing_saved(api, make_user, committed):
    me, d = await _draft(api, make_user)
    for _ in range(10):
        await me.photo(d["id"], jpeg())
    files_before = sum(len(f) for _, _, f in os.walk(os.environ["STORAGE_ROOT"]))
    r = await me.photo(d["id"], jpeg(), 422)
    assert r["error"]["code"] == "TOO_MANY_PHOTOS"
    async with committed() as s:
        assert (
            len(
                (await s.execute(select(SubmissionPhoto).where(SubmissionPhoto.submission_id == d["id"])))
                .scalars()
                .all()
            )
            == 10
        )
    assert sum(len(f) for _, _, f in os.walk(os.environ["STORAGE_ROOT"])) == files_before


async def test_br09_type_checked_by_content_not_header(api, make_user):
    me, d = await _draft(api, make_user)
    r = await me.photo(d["id"], b"%PDF-1.4 not an image at all", 422, name="zdjecie.jpg", ctype="image/jpeg")
    assert r["error"]["code"] == "INVALID_PHOTO_TYPE"
    gif = io.BytesIO()
    Image.new("RGB", (10, 10)).save(gif, "GIF")
    assert (await me.photo(d["id"], gif.getvalue(), 422, name="a.gif", ctype="image/gif"))["error"][
        "code"
    ] == "INVALID_PHOTO_TYPE"
    ok = await me.photo(d["id"], png(), name="a.bin", ctype="application/octet-stream")  # real PNG, odd header
    assert ok["mime_type"] == "image/webp"


async def test_br09_too_large_413(api, make_user, monkeypatch):
    me, d = await _draft(api, make_user)
    from app.config import get_settings

    limit = get_settings().max_upload_size_mb * 1024 * 1024
    r = await me.photo(d["id"], b"\xff\xd8\xff" + b"0" * limit, 413)
    assert r["error"]["code"] == "PHOTO_TOO_LARGE"


async def test_adr25_resized_to_2560_webp_without_exif_and_upright(api, make_user):
    me, d = await _draft(api, make_user)
    big = await me.photo(d["id"], jpeg(4000, 3000))
    assert (big["width"], big["height"]) == (2560, 1920) and big["mime_type"] == "image/webp"
    small = await me.photo(d["id"], jpeg(400, 200))
    assert (small["width"], small["height"]) == (400, 200)  # never enlarged
    rotated = await me.photo(d["id"], jpeg(400, 200, orientation=6))  # camera held sideways
    assert (rotated["width"], rotated["height"]) == (200, 400)

    r = await me.req("GET", f"/submissions/{d['id']}/photos/{rotated['id']}")
    assert r.headers["content-type"] == "image/webp"
    img = Image.open(io.BytesIO(r.content))
    assert img.format == "WEBP" and img.size == (200, 400)
    assert not img.getexif()  # Make and orientation stripped


async def test_br21_delete_photo_renumbers_and_removes_file(api, make_user, committed):
    me, d = await _draft(api, make_user)
    p1, p2, p3 = [await me.photo(d["id"], jpeg()) for _ in range(3)]
    async with committed() as s:
        key = (await s.get(SubmissionPhoto, p2["id"])).storage_key
    path = os.path.join(os.environ["STORAGE_ROOT"], key)
    assert os.path.exists(path)
    await me.req("DELETE", f"/submissions/{d['id']}/photos/{p2['id']}", 204)
    assert not os.path.exists(path)
    detail = await me.req("GET", f"/submissions/{d['id']}")
    assert [(p["id"], p["position"]) for p in detail["photos"]] == [(p1["id"], 1), (p3["id"], 2)]


async def test_br17_photo_of_someone_else_is_404(api, make_user):
    me, d = await _draft(api, make_user)
    p = await me.photo(d["id"], jpeg())
    await make_user("obcy@example.pl")
    other = Participant(api, bearer(await login(api, "obcy@example.pl")))
    await other.req("GET", f"/submissions/{d['id']}/photos/{p['id']}", 404)
    await other.req("DELETE", f"/submissions/{d['id']}/photos/{p['id']}", 404)
    await other.req("POST", f"/submissions/{d['id']}/photos", 404, files={"file": ("a.jpg", jpeg(), "image/jpeg")})


async def test_storage_key_layout(api, make_user, committed):
    me, d = await _draft(api, make_user)
    p = await me.photo(d["id"], jpeg())
    async with committed() as s:
        key = (await s.get(SubmissionPhoto, p["id"])).storage_key
    assert key.startswith(f"submissions/{d['id']}/") and key.endswith(".webp")
