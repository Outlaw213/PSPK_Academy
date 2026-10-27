# PSPK Akademia

System edukacyjny Polskiego Stowarzyszenia Pasjonatów Kowalstwa: ścieżki nauki, zadania z kart, zgłoszenia ze zdjęciami i ocena instruktora.

Backend MVP (M1–M11) jest gotowy: API dla uczestnika, instruktora i administratora. Panel WWW (`web/`) działa na prawdziwym API dla uczestnika (M12a); widoki instruktora i admina są jeszcze na danych przykładowych (M12b, M12c). Android to M13. Plan i stan prac: `docs/plan.md`.

## Wymagania
- Docker z Docker Compose v2 — do uruchomienia całości.
- Do pracy nad kodem backendu: Python 3.13. Do makiety: Node.js 20+.

## Instalacja i uruchomienie (Docker Compose)
```bash
cp .env.example .env              # uzupełnij POSTGRES_PASSWORD i JWT_SECRET_KEY
docker compose up -d --build      # PostgreSQL 18 + backend + panel WWW; migracje uruchamiają się przy starcie
curl localhost:8000/health        # {"status":"ok","database":"ok"}
# panel WWW: http://localhost:8080
```
Porty zmienisz zmiennymi `WEB_PORT`, `API_PORT`, `DB_PORT` (domyślnie 8080, 8000, 5432).
Za proxy z własnym certyfikatem CA: `docker build --secret id=pip_ca,src=<plik CA> -t pspk-akademia-backend backend` i `docker build --secret id=npm_ca,src=<plik CA> -t pspk-akademia-web web`, potem `docker compose up -d --no-build`.

## Migracje
Schemat bazy powstaje wyłącznie z migracji Alembic. Kontener backendu wykonuje `alembic upgrade head` przy każdym starcie. Ręcznie:
```bash
docker compose exec backend alembic upgrade head
# lokalnie: cd backend && DATABASE_URL=... .venv/bin/alembic upgrade head
```
Nowa migracja: `alembic revision --autogenerate -m "opis"`, przejrzyj plik ręcznie; `alembic check` musi być czysty (pilnuje tego test).

## Dane startowe (seed) — tylko development
```bash
docker compose exec backend python -m app.seed
```
Tworzy ścieżkę „Podstawy kowalstwa” wg listy zadań PSPK (`docs/assets/lista-zadan-sciezki.jpeg`):
- Etap 1 „Kowalstwo podstawowe”: 15 prac własnych i 4 kursy, plus przykładowe zadanie teoretyczne i quiz,
- Etap 2 „Kowalstwo zaawansowane”: 9 prac własnych i 5 kursów,
- pełna treść kart „Haczyk / zawieszka” i „Serce” ze zdjęciami wzorcowymi (pozostałe karty — Q-36a).

Oraz konta w domenie `akademia.example` (bez prawdziwych danych osobowych):

| Konto | Role |
|---|---|
| `admin@akademia.example` | ADMIN |
| `instruktor@akademia.example` | INSTRUCTOR (cała wersja ścieżki) |
| `uczestnik@akademia.example` | PARTICIPANT (zapisany na ścieżkę) |
| `kowal@akademia.example` | INSTRUCTOR (etap 2) + PARTICIPANT (zapisany) |

Hasło: z `SEED_PASSWORD`, a bez niej losowe, wypisane raz w terminalu. Ponowne uruchomienie niczego nie zmienia. Przy `ENVIRONMENT=production` seed odmawia działania.

Pierwszy administrator na prawdziwym serwerze (bez seeda; hasło wpisujesz w prompcie):
```bash
docker compose exec backend python -m app.cli create-admin --email admin@pspk.pl
```

## Testy
Testy działają na prawdziwym PostgreSQL (osobna baza na porcie 5433):
```bash
docker run -d --name pspk-test-db -e POSTGRES_USER=pspk -e POSTGRES_PASSWORD=pspk \
  -e POSTGRES_DB=pspk_academy_test -p 5433:5432 postgres:18-alpine
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest                                     # inna baza: TEST_DATABASE_URL=...
.venv/bin/ruff check . && .venv/bin/ruff format --check .
```
Nazwy testów wskazują wymaganie (`test_br02_...`, `test_fr_adm05_...`, `test_test10_...`).

Testy panelu w przeglądarce (Playwright, telefon i komputer) na osobnym, jednorazowym stosie — Twoje lokalne dane nie są dotykane:
```bash
cd web && npm install
npm run e2e            # E2E_BUILD=1 npm run e2e — najpierw zbuduje obrazy
```
Zrzuty ekranu trafiają do `web/e2e/screenshots/`.

## Swagger
- `http://localhost:8000/docs` — interaktywna dokumentacja API,
- `http://localhost:8000/openapi.json` — schemat OpenAPI.

Kontrakt opisuje `docs/api.md`; test `tests/test_openapi.py` pilnuje, żeby lista endpointów w `api.md` i w `/openapi.json` była identyczna.

## Zmienne środowiskowe
Wzór: `.env.example`. Pliku `.env` nie dodaje się do repozytorium.

| Zmienna | Domyślnie | Znaczenie |
|---|---|---|
| `ENVIRONMENT` | `development` | `development` / `test` / `production`; w produkcji wymagany prawdziwy `JWT_SECRET_KEY`, seed zablokowany |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `pspk`, —, `pspk_academy` | baza w Docker Compose (hasło wymagane) |
| `DATABASE_URL` | składany przez Compose | adres bazy (`postgresql+asyncpg://...`) przy uruchomieniu poza Compose |
| `JWT_SECRET_KEY` | — | klucz podpisu tokenów; wygeneruj: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | ważność tokenu dostępu |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | `30` | ważność sesji (token odświeżania) |
| `PHOTO_STORAGE_PATH` | wolumen Dockera | katalog na serwerze z plikami (zdjęcia, PDF) — dedykowany dysk |
| `STORAGE_ROOT` | `/data/storage` | katalog plików wewnątrz kontenera |
| `MAX_UPLOAD_SIZE_MB` | `10` | maks. rozmiar wgrywanego zdjęcia |
| `MAX_SUBMISSION_PHOTOS` | `10` | maks. liczba zdjęć w zgłoszeniu |
| `MAX_ATTACHMENT_SIZE_MB` | `20` | maks. rozmiar PDF |
| `IMAGE_MAX_EDGE`, `IMAGE_QUALITY` | `2560`, `82` | zmniejszanie zdjęć (dłuższy bok w px, jakość WebP) |
| `SEED_PASSWORD` | losowe | hasło kont z seeda |

## Struktura projektu
```
backend/
  app/
    api/v1/        endpointy (auth, admin_*, participant, instructor)
    services/      logika biznesowa; statusy zadań tylko w task_service.py
    models/        modele SQLAlchemy
    schemas/       schematy Pydantic (wejście/wyjście API)
    utils/         hasła i tokeny, obróbka zdjęć
    seed.py        dane startowe (development)
    cli.py         create-admin
  alembic/         migracje
  tests/           testy (pytest, prawdziwy PostgreSQL)
web/
  src/api/         klient API, sesja (token w pamięci, odświeżanie przez ciasteczko HttpOnly)
  src/screens/     ekrany; uczestnik na API, instruktor i admin jeszcze na danych przykładowych (src/mock/)
  e2e/             testy Playwright
  nginx.conf       serwowanie panelu i przekazywanie /api do backendu
docs/              wymagania, decyzje, kontrakt API, architektura, plan
docker-compose.yml
```

## Dokumentacja
Kolejność czytania: `PSPK_Academy_specyfication_v1.txt` → `docs/open-questions.md` (decyzje) → `docs/business-rules.md` → `docs/database.md` → `docs/api.md` → `docs/architecture.md` → `docs/plan.md`. Proces pracy: `docs/sdd-process.md`.

## Panel WWW — praca nad kodem
```bash
cd web
npm install
npm run dev          # http://localhost:5173, /api przekazywane do backendu na :8000 (inny: API_URL=...)
npm run build        # wersja produkcyjna w web/dist
npm run build:single # jeden plik HTML (podgląd do akceptacji) w web/dist-single
```
