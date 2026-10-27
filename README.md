# PSPK Akademia

System edukacyjny Polskiego Stowarzyszenia Pasjonatów Kowalstwa: ścieżki nauki, zadania z kart, zgłoszenia ze zdjęciami i ocena instruktora.

## Stan
- **M0a — makieta panelu WWW** (`web/`): klikalne ekrany uczestnika, instruktora i administratora na danych przykładowych. Bez backendu.
- **M1 — szkielet backendu** (FastAPI + PostgreSQL 18 w Docker Compose): `/health`, `/docs`, jednolity format błędów, testy.
- **M2 — baza danych**: 21 tabel, migracja 0001.
- **M3 — konta i logowanie**: rejestracja z akceptacją admina, sesje, role, panel użytkowników (API).
- **M4 — treść edukacyjna** (API admina): ścieżki, wersje (także kopia z uprawnieniami), etapy, zadania wszystkich typów z wersjami treści, quizy, linki do filmów, kolejność, wyłączanie zadań.
- **M5 — zapisy i statusy**: admin zapisuje uczestników; uczestnik widzi swoją ścieżkę ze statusami liczonymi z kolejności i typów ustawionych przez admina.
- **M6 — zgłoszenia uczestnika**: szkic, zdjęcia (na dysk, zmniejszane do 2560 px, WebP, bez EXIF), wysyłka, wycofanie, historia prób, quiz z wynikiem od razu.
- Dalej **M7–M11** wg `docs/plan.md`.

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
# Pierwszy administrator (hasło wpisujesz w prompcie):
docker compose exec backend python -m app.cli create-admin --email admin@pspk.pl
# Swagger: http://localhost:8000/docs
```

Testy i lint: zob. `CLAUDE.md`, sekcja Komendy.

Pełne README (migracje, seed, wszystkie zmienne) powstanie w M11.
