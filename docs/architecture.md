# Architektura

> **Wersja odtworzona 2026-10-26.** Oryginalny plik (ADR-01…23) nie zachował się. Poniżej ADR-y, których treść wynika jednoznacznie z pozostałych dokumentów (`database.md`, `api.md`, `business-rules.md`, `plan.md`), oraz nowe decyzje z 2026-10-26 (ADR-24…28). Numery, których treści nie da się odtworzyć, są oznaczone jako luki.

## Przegląd

```
 przeglądarka (React SPA)          Android (później, Kotlin)
          │  HTTPS, /api/v1               │
          ▼                               ▼
   ┌─────────────────────────────────────────────┐
   │ FastAPI (backend — jedyne źródło prawdy)    │
   │  api/v1 → services → models (SQLAlchemy 2)  │
   └──────────────┬──────────────────┬───────────┘
                  ▼                  ▼
          PostgreSQL 18      dysk na zdjęcia (STORAGE_ROOT)
```

- Warstwy: `api` (HTTP, schematy Pydantic, dependencies) → `services` (logika biznesowa, transakcje) → `models`. Router nie zawiera logiki biznesowej.
- Logika statusu zadań wyłącznie w `services/task_service.py` (konstytucja p. 4).
- Klienci (WWW, Android) tylko wyświetlają statusy z API — nie liczą ich (R11, §34).

## ADR

| ID | Decyzja | Status |
|---|---|---|
| ADR-01 | Stos backendu wg §6 spec.: Python 3.13, FastAPI, SQLAlchemy 2.x (async, asyncpg), Alembic, Pydantic v2, PostgreSQL 18, pytest. | przyjęte |
| ADR-02…08 | *luka — treść utracona* | — |
| ADR-09 | Refresh tokeny jako JWT z `jti` zapisanym w `refresh_tokens`. Rotacja przy każdym odświeżeniu (`used_at`); ponowne użycie zużytego tokenu → unieważnienie całej rodziny (`family_id` = sesja). Wylogowanie = `revoked_at` dla rodziny. | przyjęte |
| ADR-10 | Operacje współbieżne (claim, ocena, kolejność) w transakcjach z `SELECT … FOR UPDATE`; wykryte zakleszczenie PostgreSQL → `409 CONCURRENT_UPDATE`, klient może ponowić. | przyjęte |
| ADR-11…13 | *luka — treść utracona* | — |
| ADR-14 | Treść zadania w niezmiennych `task_revisions`; aktualna rewizja = najwyższy `revision_number`. Zgłoszenie wskazuje rewizję z chwili wysłania (BR-19). | przyjęte |
| ADR-15 | `unique(…, position)` na etapach i zadaniach jako `DEFERRABLE INITIALLY DEFERRED` — zmiana kolejności całej listy w jednej transakcji bez kolizji. | przyjęte |
| ADR-16…17 | *luka — treść utracona* | — |
| ADR-18 | Enumy w bazie jako `VARCHAR` + `CHECK` (nie natywny `ENUM` PostgreSQL) — prostsze migracje. | przyjęte |
| ADR-19 | `users.token_version` w access tokenie; zmiana/reset hasła podnosi wersję → stare tokeny przestają działać. Status konta sprawdzany przy każdym żądaniu (BR-28). | przyjęte |
| ADR-20…22 | *luka — treść utracona* | — |
| ADR-23 | Hosting: Proxmox VE (VM Debian 13 + Docker Compose), wystawienie przez Cloudflare Tunnel (`cloudflared`), domena `pspk.pl`; staging `akademia-staging.pspk.pl` za Cloudflare Access. Szczegóły zasobów — `infrastructure.md` (do odtworzenia, Q-46…Q-50). | przyjęte |
| ADR-24 | **Zdjęcia na dysku lokalnym serwera** (zamiast S3/MinIO/SeaweedFS). `StorageService` = interfejs (`put`, `open`, `delete`); implementacja `LocalDiskStorage` pod `STORAGE_ROOT` (wolumen Dockera montowany z dedykowanego dysku). Klucze jak w §15: `submissions/{submission_id}/{uuid}.webp`, `materials/{task_id}/{uuid}.webp`. Zapis atomowy (plik tymczasowy + `rename`); przy wycofaniu transakcji plik jest usuwany (kompensacja). Pliki serwowane wyłącznie przez backend z kontrolą uprawnień. Interfejs pozwala później dodać S3 bez zmian w serwisach. Odstępstwo od §14–15 i NFR-06 — decyzja PO Q-34 (2026-10-26). | przyjęte |
| ADR-25 | **Przetwarzanie zdjęć przy uploadzie** (Pillow): weryfikacja typu po zawartości (jpeg/png/webp), korekcja orientacji z EXIF, usunięcie metadanych, skalowanie do dłuższego boku `IMAGE_MAX_EDGE` (domyślnie 2560 px, bez powiększania), zapis jako WebP (`IMAGE_QUALITY`, domyślnie 82). Oryginał nie jest przechowywany. `file_size`, `width`, `height`, `mime_type` w bazie dotyczą pliku po przetworzeniu. Limit `MAX_UPLOAD_SIZE_MB` dotyczy pliku wejściowego. | przyjęte |
| ADR-26 | **Sesja w przeglądarce:** access token tylko w pamięci aplikacji; refresh token w ciasteczku `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`. `login`/`refresh` zwracają refresh token w ciele (Android) i dodatkowo ustawiają ciasteczko, gdy klient wyśle `X-Client: web`. `refresh`/`logout` przyjmują token z ciała albo z ciasteczka. | przyjęte |
| ADR-27 | **Panel WWW:** React 18 + TypeScript + Vite + Tailwind CSS, SPA serwowane statycznie (nginx w kontenerze), komunikacja tylko przez `/api/v1`. Język interfejsu polski (NFR-07). Design wg Apple HIG: typografia systemowa (SF / Inter), duże zaokrąglenia, materiał „szkła”, tryb jasny i ciemny, kolory PSPK jako tokeny CSS: granat `#263944` (akcent w jasnym), brąz `#A77A35` (marka; w ciemnym akcent `#D4A862`), tło `#F6F6F4` — z kart zadań PSPK (Q-55). | przyjęte |
| ADR-28 | **Android** później, natywnie (Kotlin), kompresja zdjęć na urządzeniu przed wysłaniem (R9); backend i tak przetwarza wg ADR-25. | przyjęte |

### Panel WWW w działaniu (M12)
- Kontener `web`: nginx serwuje zbudowaną aplikację i przekazuje `/api` do backendu — jedna domena, więc bez CORS, a ciasteczko sesji (`SameSite=Strict`) działa. W trybie deweloperskim to samo robi proxy Vite.
- Pliki z kontrolą dostępu (zdjęcia zgłoszeń, zdjęcia wzorcowe, PDF) panel pobiera przez `fetch` z tokenem i pokazuje jako `blob:` URL — `<img src>` nie wysyła nagłówka `Authorization`, a tokenu nie wolno dawać w adresie (trafiłby do logów).
- Panel nie liczy statusów ani oznaczeń zadań: po każdej akcji pobiera stan z API.
- Wyjątek: podgląd quizu w kreatorze admina sprawdza odpowiedzi w przeglądarce na niezapisanych pytaniach i nic nie zapisuje. Uczestnika ocenia zawsze backend (BR-32).
- Makieta jednoplikowa (podgląd do akceptacji, M0a) jest wycofana w M12c2 — panel działa tylko z API.

## Odstępstwa od specyfikacji v1 (zatwierdzone decyzjami PO)

| Spec. v1 | Teraz | Decyzja |
|---|---|---|
| `users.role` + `is_active` | `user_roles` (wiele ról) + `users.status` | Q-16, Q-21 |
| treść zadania w `tasks` | `task_revisions` | Q-06, ADR-14 |
| zdjęcia wysyłane razem z utworzeniem zgłoszenia | szkic `DRAFT`, zdjęcia pojedynczo, osobne `submit` | Q-03 |
| MinIO | dysk lokalny + przetwarzanie zdjęć | Q-34, ADR-24, ADR-25 |
| rejestracja = aktywne konto | `PENDING_APPROVAL` do akceptacji admina | Q-21 |
| typy zadań PRACTICAL/THEORY/QUIZ | + `COURSE` zaliczany wpisem instruktora | Q-56 |
| R10: tylko instruktor zalicza | quiz zaliczany automatycznie wg klucza admina; AI nadal nie zalicza | Q-60 |
| treść zadania jako tekst | Markdown + załączniki PDF i linki do filmów | Q-62 |
| jedna kolejność przez całą ścieżkę (§9) | kolejność prac w etapie + bramka etapu; kursy poza kolejnością | Q-57 |
