"""Development seed (§31): `python -m app.seed`. Never for production data.

Accounts of every role (reserved example domain, no real personal data) and the "Podstawy kowalstwa"
programme from the PSPK task list (Q-36), built through the same services the admin uses, so every
row has its revision, audit entry and computed label. The programme is only starting data: the admin
arranges it freely afterwards (Q-63). Card contents exist only for Haczyk and Serce (Q-36a).
"""

import asyncio
import io
import os
import secrets
import sys
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.datastructures import Headers, UploadFile

from app.config import Settings, get_settings
from app.database import make_engine, make_sessionmaker
from app.models import User
from app.schemas.content import PathIn, StageIn, TaskCreate, VersionIn, VersionUpdate
from app.services import (
    audit_service,
    content_service,
    enrollment_service,
    file_service,
    permission_service,
    user_service,
)
from app.services.storage_service import LocalDiskStorage, Storage

ADMIN = "admin@akademia.example"
INSTRUCTOR = "instruktor@akademia.example"
PARTICIPANT = "uczestnik@akademia.example"
MULTI_ROLE = "kowal@akademia.example"  # instructor of stage 2 and participant at once (BR-25)

ACCOUNTS = [
    (ADMIN, "Admin", "Akademii", ["ADMIN"]),
    (INSTRUCTOR, "Instruktor", "Testowy", ["INSTRUCTOR"]),
    (PARTICIPANT, "Uczestnik", "Testowy", ["PARTICIPANT"]),
    (MULTI_ROLE, "Kowal", "Wielorolowy", ["INSTRUCTOR", "PARTICIPANT"]),
]

ASSETS = Path(__file__).parent / "seed_assets"
W2, W4 = 14, 28  # expected time per work in stage 1 and 2 (Q-36)

COURSE = {"description": "Zajęcia stacjonarne z instruktorem PSPK. Termin ustala instruktor prowadzący."}

THEORY = {
    "content_md": """Kuźnia to miejsce pracy z ogniem, rozgrzanym metalem i ciężkimi narzędziami. \
Zanim zaczniesz kuć, poznaj zasady, które obowiązują na każdym stanowisku PSPK.

## Najczęstsze zagrożenia
- **oparzenia** — od materiału, narzędzi i zgorzeliny,
- **urazy oczu** — odpryski zgorzeliny i opiłki,
- **urazy dłoni i nadgarstków** — źle trzymany młotek, odbicie od kowadła,
- **zatrucie tlenkiem węgla** — przy słabej wentylacji paleniska.

## Zasady
1. Zawsze okulary ochronne i pełne skórzane obuwie.
2. Ubranie z włókien naturalnych, bez luźnych elementów.
3. Gorącego materiału nie dotyka się dłonią — także w rękawicy. Używaj kleszczy.
4. Woda i gaśnica w zasięgu ręki, zanim rozpalisz palenisko.""",
    "assignment": "Opisz własnymi słowami pięć zagrożeń w kuźni i sposób, w jaki się przed nimi chronisz "
    "na swoim stanowisku.",
    "submission_requirements": "Odpowiedź w komentarzu albo zdjęcie odręcznej notatki.",
    "evaluation_criteria": "Pięć różnych zagrożeń, przy każdym konkretny sposób ochrony.",
    "video_links": [
        {
            "title": "Bezpieczne rozpalanie paleniska (film)",
            "url": "https://www.youtube.com/results?search_query=kowalstwo+bezpiecze%C5%84stwo",
        }
    ],
}


def _q(text: str, kind: str, options: list[tuple[str, bool]]) -> dict:
    return {"text": text, "kind": kind, "options": [{"text": t, "is_correct": ok} for t, ok in options]}


QUIZ = {
    "content_md": "Krótki test z wiadomości o stali i pracy w kuźni. Wynik zobaczysz od razu po wysłaniu odpowiedzi.",
    "pass_threshold": 80,
    "questions": [
        _q(
            "Jaki kolor żaru odpowiada właściwej temperaturze kucia stali niskowęglowej?",
            "SINGLE",
            [("Ciemnoczerwony", False), ("Wiśniowy", False), ("Żółto-pomarańczowy", True), ("Biały, iskrzący", False)],
        ),
        _q(
            "Dlaczego nie kuje się stali, która ostygła poniżej koloru wiśniowego?",
            "SINGLE",
            [
                ("Rośnie ryzyko pęknięć i zakładek", True),
                ("Stal zaczyna się topić", False),
                ("Młotek się odbija i niszczy kowadło", False),
            ],
        ),
        _q(
            "Które oznaczenia to stale niskowęglowe? Zaznacz wszystkie poprawne.",
            "MULTI",
            [("S235", True), ("C45", False), ("St3S", True), ("NC6", False)],
        ),
        _q(
            "Co oznaczają białe iskry wylatujące z materiału w palenisku?",
            "SINGLE",
            [
                ("Materiał jest gotowy do kucia", False),
                ("Stal się przepala i jest niszczona", True),
                ("Palenisko ma za mało powietrza", False),
            ],
        ),
        _q(
            "Które środki ochrony są obowiązkowe przy kuciu? Zaznacz wszystkie poprawne.",
            "MULTI",
            [
                ("Okulary ochronne", True),
                ("Pełne skórzane obuwie", True),
                ("Rękawice do chwytania gorącego materiału dłonią", False),
                ("Ubranie z włókien naturalnych", True),
            ],
        ),
    ],
}


def _steps(*steps: str) -> str:
    return "\n".join(f"{n}. {s}" for n, s in enumerate(steps, 1))


# Card "Haczyk / zawieszka" (docs/assets/karta-haczyk-zawieszka.png).
HACZYK = {
    "quantity_description": "2 sztuki",
    "material": "płaskownik 30–50 × 3–5 mm, stal niskowęglowa",
    "description": "Nauka pracy z płaskownikiem oraz łączenia kilku podstawowych operacji w jednym wyrobie. "
    "Ćwiczenie rozwija kontrolę rozcinania, wyciągania, kształtowania i gięcia materiału oraz wprowadza "
    "przebijanie otworu. Ważnym elementem jest wykonanie dwóch możliwie podobnych zawieszek.",
    "instructions": _steps(
        "Rozcięcie części górnej – przygotowanie materiału do wykonania dwóch wąsów.",
        "Odgięcie wąsów – rozdzielenie i wstępne ustawienie obu części.",
        "Wyciąganie i kształtowanie wąsów – zwężenie oraz nadanie im docelowej formy.",
        "Kształtowanie krawędzi – uporządkowanie obrysu i proporcji korpusu.",
        "Kształtowanie rybiego ogona – wykonanie ozdobnego zakończenia dolnej części.",
        "Zaginanie – uformowanie haka i nadanie wyrobowi końcowej geometrii.",
        "Przebijanie – wykonanie otworu montażowego.",
    ),
    "assignment": "Samodzielnie wykonaj 2 haczyki / zawieszki według jednego wzorca. Oba elementy powinny mieć "
    "zbliżone proporcje, kształt wąsów, geometrię haka, położenie otworu i sposób wykończenia. Celem jest "
    "uzyskanie dwóch elementów wyglądających jak jedna seria.",
    "evaluation_criteria": "Równe i kontrolowane rozcięcie; zbliżona długość oraz kształt obu wąsów; płynne "
    "przejścia przekrojów; estetycznie ukształtowane krawędzie i rybi ogon; równy łuk haka; otwór umieszczony "
    "prawidłowo względem osi; brak niezamierzonych skręceń płaskownika. Najważniejsze kryterium: kontrola "
    "formy i powtarzalność dwóch egzemplarzy.",
    "submission_requirements": "Dodaj zdjęcie obu zawieszek ułożonych obok siebie. Fotografia powinna "
    "umożliwiać ocenę kształtu wąsów, krawędzi, rybiego ogona, geometrii haków, otworów oraz powtarzalności "
    "wykonania.",
}

# Card "Serce" (docs/assets/karta-serce.png).
SERCE = {
    "quantity_description": "2 sztuki – po 1 każdym sposobem",
    "material": "pręt okrągły Ø6 mm, stal niskowęglowa",
    "description": "Nauka świadomego kształtowania pręta w formę symetryczną oraz kontroli wyciągania, "
    "zawijania i gięcia. Wykonanie serca uczy planowania ilości materiału potrzebnego na obie strony wyrobu "
    "oraz zachowania proporcji podczas kolejnych operacji.",
    "instructions": _steps(
        "Wyciągnięcie szpica – przygotowanie pierwszego zakończenia.",
        "Zawinięcie – uformowanie pierwszego ślimaka.",
        "Odcięcie – oddzielenie odpowiedniej długości materiału.",
        "Wyciągnięcie drugiego szpica – przygotowanie drugiego zakończenia.",
        "Zawinięcie – uformowanie drugiego ślimaka.",
        "Złożenie na pół – wyznaczenie osi i podstawowej formy serca.",
        "Skucie czubka – ukształtowanie dolnej części serca.",
        "Formowanie prawej części – nadanie właściwego łuku.",
        "Formowanie lewej części – dopasowanie drugiej strony i korekta symetrii.",
    ),
    "assignment": "Samodzielnie wykonaj 2 serca – po jednym każdym z dwóch pokazanych sposobów. Oba wyroby "
    "powinny mieć czytelną formę serca, płynne łuki i starannie ukształtowane zakończenia.",
    "evaluation_criteria": "Równe wyciągnięcie obu szpiców; podobna wielkość zawinięć; właściwe dobranie "
    "długości materiału przed odcięciem; zachowanie osi podczas składania; czytelny i estetyczny czubek; "
    "płynność prawego i lewego łuku; brak przypadkowych załamań i skręceń. Najważniejsze kryterium: kontrola "
    "proporcji i symetrii formy.",
    "submission_requirements": "Dodaj zdjęcie obu wykonanych serc ułożonych obok siebie. Fotografia powinna "
    "umożliwiać ocenę proporcji, symetrii, jakości zawinięć, czubka oraz płynności łuków.",
}

# (name, type, expected days, extra content, reference photos [(file, caption)])
STAGE_1 = [
    ("Bezpieczeństwo pracy w kuźni", "THEORY", 7, THEORY, []),  # example of an admin-added theory task
    ("Gwóźdź", "PRACTICAL", W2, {}, []),
    ("Haczyk / zawieszka", "PRACTICAL", W2, HACZYK, [("ref-haczyk.webp", "Wymagane: 2 podobne egzemplarze")]),
    ("Stal i ogień — test wiedzy", "QUIZ", 7, QUIZ, []),  # example of an admin-added quiz
    (
        "Serce [dwa sposoby]",
        "PRACTICAL",
        W2,
        SERCE,
        [("ref-serce-1.webp", "Sposób 1"), ("ref-serce-2.webp", "Sposób 2")],
    ),
    *[
        (name, "PRACTICAL", W2, {}, [])
        for name in (
            "Rybi ogon",
            "Liść",
            "Ślimak z twistem [trylobit]",
            "Fibula",
            "Szpila do włosów",
            "Pogrzebacz",
            "Otwieracz sowa",
            "Świecznik z liściem",
            "Dzwonek",
            "Głowa konia",
            "Wieszak ozdobny nitowany",
            "Kołatka",
        )
    ],
    ("Podkowa", "COURSE", 1, COURSE, []),
    ("Głowa byka", "COURSE", 1, COURSE, []),
    ("Głowa barana", "COURSE", 1, COURSE, []),
    ("Zestaw sztućców", "COURSE", 2, COURSE, []),
]

STAGE_2 = [
    *[
        (name, "PRACTICAL", W4, {}, [])
        for name in (
            "Kleszcze kowalskie",
            "Nóż typu Full Tang [Clip Point]",
            "Nóż typu Hidden Tang [Drop Point]",
            "Nóż typu Hidden Tang [Gyuto]",
            "Nóż typu Through Tang [Dagger]",
            "Topór brodaty",
            "Topór z wgrzewanym ostrzem",
            "Topór dwuostrzowy",
            "Miecz jednoręczny",
        )
    ],
    *[
        (name, "COURSE", 1, COURSE, [])
        for name in ("Zgrzewanie kowalskie", "Wgrzewanie stali", "San-Mai", "Damast warstwowy", "Damast puszkowy")
    ],
]


class SeedRefused(Exception):
    pass


async def _seeded(session: AsyncSession) -> bool:
    return bool(await session.scalar(select(func.count()).select_from(User).where(User.email == ADMIN)))


async def run(sessionmaker: async_sessionmaker, storage: Storage, settings: Settings, password: str) -> bool:
    """Create the starting data; False when it is already there (nothing is changed)."""
    if settings.environment == "production":
        raise SeedRefused("dane startowe są tylko dla środowiska deweloperskiego i testów (§31).")
    async with sessionmaker() as s:
        if await _seeded(s):
            return False
        users: dict[str, User] = {}
        for email, first, last, roles in ACCOUNTS:
            users[email] = await user_service.create_user(
                s, email=email, password=password, first_name=first, last_name=last, status="ACTIVE", roles=roles
            )
            audit_service.record(s, None, "USER_CREATED", "user", users[email].id, {"roles": roles, "via": "seed"})
        await s.commit()
        admin = users[ADMIN]

        path = await content_service.create_path(
            s, admin, PathIn(name="Podstawy kowalstwa", description="Program PSPK: od gwoździa do damastu.")
        )
        version = await content_service.create_version(s, admin, path.id, VersionIn(description="Wersja startowa"))
        for n, (stage_name, tasks) in enumerate(
            (("Kowalstwo podstawowe", STAGE_1), ("Kowalstwo zaawansowane", STAGE_2)), 1
        ):
            stage = await content_service.create_stage(
                s, admin, StageIn(path_version_id=version.id, name=stage_name, position=n)
            )
            if n == 2:
                await permission_service.grant(s, admin, users[MULTI_ROLE].id, None, stage.id)
            for name, kind, days, extra, photos in tasks:
                task = await content_service.create_task(
                    s,
                    admin,
                    TaskCreate(stage_id=stage.id, name=name, task_type=kind, expected_duration_days=days, **extra),
                )
                for filename, caption in photos:
                    upload = UploadFile(
                        io.BytesIO((ASSETS / filename).read_bytes()),
                        filename=filename,
                        headers=Headers({"content-type": "image/webp"}),
                    )
                    await file_service.add_material(s, storage, settings, admin, task.id, upload, caption)
        await content_service.update_version(s, admin, version.id, VersionUpdate(is_active=True))
        await permission_service.grant(s, admin, users[INSTRUCTOR].id, version.id, None)
        for email in (PARTICIPANT, MULTI_ROLE):
            await enrollment_service.enroll(s, admin, users[email].id, version.id)
            await s.commit()
    return True


async def _main() -> None:
    settings = get_settings()
    # The password comes from SEED_PASSWORD or is generated; it is shown once on this terminal, never logged.
    password = os.environ.get("SEED_PASSWORD") or secrets.token_urlsafe(12)
    engine = make_engine(settings)
    try:
        created = await run(make_sessionmaker(engine), LocalDiskStorage(settings.storage_root), settings, password)
    except SeedRefused as exc:
        sys.exit(f"Odmowa: {exc}")
    finally:
        await engine.dispose()
    if not created:
        print("Dane startowe już są — nic nie zmieniono.")
        return
    print("Utworzono dane startowe: ścieżka „Podstawy kowalstwa” (2 etapy, 35 zadań) i konta:")
    for email, *_, roles in ACCOUNTS:
        print(f"  {email:30} {', '.join(roles)}")
    if "SEED_PASSWORD" not in os.environ:
        print(f"Hasło wszystkich kont: {password}  (zapisz je teraz — nie jest nigdzie przechowywane)")


if __name__ == "__main__":
    asyncio.run(_main())
