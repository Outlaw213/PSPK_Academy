"""§30: /openapi.json matches the endpoint tables of docs/api.md, both ways."""

import re
from pathlib import Path

from app.config import Settings
from app.main import create_app

API_MD = Path(__file__).resolve().parents[2] / "docs" / "api.md"
METHOD = r"(?:GET|POST|PUT|DELETE|PATCH)"


def _norm(path: str) -> str:
    return re.sub(r"\{[^}]+\}", "{}", path)


def documented() -> set[tuple[str, str]]:
    """Rows like `| GET / POST | **[+]** /admin/x, /admin/x/{id}?q= | … |`."""
    out = set()
    for line in API_MD.read_text(encoding="utf-8").splitlines():
        m = re.match(rf"\|\s*({METHOD}(?:\s*/\s*{METHOD})*)\s*\|\s*([^|]+)\|", line)
        if not m:
            continue
        methods = [x.strip() for x in m.group(1).split("/")]
        paths, prev = [], None
        for p in m.group(2).replace("**[+]**", "").split(","):
            p = p.split("?")[0].strip()
            if prev and p.count("/") == 1:  # "/activate" after "/admin/tasks/{id}/deactivate"
                p = prev.rsplit("/", 1)[0] + p
            paths.append(p)
            prev = p
        if len(methods) == len(paths) > 1:  # "POST / PUT | /a, /a/{id}" pairs up
            pairs = list(zip(methods, paths, strict=True))
        else:
            pairs = [(x, y) for x in methods for y in paths]
        out |= {(x, _norm(y)) for x, y in pairs}
    return out


def implemented() -> set[tuple[str, str]]:
    spec = create_app(Settings()).openapi()
    return {(m.upper(), _norm(p.removeprefix("/api/v1"))) for p, ops in spec["paths"].items() for m in ops}


def test_openapi_matches_api_md():
    doc, api = documented(), implemented()
    assert len(doc) > 50  # the parser really read the tables
    assert doc - api == set(), "documented in api.md but missing in the API"
    assert api - doc == set(), "in the API but not documented in api.md"
