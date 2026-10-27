# PSPK Akademia — wskazówki dla Claude

System edukacyjny Polskiego Stowarzyszenia Pasjonatów Kowalstwa: ścieżki → etapy → zadania → próby → ocena instruktora.

## Dokumenty (źródło prawdy, kolejność czytania)
`PSPK_Academy_specyfication_v1.txt` (niezmieniana) → `docs/open-questions.md` (decyzje PO) → `docs/business-rules.md` → `docs/database.md` → `docs/api.md` → `docs/architecture.md` → `docs/plan.md`. Proces: `docs/sdd-process.md`.

## Konstytucja (nienegocjowalne)
1. Backend jest jedynym źródłem prawdy o rolach, dostępie, statusach i odblokowaniu zadań. Frontend nie liczy statusów.
2. Historia jest nienaruszalna: prób, ocen i wersji ścieżek nie nadpisuje się i nie usuwa.
3. PASSED jest ostateczne i zawsze ma swoje Assessment.
4. Logika statusu zadania istnieje w jednym miejscu (`task_service`).
5. Żadnych sekretów w repozytorium; żadnych haseł/tokenów w logach.
6. Każda zmiana schematu przez Alembic.
7. Nie dodajemy funkcji spoza MVP „bo się przydadzą”.
8. Nie raportujemy fikcyjnych wyników testów („TEST NIEURUCHOMIONY”).

## Praca
- Każdy kamień milowy: spec delta → testy (czerwone) → kod → pełna regresja → raport (§37) → akceptacja PO.
- Zmiana wymagania = wpis w `docs/open-questions.md` (sekcja Decyzje, z datą).
- Testy wskazują ID wymagania w nazwie: `test_br02_...`.
- Interfejs po polsku, kody błędów API po angielsku.

## Struktura
- `web/` — panel WWW (React + TS + Vite + Tailwind) na prawdziwym API; testy w przeglądarce: `cd web && npm run e2e`.
- `backend/` — FastAPI: `app/` (config, database, errors, api, models), `alembic/` (migracje), `tests/` (`factories.py` — minimalne wiersze do testów bazy).
- `android/` — później.

## Komendy
- Backend lokalnie: `cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt`
- Testy: baza testowa na porcie 5433 (`docker run -d --name pspk-test-db -e POSTGRES_USER=pspk -e POSTGRES_PASSWORD=pspk -e POSTGRES_DB=pspk_academy_test -p 5433:5432 postgres:18-alpine`), potem `cd backend && .venv/bin/pytest` (inny adres: `TEST_DATABASE_URL`).
- Migracje: `cd backend && .venv/bin/alembic upgrade head` (URL z `DATABASE_URL`). Nowa migracja: `alembic revision --autogenerate -m ...`, potem przejrzyj ręcznie; `alembic check` musi być czysty (pilnuje tego test).
- Lint backendu: `.venv/bin/ruff check . && .venv/bin/ruff format --check .`
- Cały stos: `cp .env.example .env` (uzupełnij hasła), `docker compose up -d --build`, `curl localhost:8000/health`.
- Za proxy z własnym CA: `docker build --secret id=pip_ca,src=<plik CA> -t pspk-akademia-backend backend`, potem `docker compose up -d --no-build`.
- Panel: `cd web && npm install && npm run dev` (proxy `/api` → `localhost:8000`; build: `npm run build`, lint: `npm run lint`, e2e na jednorazowym stosie: `npm run e2e`).
