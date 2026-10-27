# Plan implementacji

Każdy etap przechodzi cykl z `docs/sdd-process.md`: spec delta → testy (czerwone) → kod → pełna regresja → raport → akceptacja.
Mapowanie na STEP z §35 specyfikacji podane w nawiasach. Zakres M1–M11 zostanie potwierdzony po fazie architektury.

## M0 — Specyfikacja i decyzje (STEP 1)
- [x] Analiza specyfikacji v1 i kart zadań
- [x] Dokumenty: business-rules, database, api, architecture, open-questions, plan
- [x] Decyzje PO dla reguł biznesowych (2026-10-03) i aktualizacja business-rules, database, api
- [x] **Faza architektury:** `architecture.md` przepisany (ADR-01…23, mapa blokad, odstępstwa od spec.), Q-34 → S3 + SeaweedFS
- [x] Hosting (Q-29): Proxmox, Cloudflare Tunnel, `pspk.pl` — wpisane do ADR-23
- [x] Odtworzenie `architecture.md` i `open-questions.md` (oryginały utracone, 2026-10-26)
- [x] Decyzje 2026-10-26: Q-30 (React), Q-34 (dysk lokalny + resize), Q-37 (sesja WWW), Q-54 (design Apple)
- [ ] Akceptacja architektury przez PO
- [ ] Środowisko (Q-32, zmiana 2026-10-25): repozytorium GitHub z dokumentacją i `.claude/`, Claude GitHub App na repo, środowisko chmurowe Claude Code; lokalnie tylko Git
- [ ] Pełny program nauczania (Q-36) — nie blokuje do M11
**DoD:** wszystkie pytania blokujące M1–M3 mają status DECIDED/DEFAULT.

## M0a — Makieta WWW (wyjątek od §36, decyzja Q-30)
- [ ] `web/`: Vite + React + TS + Tailwind, tokeny designu (Apple HIG, jasny/ciemny, kolory PSPK — Q-51)
- [ ] Ekrany uczestnika, instruktora i admina na danych przykładowych (bez backendu, bez logiki biznesowej)
- [x] Publikacja podglądu do akceptacji PO (v1)
- [x] v2: kolory i logo PSPK (Q-55), program z listy (Q-36), kursy (Q-56, Q-57)
- [x] Kierunek designu zaakceptowany przez PO (2026-10-26)
- [x] v3: kreator ścieżki (dodawanie zadań i etapów, typy), edytor quizu, teoria z materiałami (Q-60…Q-62)
**DoD:** PO akceptuje kierunek designu.

## M1 — Szkielet i infrastruktura (STEP 2–5) ✔ zaakceptowane 2026-10-26
- [x] Struktura katalogów, `.gitignore`, `.env.example`, `CLAUDE.md`
- [x] `docker-compose.yml`: postgres, backend, wolumen na zdjęcia (Q-34); healthchecki; wolumeny
- [x] `config.py` (pydantic-settings), `database.py` (async engine/sesja), `main.py`, `GET /health`
- [x] `errors.py` — jednolity format błędów
- [x] pytest + conftest z bazą testową
**DoD:** `docker compose up` startuje usługi, `/health` = 200 (sprawdza DB), `/docs` działa, test dymny zielony.

## M2 — Modele i migracja 0001 (STEP 6–7) ✔ zaakceptowane 2026-10-27
- [x] Wszystkie modele z `database.md` (21 tabel, w tym quiz, załączniki, kursy — `backend/app/models/`)
- [x] Migracja 0001, indeksy częściowe, checki, DEFERRABLE, złożony FK zapis↔wersja
- [x] Testy ograniczeń DB (unikalności, jedna otwarta próba, jedno PASSED, limit pozycji zdjęć, brak samooceny, kursy, quiz, załączniki) + upgrade/downgrade + `alembic check`
- [x] Backend w Dockerze migruje bazę przy starcie (`alembic upgrade head`)
**DoD:** `alembic upgrade head` i `downgrade base` przechodzą na czystej bazie.

## M3 — Uwierzytelnianie i konta (STEP 8) ✔ zaakceptowane 2026-10-27
- [x] register (`PENDING_APPROVAL`) / login / refresh / logout / me / change-password, Argon2id, JWT; ciasteczko dla przeglądarki (ADR-26)
- [x] wiele ról, dependencies `require_*`
- [x] admin: użytkownicy, zatwierdzanie/odrzucanie, ustawienie hasła, dezaktywacja; automatyczne zwolnienie zgłoszeń (BR-26)
- [x] `python -m app.cli create-admin` (FR-AUTH-08)
- [x] `test_auth.py`, `test_admin_users.py`, `test_cli.py`: FR-AUTH-01..08, FR-ADM-01, BR-26, BR-27, BR-28
**DoD:** kryteria §29 „Authentication”.

## M4 — Treść edukacyjna, rewizje i wersje (STEP 9) ✔ zaakceptowane 2026-10-27
- [x] Admin: ścieżki, wersje (kopia z uprawnieniami, włączanie zapisów), etapy, zadania wszystkich typów z rewizjami (pytania quizu, Markdown, linki do filmów, przenoszenie między etapami), kolejność, wyłączanie zadań; oznaczenia E1.2 (BR-34). Wgrywanie plików (zdjęcia wzorcowe, PDF) → M9. BR-15 przy wyłączeniu zadania → M5 (wymaga statusów).
- [x] `test_paths.py`, `test_quiz_admin.py`, `test_revisions.py` (część admin), `test_structure.py` (część bez zgłoszeń): TEST 13, BR-16, BR-19, BR-24
**DoD:** kryteria §29 „Learning paths”.

## M5 — Zapisy i statusy zadań (STEP 10, 12) ← GOTOWE, CZEKA NA AKCEPTACJĘ
- [x] Admin: zapisy (utworzenie, lista, anulowanie); uczestnik: `/me/paths`, szczegóły, `/progress`, `/tasks/{id}` z widoczną rewizją
- [x] `compute_path_statuses` (jedyne miejsce statusów, stała liczba zapytań), `get_previous_task`, `is_task_available`
- [x] Testy jednostkowe statusów + TEST 1, TEST 2, przejście między etapami, zapis nieaktywny (Q-39), kursy poza kolejnością i bramka etapu (BR-02, BR-31)
- [x] BR-15 (ukończenie zapisu) przy wyłączeniu zadania; BR-29 anulowanie zapisu anuluje otwarte próby; Q-45 reaktywacja
**DoD:** kryteria §29 „Enrollment”.

## M6 — Zgłoszenia: szkic, zdjęcia, wysyłka, historia (STEP 11)
- [ ] Szkic, komentarz, zdjęcia pojedynczo (magazyn in-memory), wysyłka z wymaganiami wg typu, porzucenie/wycofanie, historia
- [ ] TEST 5, TEST 7, TEST 8, TEST 9, TEST 12, BR-14, BR-17, BR-21, BR-22, BR-23
**DoD:** nieograniczone próby, pełna historia, brak obejścia blokad, limit zdjęć.

## M7 — Uprawnienia instruktora, claim, release (STEP 13)
- [ ] Uprawnienia ścieżka/etap (nadanie, lista, odebranie), kolejka, szczegóły, claim, release ręczny i automatyczny, zakaz samooceny
- [ ] TEST 10, TEST 11, test równoległego claim (N równoległych żądań → dokładnie 1×200), BR-25, BR-26
**DoD:** kryteria §29 „Instructor” (część claim).

## M8 — Ocena i ostateczne zaliczenie (STEP 14)
- [ ] Assessment, przejścia stanów, automatyczne COMPLETED zapisu, zgłoszenie oceniane wg swojej rewizji
- [ ] Wyniki kursów przez instruktora (BR-30, FR-INS-06, `test_courses.py`)
- [ ] Quiz z automatyczną oceną (BR-32, `test_quiz.py`)
- [ ] TEST 3, TEST 4, TEST 6, BR-07, BR-13, BR-15, `test_structure.py` (część ze zgłoszeniami), `test_enrollments.py` (BR-29)
**DoD:** kryteria §29 „Final pass”.

## M9 — Magazyn obiektów i pliki (STEP 15)
- [ ] Upload zdjęć wzorcowych i załączników PDF przez admina (`/admin/tasks/{id}/materials`, `/attachments`), przeniesione z M4
- [ ] `LocalDiskStorage` (ADR-24); walidacja po zawartości; skalowanie do 2560 px + WebP, usuwanie EXIF (ADR-25); kompensacja przy błędzie transakcji
- [ ] Endpointy pobierania zdjęć zgłoszeń, zdjęć wzorcowych i załączników PDF z kontrolą uprawnień (BR-33, `test_attachments.py`)
- [ ] Zły typ, za duży plik, test integracyjny z prawdziwym magazynem
**DoD:** kryteria §29 „Submissions” (zdjęcia).

## M10 — AuditLog i podglądy admina (STEP 16)
- [ ] Wpisy dla wszystkich akcji z `api.md` w transakcjach operacji
- [ ] `/admin/submissions`, `/admin/audit-logs`
- [ ] `test_audit.py`
**DoD:** kryteria §29 „Audit”.

## M11 — Domknięcie MVP backendu (STEP 17–18)
- [ ] Seed (`python -m app.seed`): admin, instruktor, uczestnik, osoba z kilkoma rolami, „Podstawy kowalstwa” wg Q-36 (lista `docs/assets/lista-zadan-sciezki.jpeg`, karty z `docs/assets/`)
- [ ] README (§33), zgodność `/openapi.json` z `api.md`
- [ ] Pełna regresja, przejście checklisty §29 punkt po punkcie
**DoD:** wszystkie kryteria §29 odhaczone na podstawie prawdziwych wyników testów.

## M11a — Staging na Proxmoxie (ADR-23)
- [ ] Wymaga: Proxmox VE 9 (Q-50), wolny RAM (Q-49), DNS `pspk.pl` w Cloudflare (Q-47), decyzja o kopiach (Q-46) — szczegóły w `docs/infrastructure.md`
- [ ] VM `pspk-staging` (Debian 13 + Docker), compose z `cloudflared`, tunel `akademia-staging.pspk.pl`, Cloudflare Access (Q-48)
- [ ] Skrypt wdrożenia, seed, test dymny z zewnątrz (telefon poza siecią wewnętrzną)
- [ ] Kopie zapasowe + test odtworzenia
**DoD:** API stagingu dostępne z internetu po HTTPS, tylko dla zespołu; odtworzenie z kopii sprawdzone.

## Później (po akceptacji MVP backendu, STEP 19)
- M12 — Panel WWW: React + TS (Q-30), podłączenie makiety do API, sesja wg ADR-26
- M13 — Android (Kotlin) z kompresją zdjęć po stronie urządzenia (ADR-28)
- Tematy z sekcji E w `open-questions.md`
