# Plan implementacji

Każdy etap przechodzi cykl z `docs/sdd-process.md`: spec delta → testy (czerwone) → kod → pełna regresja → raport → akceptacja.
Mapowanie na STEP z §35 specyfikacji podane w nawiasach. Zakres M1–M11 zostanie potwierdzony po fazie architektury.

## M0 — Specyfikacja i decyzje (STEP 1) ← JESTEŚMY TUTAJ
- [x] Analiza specyfikacji v1 i kart zadań
- [x] Dokumenty: business-rules, database, api, architecture, open-questions, plan
- [x] Decyzje PO dla reguł biznesowych (2026-10-03) i aktualizacja business-rules, database, api
- [x] **Faza architektury:** `architecture.md` przepisany (ADR-01…23, mapa blokad, odstępstwa od spec.), Q-34 → S3 + SeaweedFS
- [x] Hosting (Q-29): Proxmox, Cloudflare Tunnel, `pspk.pl` — wpisane do ADR-23
- [ ] Akceptacja architektury przez PO ← NASTĘPNY KROK
- [ ] Środowisko (Q-32, zmiana 2026-10-25): repozytorium GitHub z dokumentacją i `.claude/`, Claude GitHub App na repo, środowisko chmurowe Claude Code; lokalnie tylko Git
- [ ] Pełny program nauczania (Q-36) — nie blokuje do M11
**DoD:** wszystkie pytania blokujące M1–M3 mają status DECIDED/DEFAULT.

## M1 — Szkielet i infrastruktura (STEP 2–5)
- [ ] Struktura katalogów, `.gitignore`, `.env.example`, `git init`, `CLAUDE.md`
- [ ] `docker-compose.yml`: postgres, magazyn S3 (+ inicjalizacja bucketu, Q-34), backend; healthchecki; wolumeny
- [ ] `config.py` (pydantic-settings), `database.py` (async engine/sesja), `main.py`, `GET /health`
- [ ] `errors.py` — jednolity format błędów
- [ ] pytest + conftest z bazą testową
**DoD:** `docker compose up` startuje 3 usługi, `/health` = 200 (sprawdza DB), `/docs` działa, test dymny zielony.

## M2 — Modele i migracja 0001 (STEP 6–7)
- [ ] Wszystkie modele z `database.md`, w tym `user_roles`, `task_revisions`, `task_materials`, `task_revision_materials`, `refresh_tokens`
- [ ] Migracja 0001, indeksy częściowe, checki
- [ ] Testy ograniczeń DB (unikalności, jedna otwarta próba, jedno PASSED, limit pozycji zdjęć, brak samooceny)
**DoD:** `alembic upgrade head` i `downgrade base` przechodzą na czystej bazie.

## M3 — Uwierzytelnianie i konta (STEP 8)
- [ ] register (`PENDING_APPROVAL`) / login / refresh / logout / me / change-password, Argon2id, JWT
- [ ] wiele ról, dependencies `require_*`
- [ ] admin: użytkownicy, zatwierdzanie/odrzucanie, ustawienie hasła, dezaktywacja
- [ ] `test_auth.py`: FR-AUTH-01..07, BR-27, BR-28
**DoD:** kryteria §29 „Authentication”.

## M4 — Treść edukacyjna, rewizje i wersje (STEP 9)
- [ ] Admin: ścieżki, wersje (kopia z uprawnieniami, włączanie zapisów), etapy, zadania z rewizjami, zdjęcia wzorcowe (magazyn in-memory), kolejność, wyłączanie zadań
- [ ] `test_paths.py`, `test_revisions.py` (część admin), `test_structure.py` (część bez zgłoszeń): TEST 13, BR-16, BR-19, BR-24
**DoD:** kryteria §29 „Learning paths”.

## M5 — Zapisy i statusy zadań (STEP 10, 12)
- [ ] Admin: zapisy (utworzenie, lista, anulowanie); uczestnik: `/me/paths`, szczegóły, `/progress`, `/tasks/{id}` z widoczną rewizją
- [ ] `compute_task_statuses`, `get_previous_task`, `is_task_available`
- [ ] Testy jednostkowe statusów + TEST 1, TEST 2, przejście między etapami, zapis nieaktywny (Q-39)
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
- [ ] TEST 3, TEST 4, TEST 6, BR-07, BR-13, BR-15, `test_structure.py` (część ze zgłoszeniami), `test_enrollments.py` (BR-29)
**DoD:** kryteria §29 „Final pass”.

## M9 — Magazyn obiektów i pliki (STEP 15)
- [ ] Implementacja S3 (wg Q-34); walidacja po zawartości; usuwanie EXIF; kompensacja przy błędzie transakcji
- [ ] Endpointy pobierania zdjęć zgłoszeń i zdjęć wzorcowych z kontrolą uprawnień
- [ ] Zły typ, za duży plik, test integracyjny z prawdziwym magazynem
**DoD:** kryteria §29 „Submissions” (zdjęcia).

## M10 — AuditLog i podglądy admina (STEP 16)
- [ ] Wpisy dla wszystkich akcji z `api.md` w transakcjach operacji
- [ ] `/admin/submissions`, `/admin/audit-logs`
- [ ] `test_audit.py`
**DoD:** kryteria §29 „Audit”.

## M11 — Domknięcie MVP backendu (STEP 17–18)
- [ ] Seed (`python -m app.seed`): admin, instruktor, uczestnik, osoba z kilkoma rolami, „Podstawy kowalstwa” wg Q-36 (zadania z kart)
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
- M12 — Panel WWW (technologia: Q-30)
- M13 — Android z kompresją zdjęć po stronie urządzenia (Q-30)
- Tematy z sekcji E w `open-questions.md`
