"""M4: quiz and link validation on save (BR-35, BR-33)."""

import copy

import pytest

from tests.content_helpers import QUIZ, make_admin


async def _stage(api, make_user):
    a = await make_admin(api, make_user)
    p = await a.path()
    v = await a.version(p["id"])
    return a, await a.stage(v["id"])


def _variant(mutate):
    q = copy.deepcopy(QUIZ)
    mutate(q)
    return q


@pytest.mark.parametrize(
    "mutate",
    [
        lambda q: q.update(questions=[]),
        lambda q: q["questions"][0].update(options=[{"text": "Tylko jedna", "is_correct": True}]),
        lambda q: [o.update(is_correct=False) for o in q["questions"][1]["options"]],
        lambda q: [o.update(is_correct=True) for o in q["questions"][0]["options"]],  # SINGLE with 2 correct
        lambda q: q.update(pass_threshold=0),
        lambda q: q.update(pass_threshold=101),
    ],
    ids=["no-questions", "one-option", "no-correct", "single-two-correct", "threshold-0", "threshold-101"],
)
async def test_br35_invalid_quiz_rejected(api, make_user, mutate):
    a, s = await _stage(api, make_user)
    r = await a.req("POST", "/admin/tasks", 422, json={"stage_id": s["id"], **_variant(mutate)})
    assert r["error"]["code"] in ("QUIZ_INVALID", "VALIDATION_ERROR")


async def test_br35_quiz_default_threshold_80(api, make_user):
    a, s = await _stage(api, make_user)
    q = _variant(lambda q: q.pop("pass_threshold"))
    t = await a.task(s["id"], q)
    assert t["revision"]["pass_threshold"] == 80


async def test_br33_video_link_must_be_https(api, make_user):
    a, s = await _stage(api, make_user)
    q = _variant(lambda q: q.update(video_links=[{"title": "Film", "url": "http://example.com/x"}]))
    await a.req("POST", "/admin/tasks", 422, json={"stage_id": s["id"], **q})


async def test_non_quiz_ignores_questions_and_threshold(api, make_user):
    a, s = await _stage(api, make_user)
    t = await a.task(s["id"], {**QUIZ, "task_type": "THEORY"})
    assert t["revision"]["questions"] == [] and t["revision"]["pass_threshold"] is None
    assert len(t["revision"]["video_links"]) == 1  # links are allowed for every type
