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
- `web/` — panel WWW (React + TS + Vite + Tailwind). Obecnie makieta na danych przykładowych (`web/src/mock/`).
- `backend/` — FastAPI (od M1).
- `android/` — później.

## Komendy
- Makieta: `cd web && npm install && npm run dev` (build: `npm run build`, lint: `npm run lint`).
