# PSPK Akademia

System edukacyjny Polskiego Stowarzyszenia Pasjonatów Kowalstwa: ścieżki nauki, zadania z kart, zgłoszenia ze zdjęciami i ocena instruktora.

## Stan
- **M0a — makieta panelu WWW** (`web/`): klikalne ekrany uczestnika, instruktora i administratora na danych przykładowych. Bez backendu.
- **M1 — szkielet backendu** (FastAPI + PostgreSQL 18 w Docker Compose): `/health`, `/docs`, jednolity format błędów, testy.
- Dalej **M2–M11** wg `docs/plan.md`.

## Dokumentacja
Zacznij od `docs/sdd-process.md`. Specyfikacja wejściowa: `PSPK_Academy_specyfication_v1.txt`.

## Makieta — uruchomienie
```bash
cd web
npm install
npm run dev          # http://localhost:5173
npm run build        # wersja produkcyjna w web/dist
npm run build:single # jeden plik HTML (podgląd do akceptacji) w web/dist-single
```

## Backend — uruchomienie
```bash
cp .env.example .env        # uzupełnij POSTGRES_PASSWORD i JWT_SECRET_KEY
docker compose up -d --build
curl localhost:8000/health  # {"status":"ok","database":"ok"}
# Swagger: http://localhost:8000/docs
```

Testy i lint: zob. `CLAUDE.md`, sekcja Komendy.

Pełne README (migracje, seed, wszystkie zmienne) powstanie w M11.
