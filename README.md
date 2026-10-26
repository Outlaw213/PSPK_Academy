# PSPK Akademia

System edukacyjny Polskiego Stowarzyszenia Pasjonatów Kowalstwa: ścieżki nauki, zadania z kart, zgłoszenia ze zdjęciami i ocena instruktora.

## Stan
- **M0a — makieta panelu WWW** (`web/`): klikalne ekrany uczestnika, instruktora i administratora na danych przykładowych. Bez backendu.
- Następnie **M1–M11 — backend** (FastAPI + PostgreSQL) wg `docs/plan.md`.

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

Pełne README (Docker Compose, migracje, seed, testy, zmienne środowiskowe) powstanie w M11.
