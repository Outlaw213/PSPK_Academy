# Reguły biznesowe i wymagania

Źródło: `PSPK_Academy_specyfication_v1.txt` + decyzje PO z 2026-10-03. Odniesienia `Q-xx` → `docs/open-questions.md`.
Słowa kluczowe: **MUSI** = wymaganie twarde (test obowiązkowy).

## 1. Reguły biznesowe (BR)

| ID | Reguła | Źródło |
|---|---|---|
| BR-01 | Uczestnik MUSI widzieć wszystkie aktywne etapy i zadania wersji ścieżki, do której jest zapisany, każde ze statusem. Zadanie `LOCKED` jest widoczne, ale nie można go rozpocząć. Wyłączone zadania i etapy bez aktywnych zadań nie są pokazywane. | R1, Q-44 |
| BR-02 | Zadanie MUSI być `LOCKED`, dopóki poprzednie aktywne zadanie nie ma statusu `PASSED`. Kolejność: aktualne `Stage.position`, potem `Task.position`, przez granice etapów. | R2, §9 |
| BR-03 | Liczba prób jest nieograniczona. W kodzie nie istnieje `MAX_ATTEMPTS`. | R3 |
| BR-04 | Każda próba to osobny rekord `Submission`; nigdy nie jest nadpisywana ani usuwana. `attempt_number = max(istniejące dla task+user) + 1`, nadawany przy utworzeniu szkicu; pierwsza = 1. | R4, §10 |
| BR-05 | `PASSED` jest ostateczne: brak nowych prób, brak zmiany wyniku, brak ponownego otwarcia — także po zmianach treści lub kolejności ścieżki. | R5, §13, Q-06 |
| BR-06 | Zgłoszenie może przejąć (claim) tylko użytkownik z rolą INSTRUCTOR i uprawnieniem do zadania (BR-24). Claim jest atomowy: przy równoczesnych żądaniach wygrywa dokładnie jeden, pozostali dostają 409. | R6, §11, §25 |
| BR-07 | Ocenia wyłącznie instruktor przypisany do zgłoszenia, o ile nadal ma uprawnienie. Wynik: `PASSED` lub `NEEDS_IMPROVEMENT`; przy `NEEDS_IMPROVEMENT` komentarz jest wymagany (niepusty po przycięciu). Jedno Assessment na Submission. | R7, §12 |
| BR-08 | Zgłoszenie ma najwyżej `MAX_SUBMISSION_PHOTOS` (=10) zdjęć; dodanie 11. jest odrzucane i nic nie zostaje zapisane. | R8 |
| BR-09 | Backend waliduje każdy plik: typ MIME (jpeg/png/webp — weryfikowany po zawartości, nie po nagłówku), rozmiar ≤ `MAX_UPLOAD_SIZE_MB`, liczbę plików. | R9, §14 |
| BR-10 | Żaden automat (w tym AI) nie zmienia statusu na `PASSED`. Jedyna droga do `PASSED` to Assessment instruktora. | R10 |
| BR-11 | Backend decyduje o rolach, dostępie, zapisach, dostępności zadań, możliwości utworzenia i wysłania próby, claim, zwolnieniu i ocenie. | R11 |
| BR-12 | Uczestnik jest zapisany do konkretnej `PathVersion`; utworzenie nowej wersji nie zmienia jego zapisu ani historii. Zapis możliwy tylko do wersji aktywnej (`is_active`). Najwyżej jeden zapis `ACTIVE` na `LearningPath`. | §5, Q-06, Q-14 |
| BR-13 | `Submission.status = PASSED` nie może istnieć bez Assessment z `result = PASSED` (ta sama transakcja). | §24 |
| BR-14 | Najwyżej jedna otwarta próba (`DRAFT`/`SUBMITTED`/`UNDER_REVIEW`) na parę zadanie+uczestnik. | Q-10 |
| BR-15 | Zapis przechodzi na `COMPLETED`, gdy wszystkie aktywne zadania wersji są `PASSED` — sprawdzane przy ocenie PASSED i przy wyłączeniu zadania. Zapis `COMPLETED` pozostaje ukończony mimo późniejszych zmian ścieżki. | Q-15, Q-42, Q-06 |
| BR-16 | Admin może zawsze edytować treść i strukturę wersji (dodawać zadania i etapy, zmieniać kolejność, wyłączać zadania). Zaliczenia nigdy nie są cofane. Nowe zadanie jest obowiązkowe dla wszystkich zapisanych: staje się `AVAILABLE` dla każdego, kto zaliczył poprzednie, nawet jeśli jest już dalej w ścieżce. | Q-06 |
| BR-17 | Użytkownik nie widzi ani nie modyfikuje cudzych danych; zasób spoza jego zakresu → 404. | §29 Security |
| BR-18 | Kluczowe operacje zapisują `AuditLog` w tej samej transakcji co operacja. | §6, §29 |
| BR-19 | Każda edycja treści zadania (w tym listy zdjęć wzorcowych) tworzy nową, niezmienną rewizję. Zgłoszenie zapamiętuje rewizję z chwili wysłania. Przy zgłoszeniu (uczestnik i instruktor) oraz przy zadaniu zaliczonym widać rewizję z tego zgłoszenia; w pozostałych przypadkach — aktualną. | Q-06, Q-43 |
| BR-20 | Wyłączenie zadania usuwa je z kolejności i z widoku ścieżki; historia prób pozostaje dostępna. Niedozwolone, gdy zadanie ma zgłoszenia `SUBMITTED`/`UNDER_REVIEW` (409); otwarte szkice → `CANCELLED`. | Q-08, Q-44 |
| BR-21 | Próba zaczyna się jako szkic (`DRAFT`). W szkicu uczestnik dodaje i usuwa zdjęcia pojedynczo oraz edytuje komentarz. Wysłanie (`SUBMITTED`) wymaga: aktywnego zapisu, zadania niezablokowanego kolejnością i spełnienia BR-22. Po wysłaniu treść zgłoszenia jest niezmienna. | Q-03, Q-40 |
| BR-22 | Wymagania przy wysyłce: `PRACTICAL` ≥ 1 zdjęcie; `THEORY`/`QUIZ` niepusty komentarz lub ≥ 1 zdjęcie. Typ zadania z aktualnej rewizji. | Q-18 |
| BR-23 | Uczestnik może porzucić szkic albo wycofać wysłane zgłoszenie przed claim → `CANCELLED` (zostaje w historii). Po claim — nie. | Q-11 |
| BR-24 | Uprawnienie instruktora do wersji ścieżki obejmuje wszystkie jej etapy; uprawnienie do etapu — tylko ten etap; obowiązuje suma. Kopia wersji kopiuje uprawnienia (etapowe mapowane na nowe etapy). | Q-13 |
| BR-25 | Nikt nie przejmuje ani nie ocenia własnego zgłoszenia. | Q-16 |
| BR-26 | Zwolnienie: przypisany instruktor albo ADMIN → zgłoszenie wraca do `SUBMITTED`, instruktor odpięty. Automatycznie, gdy instruktor traci możliwość oceny (odebrane uprawnienie, rola INSTRUCTOR lub dezaktywacja konta). | Q-12, Q-41 |
| BR-27 | Użytkownik może mieć kilka ról (`PARTICIPANT`, `INSTRUCTOR`, `ADMIN`); dostęp wynika z sumy ról. Ocena wymaga roli `INSTRUCTOR` + uprawnienia — sama rola `ADMIN` nie wystarcza. Zapis na ścieżkę wymaga roli `PARTICIPANT`. | Q-16, Q-17 |
| BR-28 | Rejestracja tworzy konto `PENDING_APPROVAL` z rolą `PARTICIPANT`; logowanie niemożliwe do akceptacji admina. Admin zatwierdza (`ACTIVE`) albo odrzuca (`REJECTED` — konto zostaje, e-mail pozostaje zajęty). Konta zakładane przez admina są od razu `ACTIVE`. Konto `DEACTIVATED` traci dostęp natychmiast, także z ważnym tokenem. | Q-21, Q-22 |
| BR-29 | Anulowanie zapisu przez admina → otwarte próby tego zapisu (`DRAFT`/`SUBMITTED`/`UNDER_REVIEW`) → `CANCELLED`; historia dostępna tylko do odczytu. | Q-35 |

## 2. Wyliczanie statusu zadania (jedno miejsce: `task_service`)

Wejście: zapis uczestnika `E` do wersji `V`; aktywne zadania `T1..Tn` uporządkowane po `(stage.position, task.position)`.
Dla każdego `Ti`: `latest(Ti)` = zgłoszenie o najwyższym `attempt_number` z pominięciem `CANCELLED`; `passed(Ti)` = istnieje zgłoszenie `PASSED`.

```
jeśli passed(Ti)                                   → PASSED
inaczej jeśli latest(Ti).status = DRAFT            → IN_PROGRESS
inaczej jeśli latest(Ti).status = SUBMITTED        → SUBMITTED
inaczej jeśli latest(Ti).status = UNDER_REVIEW     → UNDER_REVIEW
inaczej jeśli E.status ≠ ACTIVE                    → LOCKED          (Q-39)
inaczej jeśli i > 1 i nie passed(Ti-1)             → LOCKED
inaczej jeśli latest(Ti).status = NEEDS_IMPROVEMENT → NEEDS_IMPROVEMENT
inaczej                                            → AVAILABLE
```

Otwarta próba ma pierwszeństwo w wyświetlaniu przed blokadą kolejności (Q-40), ale nie zmienia reguł działania:

| Operacja | Warunek |
|---|---|
| Utworzenie szkicu | `E.status = ACTIVE`, zadanie aktywne i w `V`, status ∈ {`AVAILABLE`, `NEEDS_IMPROVEMENT`} |
| Wysłanie szkicu | `E.status = ACTIVE`, zadanie aktywne, `i = 1` lub `passed(Ti-1)`, BR-22 |
| Claim / ocena zgłoszenia | niezależne od blokady kolejności (zgłoszenie już wysłane) |

Widoczna rewizja zadania (BR-19): rewizja zgłoszenia `PASSED`, jeśli istnieje; inaczej aktualna.
Jedna funkcja liczy statusy całej ścieżki stałą liczbą zapytań (bez N+1); `is_task_available()`, `get_previous_task()` i `/progress` z niej korzystają.

## 3. Wymagania funkcjonalne (FR)

### Auth
- FR-AUTH-01 Rejestracja: e-mail unikalny bez rozróżniania wielkości liter, hasło ≥ 10 znaków (Argon2id). Konto `PENDING_APPROVAL`, rola `PARTICIPANT`, bez tokenów. Zajęty e-mail → `EMAIL_ALREADY_EXISTS` 409.
- FR-AUTH-02 Logowanie zwraca access + refresh token. Złe dane → `INVALID_CREDENTIALS` 401 (bez ujawniania, które pole jest złe). Konto oczekujące → `ACCOUNT_PENDING_APPROVAL` 403; odrzucone lub dezaktywowane → `ACCOUNT_INACTIVE` 403.
- FR-AUTH-03 Odświeżanie tokenu i wylogowanie (unieważnienie sesji).
- FR-AUTH-04 `GET /auth/me` zwraca id, e-mail, imię, nazwisko, listę ról.
- FR-AUTH-05 Konto inne niż `ACTIVE` nie używa ważnego tokenu → 403 `ACCOUNT_INACTIVE`.
- FR-AUTH-06 Dependencies: `require_authenticated_user`, `require_role`, `require_admin`, `require_instructor`, `require_participant` (sprawdzają przynależność roli do zbioru ról użytkownika).
- FR-AUTH-07 Zmiana własnego hasła (podanie obecnego); unieważnia pozostałe sesje. (Q-38)

### Admin
- FR-ADM-01 Użytkownicy: lista z filtrami (w tym `PENDING_APPROVAL`), utworzenie (od razu `ACTIVE`, z rolami), edycja danych i ról, dezaktywacja/reaktywacja, zatwierdzenie/odrzucenie rejestracji, ustawienie nowego hasła (unieważnia sesje). Bez usuwania kont.
- FR-ADM-02 Ścieżki, wersje (pusta lub kopia — BR-24, Q-07; aktywacja/dezaktywacja zapisów), etapy, zadania (każda edycja = nowa rewizja), zdjęcia wzorcowe, zmiana kolejności, wyłączanie/włączanie zadań (BR-20).
- FR-ADM-03 Zapisy: utworzenie (`PATH_ASSIGNED`), lista z filtrami, anulowanie (BR-29).
- FR-ADM-04 Uprawnienia instruktorów: nadanie (wersja lub etap), lista, odebranie (BR-26 — automatyczne zwolnienie).
- FR-ADM-05 Podgląd zgłoszeń i ocen wszystkich uczestników z filtrami (ścieżka/wersja, status, uczestnik, instruktor). Tylko odczyt.
- FR-ADM-06 Podgląd AuditLogu z filtrami (akcja, użytkownik, encja, zakres dat). Tylko odczyt.
- FR-ADM-07 Zwolnienie dowolnego przejętego zgłoszenia (BR-26).

### Uczestnik
- FR-PAR-01 Lista własnych zapisów; szczegóły wersji; postęp (§17).
- FR-PAR-02 Szczegóły zadania z wyliczonym statusem i widoczną rewizją (BR-19), w tym zdjęcia wzorcowe.
- FR-PAR-03 Szkic: utworzenie, edycja komentarza, dodawanie/usuwanie zdjęć, wysłanie, porzucenie (BR-21–BR-23).
- FR-PAR-04 Wycofanie wysłanego zgłoszenia przed claim (BR-23).
- FR-PAR-05 Historia prób zadania i szczegóły zgłoszenia z oceną i rewizją zadania.

### Instruktor
- FR-INS-01 Kolejka: zgłoszenia `SUBMITTED` w zakresie uprawnień (bez własnych) + zgłoszenia przejęte przez siebie.
- FR-INS-02 Szczegóły zgłoszenia z rewizją zadania i historią poprzednich prób uczestnika dla tego zadania.
- FR-INS-03 Claim (§11, BR-06, BR-25).
- FR-INS-04 Ocena (§12, BR-07).
- FR-INS-05 Zwolnienie przejętego zgłoszenia (BR-26).

## 4. Wymagania niefunkcjonalne (NFR)
- NFR-01 Jednolity format błędów: `{"error": {"code", "message", "details?"}}`, również dla 401/404/422.
- NFR-02 Logi bez haseł, tokenów i sekretów.
- NFR-03 Konfiguracja przez ENV (`.env.example`), brak sekretów w repo.
- NFR-04 Schemat wyłącznie przez Alembic; brak `create_all()` poza testami.
- NFR-05 `/docs` i `/openapi.json` zgodne z implementacją.
- NFR-06 Binaria w magazynie obiektów (S3/MinIO — Q-34), w PostgreSQL tylko metadane i `storage_key`.
- NFR-07 Interfejs po polsku; kody błędów API stabilne, po angielsku (Q-31).

## 5. Pokrycie testami (wymaganie → test)

| Test | Plik | Wymagania |
|---|---|---|
| TEST 1 pierwsze zadanie AVAILABLE | `test_tasks.py` | BR-01, BR-02 |
| TEST 2 kolejne LOCKED | `test_tasks.py` | BR-02 |
| TEST 3 zaliczenie odblokowuje | `test_assessment.py` | BR-02, BR-05 |
| TEST 4 NEEDS_IMPROVEMENT nie odblokowuje | `test_assessment.py` | BR-02, BR-07 |
| TEST 5 20 prób | `test_submissions.py` | BR-03, BR-04 |
| TEST 6 brak próby po PASSED | `test_submissions.py` | BR-05 |
| TEST 7 historia 5 prób | `test_submissions.py` | BR-04 |
| TEST 8 10 zdjęć w szkicu OK | `test_photos.py` | BR-08 |
| TEST 9 11. zdjęcie odrzucone | `test_photos.py` | BR-08 |
| TEST 10 claim — drugi instruktor 409 | `test_claim.py` | BR-06 |
| TEST 11 instruktor bez uprawnień | `test_claim.py` | BR-06, BR-24 |
| TEST 12 obejście API (szkic dla zadania LOCKED) | `test_submissions.py` | BR-02, BR-11 |
| TEST 13 wersja ścieżki | `test_paths.py` | BR-12 |
| + race: równoległy claim (PostgreSQL) | `test_claim.py` | BR-06 |
| + przejście między etapami | `test_tasks.py` | BR-02 |
| + komentarz wymagany | `test_assessment.py` | BR-07 |
| + PASSED zawsze z Assessment | `test_assessment.py` | BR-13 |
| + druga otwarta próba odrzucona | `test_submissions.py` | BR-14 |
| + cudze zgłoszenie → 404 | `test_security.py` | BR-17 |
| + wpisy AuditLog | `test_audit.py` | BR-18 |
| + edycja zadania po zaliczeniu: zaliczający widzi starą rewizję, nowy uczestnik nową | `test_revisions.py` | BR-19 |
| + zgłoszenie oceniane wg rewizji z chwili wysłania | `test_revisions.py` | BR-19 |
| + nowe zadanie w środku: AVAILABLE dla tych, którzy są dalej; zaliczenia zostają | `test_structure.py` | BR-16, BR-05 |
| + zmiana kolejności nie cofa zaliczeń | `test_structure.py` | BR-16 |
| + wyłączenie zadania z oczekującym zgłoszeniem → 409; szkice anulowane | `test_structure.py` | BR-20 |
| + wyłączenie ostatniego niezaliczonego zadania kończy ścieżkę | `test_structure.py` | BR-15 |
| + szkic: dodawanie/usuwanie zdjęć, wysyłka, edycja po wysłaniu → 409 | `test_submissions.py` | BR-21 |
| + wymagania wysyłki wg typu zadania | `test_submissions.py` | BR-22 |
| + wycofanie przed claim OK, po claim 409 | `test_submissions.py` | BR-23 |
| + kopia wersji kopiuje uprawnienia | `test_paths.py` | BR-24 |
| + claim/ocena własnego zgłoszenia → 403 | `test_claim.py` | BR-25 |
| + release ręczny i automatyczny (odebranie uprawnienia) | `test_claim.py` | BR-26 |
| + wiele ról; ADMIN bez INSTRUCTOR nie ocenia | `test_auth.py` | BR-27 |
| + rejestracja oczekująca → login 403; zatwierdzenie → login OK | `test_auth.py` | BR-28 |
| + anulowanie zapisu anuluje otwarte próby | `test_enrollments.py` | BR-29 |
