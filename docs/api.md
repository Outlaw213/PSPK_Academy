# Kontrakt API v1

Prefix `/api/v1`. Autoryzacja: `Authorization: Bearer <access_token>`. **[+]** = rozszerzenie spoza spec. v1, zatwierdzone decyzjami PO.
Zasób spoza zakresu użytkownika zwraca **404**, nie 403 (nie ujawniamy istnienia, BR-17). Wyjątek: instruktor bez uprawnień przy claim/ocenie dostaje 403 `INSTRUCTOR_NOT_AUTHORIZED` (wymóg TEST 11).
Role sprawdzane jako przynależność do zbioru ról użytkownika (BR-27).

## Endpointy

### Serwis (bez prefiksu, publiczne)
| Metoda | Ścieżka | Wynik | Błędy |
|---|---|---|---|
| GET | /health | 200 `{"status": "ok", "database": "ok"}` — sprawdza połączenie z bazą | 503 DATABASE_UNAVAILABLE |

### Auth (publiczne poza `/me`, `/logout`, `/change-password`)
| Metoda | Ścieżka | Wynik | Błędy |
|---|---|---|---|
| POST | /auth/register | 201 user (`PENDING_APPROVAL`), bez tokenów | 409 EMAIL_ALREADY_EXISTS, 422 |
| POST | /auth/login | 200 tokens | 401 INVALID_CREDENTIALS, 403 ACCOUNT_PENDING_APPROVAL, 403 ACCOUNT_INACTIVE |
| POST | /auth/refresh | 200 tokens | 401 INVALID_TOKEN, 403 ACCOUNT_INACTIVE |
| POST | **[+]** /auth/logout | 204 | — |
| POST | **[+]** /auth/change-password | 200 nowy `access_token` dla bieżącej sesji (`current_password`, `new_password`); pozostałe sesje unieważnione (Q-38) | 401 INVALID_CREDENTIALS, 422 |
| GET | /auth/me | 200 user + `roles[]` | 401 |

**Tokeny** (ADR-09, ADR-19, ADR-26). `login` i `refresh` zwracają `{access_token, token_type: "bearer", expires_in, refresh_token}`.
Klient przeglądarkowy wysyła nagłówek `X-Client: web`. Wtedy `refresh_token` nie trafia do ciała odpowiedzi, tylko do ciasteczka `pspk_refresh` (`HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`).
`refresh` i `logout` przyjmują token z ciała (`{"refresh_token": "…"}`) albo z tego ciasteczka. Każde odświeżenie wydaje nowy refresh token i zużywa poprzedni. Ponowne użycie zużytego tokenu unieważnia całą sesję (rodzinę) → 401 INVALID_TOKEN.

### Uczestnik (`PARTICIPANT`)
| Metoda | Ścieżka | Wynik | Błędy |
|---|---|---|---|
| GET | /me | 200 profil | |
| GET | /me/paths | 200 lista zapisów | |
| GET | /me/paths/{path_version_id} | 200 wersja + etapy + zadania (bez statusów) | 404 |
| GET | /me/paths/{path_version_id}/progress | 200 struktura z §17 (nazwy wg widocznej rewizji, każde zadanie z `label`, np. `"E1.2"` — BR-34) | 404 |
| GET | /tasks/{task_id} | 200 zadanie: widoczna rewizja (BR-19) + `status` + zdjęcia wzorcowe + **[+]** `content_md`, załączniki, pytania quizu (bez `is_correct` przed zaliczeniem) | 404 |
| GET | **[+]** /tasks/{task_id}/attachments/{attachment_id} | 200 PDF (stream); uczestnik zapisany na wersję, instruktor z uprawnieniem, admin | 404 |
| POST | **[+]** /tasks/{task_id}/quiz-attempts | 201 submission + assessment z `score` (`answers: [{question_id, option_ids[]}]`) | 403 NO_ACTIVE_ENROLLMENT, 409 TASK_LOCKED, 409 TASK_ALREADY_PASSED, 409 TASK_NOT_QUIZ, 422 QUIZ_ANSWERS_INVALID |
| GET | **[+]** /tasks/{task_id}/materials/{material_id} | 200 obraz `image/webp` (stream); dostęp jak przy załącznikach | 404 |
| GET | /tasks/{task_id}/submissions | 200 historia prób (z ocenami) | 404 |
| POST | /tasks/{task_id}/submissions | 201 szkic `DRAFT` (JSON: `comment?`) | 403 NO_ACTIVE_ENROLLMENT, 409 TASK_LOCKED, 409 TASK_ALREADY_PASSED, 409 SUBMISSION_PENDING, 409 TASK_IS_COURSE, 409 TASK_IS_QUIZ |
| GET | /submissions/{submission_id} | 200 zgłoszenie + zdjęcia + ocena + rewizja zadania | 404 |
| PATCH | **[+]** /submissions/{id} | 200 (`comment`) — tylko `DRAFT` | 409 INVALID_STATE_TRANSITION |
| POST | **[+]** /submissions/{id}/photos | 201 zdjęcie (multipart, 1 plik) — tylko `DRAFT` | 409 INVALID_STATE_TRANSITION, 422 TOO_MANY_PHOTOS, 422 INVALID_PHOTO_TYPE, 413 PHOTO_TOO_LARGE |
| DELETE | **[+]** /submissions/{id}/photos/{photo_id} | 204 — tylko `DRAFT` | 409 INVALID_STATE_TRANSITION |
| POST | **[+]** /submissions/{id}/submit | 200 `SUBMITTED` | 403 NO_ACTIVE_ENROLLMENT, 409 TASK_LOCKED, 409 INVALID_STATE_TRANSITION, 422 SUBMISSION_REQUIREMENTS_NOT_MET |
| POST | **[+]** /submissions/{id}/cancel | 200 `CANCELLED` — z `DRAFT` lub `SUBMITTED` | 409 INVALID_STATE_TRANSITION, 409 SUBMISSION_ALREADY_CLAIMED |
| GET | **[+]** /submissions/{id}/photos/{photo_id} | 200 obraz (stream) — także dla instruktora z uprawnieniem i admina | 404 |

### Instruktor (`INSTRUCTOR` + uprawnienie)
| Metoda | Ścieżka | Wynik | Błędy |
|---|---|---|---|
| GET | /instructor/submissions?status=&path_version_id= | 200 kolejka (FR-INS-01, bez własnych zgłoszeń) | |
| GET | /instructor/submissions/{id} | 200 + rewizja zadania + historia prób uczestnika | 404 |
| POST | /submissions/{id}/claim | 200 `UNDER_REVIEW` | 403 INSTRUCTOR_NOT_AUTHORIZED, 403 SELF_ASSESSMENT_FORBIDDEN, 409 SUBMISSION_ALREADY_CLAIMED, 409 INVALID_STATE_TRANSITION |
| POST | /submissions/{id}/assessment | 201 assessment (`result`, `comment`) | 403 NOT_ASSIGNED_INSTRUCTOR, 403 INSTRUCTOR_NOT_AUTHORIZED, 409 INVALID_STATE_TRANSITION, 422 ASSESSMENT_COMMENT_REQUIRED |
| POST | **[+]** /submissions/{id}/release | 200 `SUBMITTED` — przypisany instruktor lub ADMIN | 403 NOT_ASSIGNED_INSTRUCTOR, 409 INVALID_STATE_TRANSITION |
| GET | **[+]** /instructor/courses?path_version_id= | 200 kursy w zakresie uprawnień | |
| GET | **[+]** /instructor/courses/{task_id}/participants | 200 uczestnicy z aktywnym zapisem + status kursu (FR-INS-06) | 403 INSTRUCTOR_NOT_AUTHORIZED, 404 |
| POST | **[+]** /instructor/courses/{task_id}/results | 201 submission + assessment (`user_id`, `result`, `comment`; zdjęcia potem przez `/submissions/{id}/photos` instruktora) | 403 INSTRUCTOR_NOT_AUTHORIZED, 403 SELF_ASSESSMENT_FORBIDDEN, 403 NO_ACTIVE_ENROLLMENT, 409 TASK_LOCKED, 409 TASK_ALREADY_PASSED, 422 ASSESSMENT_COMMENT_REQUIRED |

### Admin (`ADMIN`)
| Metoda | Ścieżka | Uwagi |
|---|---|---|
| GET / POST | /admin/users | lista z filtrami (`status`, `role`, `q` — e-mail lub imię i nazwisko), odpowiedź `{items, total, limit, offset}`; utworzenie: od razu `ACTIVE`, z rolami |
| PUT | /admin/users/{user_id} | dane, role, `status` (`ACTIVE`/`DEACTIVATED`); dezaktywacja/odebranie roli INSTRUCTOR → automatyczny release (BR-26) |
| POST | **[+]** /admin/users/{user_id}/approve, /reject | tylko z `PENDING_APPROVAL` → 409 INVALID_STATE_TRANSITION |
| POST | **[+]** /admin/users/{user_id}/password | nowe hasło; unieważnia sesje użytkownika |
| GET / POST | /admin/paths | |
| GET | **[+]** /admin/paths/{path_id} | ścieżka + lista wersji |
| POST | /admin/paths/{path_id}/versions | **[+]** `copy_from_version_id` (Q-07, kopiuje też uprawnienia — BR-24) |
| GET | /admin/path-versions/{version_id} | pełna struktura (z zadaniami wyłączonymi) |
| PUT | **[+]** /admin/path-versions/{version_id} | `description`, `is_active` (przyjmowanie zapisów) |
| POST / PUT | /admin/stages, /admin/stages/{id} | |
| POST / PUT | /admin/tasks, /admin/tasks/{id} | każdy zapis treści tworzy nową rewizję (BR-19); `materials[{id, caption}]` i `attachments[{id, title}]` = uporządkowane listy zdjęć wzorcowych i PDF (pominięte = bez zmian) |
| GET | **[+]** /admin/tasks/{id}/revisions | historia rewizji |
| POST | **[+]** /admin/tasks/{id}/materials | upload zdjęcia wzorcowego (multipart `file`, `caption?`) → 201 zadanie z nową wersją treści (zdjęcie dopisane na koniec) → 413 PHOTO_TOO_LARGE, 422 INVALID_PHOTO_TYPE |
| POST | **[+]** /admin/tasks/{id}/attachments | upload PDF (multipart `file`, `title?`) → 201 zadanie z nową wersją treści (PDF dopisany na koniec) → 413 ATTACHMENT_TOO_LARGE, 422 INVALID_ATTACHMENT_TYPE |
| PUT | **[+]** /admin/tasks/{id}/stage | przeniesienie zadania do innego etapu tej samej wersji (na koniec) |
| POST | **[+]** /admin/tasks/{id}/deactivate, /activate | BR-20 → 409 TASK_HAS_PENDING_SUBMISSIONS |
| PUT | **[+]** /admin/stages/{id}/tasks/order, /admin/path-versions/{id}/stages/order | zmiana kolejności całej listy w jednej transakcji (BR-16) |
| GET / POST | /admin/enrollments | lista z filtrami (`path_version_id`, `user_id`, `status`); utworzenie → 201 (albo 200 przy reaktywacji anulowanego zapisu, Q-45), 409 ALREADY_ENROLLED, 409 PATH_VERSION_INACTIVE, 422 USER_NOT_PARTICIPANT |
| POST | **[+]** /admin/enrollments/{id}/cancel | BR-29 |
| GET / POST | /admin/instructor-permissions | lista z filtrami; nadanie `{instructor_id, path_version_id \| stage_id}` → 422 USER_NOT_INSTRUCTOR |
| DELETE | **[+]** /admin/instructor-permissions/{id} | odebranie + automatyczny release (BR-26) |
| GET | **[+]** /admin/submissions, /admin/submissions/{id} | podgląd (FR-ADM-05), filtry: `path_version_id`, `status`, `user_id`, `instructor_id` |
| GET | **[+]** /admin/audit-logs | podgląd (FR-ADM-06), filtry: `action`, `user_id`, `entity_type`, `entity_id`, `from`, `to`; paginacja |

Listy są stronicowane (`limit`, `offset`) i zwracają `{items, total, limit, offset}`.

**Treść zadania** (M4). `POST /admin/tasks`: `{stage_id, position?}` + treść; bez `position` zadanie trafia na koniec etapu; powstaje zadanie i jego wersja treści 1.
`PUT /admin/tasks/{id}`: pełna treść — `name`, `task_type`, `description`, `instructions`, `content_md`, `assignment`, `evaluation_criteria`, `submission_requirements`, `material`, `quantity_description`, `expected_duration_days`, `estimated_minutes`, `difficulty`, `pass_threshold`, `questions[{text, kind, options[{text, is_correct}]}]`, `video_links[{title, url}]`, **[M9]** `materials[{id, caption}]`, `attachments[{id, title}]`. Każdy zapis tworzy nową wersję treści; zapis identyczny z aktualną → 200 bez nowej wersji. Pytania zapisywane tylko dla `QUIZ`.
`GET /admin/path-versions/{id}`: wersja + etapy (po `position`) → zadania z `label` (BR-34), `is_active`, `position` i aktualną wersją treści.
Kolejność: `PUT …/order` z `{"ids": [...]}` — pełna lista id w nowej kolejności; inna zawartość → 422 ORDER_MISMATCH.
`PUT /admin/tasks/{id}/stage`: `{stage_id}` — na koniec wskazanego etapu tej samej wersji; inny → 422 STAGE_OUTSIDE_VERSION.
**Pliki zadań** (M9). Wgranie zdjęcia wzorcowego albo PDF od razu tworzy nową wersję treści z plikiem dopisanym na koniec listy — plik jest częścią wersji treści (BR-19, Q-43) i nie istnieje „luzem”. Zdjęcie przechodzi tę samą obróbkę co zdjęcia zgłoszeń (ADR-25, WebP — Q-67); PDF jest sprawdzany po zawartości (nagłówek `%PDF-` i znacznik `%%EOF`) i zapisywany bez zmian.
Kolejność, podpisy, tytuły i usuwanie z wersji treści: `PUT /admin/tasks/{id}` z `materials[{id, caption}]` i `attachments[{id, title}]` (id z bieżącej albo wcześniejszej wersji treści tego zadania; inne → 422 UNKNOWN_FILE). Brak pola = listy bez zmian. Pliki nie są usuwane z dysku — starsze wersje treści i zaliczone zadania dalej je pokazują.
W wersji treści: `materials[{id, position, caption, mime_type, file_size, width, height}]`, `attachments[{id, position, title, file_size}]` (PDF); linki do filmów jak dotąd w `video_links`.
Pobieranie (`/tasks/{id}/materials/{mid}`, `/tasks/{id}/attachments/{aid}`): admin, instruktor z uprawnieniem do etapu, uczestnik z zapisem na tę wersję (także zakończonym — historia, BR-20); pozostali → 404. Kopia wersji ścieżki (Q-07) przenosi pliki (te same pliki na dysku).

**Zgłoszenia uczestnika** (M6). Zgłoszenie: `{id, task_id, attempt_number, status, comment, task_revision_id, submitted_at, claimed_at, assessed_at, cancelled_at, created_at, photos[{id, position, mime_type, file_size, width, height}], assessment{result, comment, score, instructor{first_name, last_name} | null, created_at} | null}`; `GET /submissions/{id}` dodatkowo `revision` (jak w `/tasks/{id}`, gdy wysłane).
Zdjęcie: `multipart/form-data`, pole `file`, jedno na żądanie; zapisywane po przetworzeniu (ADR-25), odczyt `GET /submissions/{id}/photos/{photo_id}` (`image/webp`).
Quiz: `POST /tasks/{id}/quiz-attempts` `{answers: [{question_id, option_ids: [...]}]}` → 201 `{submission, score, correct, total, passed, review}`; `review` (poprawne odpowiedzi) tylko przy zaliczeniu, inaczej `null` (BR-32).

**Instruktor** (M7). Zasięg = suma uprawnień do wersji i do etapów (BR-24), bez własnych zgłoszeń (BR-25).
Kolejka `GET /instructor/submissions?status=&path_version_id=`: `[{submission, participant{id, first_name, last_name}, task{id, label, name, task_type}, stage{id, name, position}, path{id, name, version}, photo_count}]` — `SUBMITTED` w zasięgu + `UNDER_REVIEW` przejęte przez siebie; najstarsze najpierw.
Szczegóły `GET /instructor/submissions/{id}`: `{submission, participant, task, stage, path, revision (pełna, z kryteriami), previous_attempts[]}`; spoza zasięgu → 404.
Uprawnienie `POST /admin/instructor-permissions`: dokładnie jedno z `path_version_id` / `stage_id` (inaczej 422 VALIDATION_ERROR); duplikat → 409 PERMISSION_EXISTS.
`GET /submissions/{id}/photos/{photo_id}`: właściciel, instruktor z uprawnieniem do zadania albo admin; inni → 404.

**Ocena i kursy** (M8). `POST /submissions/{id}/assessment` `{result: PASSED|NEEDS_IMPROVEMENT, comment}` → 201 `{submission}` (z oceną). Kolejność sprawdzeń: zgłoszenie istnieje (404) → rola i uprawnienie (403 INSTRUCTOR_NOT_AUTHORIZED / SELF_ASSESSMENT_FORBIDDEN) → stan `UNDER_REVIEW` (409) → przypisany instruktor (403 NOT_ASSIGNED_INSTRUCTOR) → komentarz (422). Ocena jest jedna i ostateczna.
Kursy: `GET /instructor/courses?path_version_id=` → `[{task{id, label, name}, stage, path, enrolled, passed}]`; `GET /instructor/courses/{task_id}/participants` → `[{participant, enrollment_id, status, attempts}]` dla aktywnych zapisów wersji (`status` jak w widoku uczestnika); `POST /instructor/courses/{task_id}/results` `{user_id, result, comment}` → 201 `{submission}`. Zadanie inne niż kurs → 409 TASK_NOT_COURSE.

**Widok uczestnika** (M5). `GET /me/paths/{path_version_id}/progress`:
`{path: {id, name, version}, enrollment_status, progress: {completed, total}, stages: [{id, name, position, gate_open, tasks: [{id, label, name, task_type, position, status}]}]}` — tylko aktywne zadania, etapy bez aktywnych zadań pominięte (BR-01). Kolejność i typy dokładnie takie, jak ustawił admin.
`GET /tasks/{task_id}`: `{id, label, stage: {id, name, position}, status, revision}` — `revision` jak w API admina, ale pytania quizu **bez** `is_correct` (BR-32). Zadanie wyłączone albo spoza zapisów użytkownika → 404.
`GET /me/paths`: lista zapisów `{id, status, enrolled_at, completed_at, path: {id, name, version}, path_version_id, progress}`.
`POST /admin/enrollments` `{user_id, path_version_id}` → 201 zapis; ponowny zapis do wersji z anulowanym zapisem → 200 i ten sam zapis znów `ACTIVE` (Q-45).

## Katalog błędów

| Kod | HTTP | Kiedy |
|---|---|---|
| VALIDATION_ERROR | 422 | błąd schematu żądania (w tym hasło < 10 znaków) |
| UNAUTHENTICATED / INVALID_TOKEN | 401 | brak lub zły token |
| INVALID_CREDENTIALS | 401 | złe dane logowania lub obecne hasło |
| ACCOUNT_PENDING_APPROVAL | 403 | konto czeka na akceptację admina |
| ACCOUNT_INACTIVE | 403 | konto odrzucone lub dezaktywowane |
| FORBIDDEN | 403 | brak wymaganej roli |
| NOT_FOUND | 404 | brak zasobu lub poza zakresem |
| EMAIL_ALREADY_EXISTS | 409 | |
| CANNOT_MODIFY_SELF | 409 | admin próbuje dezaktywować siebie albo odebrać sobie rolę ADMIN (zabezpieczenie przed odcięciem dostępu) |
| NO_ACTIVE_ENROLLMENT | 403 | |
| TASK_LOCKED | 409 | poprzednie zadanie niezaliczone |
| TASK_ALREADY_PASSED | 409 | |
| SUBMISSION_PENDING | 409 | istnieje otwarta próba (szkic/wysłana/w ocenie) |
| SUBMISSION_REQUIREMENTS_NOT_MET | 422 | wysyłka bez wymaganych zdjęć/komentarza (BR-22) |
| SUBMISSION_ALREADY_CLAIMED | 409 | |
| INSTRUCTOR_NOT_AUTHORIZED | 403 | brak uprawnień do ścieżki/etapu |
| SELF_ASSESSMENT_FORBIDDEN | 403 | claim/ocena własnego zgłoszenia |
| NOT_ASSIGNED_INSTRUCTOR | 403 | ocenia/zwalnia ktoś inny niż przejmujący (i nie ADMIN przy release) |
| INVALID_STATE_TRANSITION | 409 | przejście niedozwolone w maszynie stanów (także edycja zgłoszenia poza `DRAFT`) |
| ASSESSMENT_COMMENT_REQUIRED | 422 | |
| TOO_MANY_PHOTOS | 422 | > MAX_SUBMISSION_PHOTOS |
| INVALID_PHOTO_TYPE | 422 | niedozwolony typ (sprawdzany po zawartości) |
| PHOTO_TOO_LARGE | 413 | > MAX_UPLOAD_SIZE_MB |
| ORDER_MISMATCH | 422 | lista w `…/order` nie zawiera dokładnie elementów porządkowanego zbioru |
| STAGE_OUTSIDE_VERSION | 422 | przeniesienie zadania do etapu innej wersji |
| TASK_HAS_PENDING_SUBMISSIONS | 409 | wyłączenie zadania z oczekującymi zgłoszeniami |
| PATH_VERSION_INACTIVE | 409 | zapis do wersji nieprzyjmującej zapisów |
| ALREADY_ENROLLED | 409 | zapis do tej wersji istnieje albo aktywny zapis do innej wersji tej ścieżki |
| USER_NOT_PARTICIPANT | 422 | zapis użytkownika bez roli PARTICIPANT |
| USER_NOT_INSTRUCTOR | 422 | uprawnienie dla użytkownika bez roli INSTRUCTOR |
| TASK_IS_QUIZ | 409 | szkic dla quizu — quiz rozwiązuje się przez `/quiz-attempts` (BR-32) |
| TASK_NOT_QUIZ | 409 | `/quiz-attempts` dla zadania innego typu |
| QUIZ_ANSWERS_INVALID | 422 | brak odpowiedzi na pytanie, nieznana opcja, kilka opcji przy `SINGLE` |
| QUIZ_INVALID | 422 | quiz bez pytań, pytanie bez poprawnej odpowiedzi, próg poza 1–100 |
| ATTACHMENT_TOO_LARGE | 413 | > MAX_ATTACHMENT_SIZE_MB |
| INVALID_ATTACHMENT_TYPE | 422 | plik inny niż PDF (po zawartości) |
| UNKNOWN_FILE | 422 | `materials` / `attachments` w treści zadania wskazują plik spoza tego zadania albo powtórzony |
| TASK_NOT_COURSE | 409 | wynik kursu dla zadania, które nie jest kursem |
| TASK_IS_COURSE | 409 | uczestnik próbuje utworzyć zgłoszenie dla kursu (BR-30) |
| DATABASE_UNAVAILABLE | 503 | `/health`: brak połączenia z bazą |
| INTERNAL_ERROR | 500 | nieobsłużony błąd — bez szczegółów w odpowiedzi (NFR-02) |
| PERMISSION_EXISTS | 409 | takie uprawnienie instruktora już istnieje |
| CONCURRENT_UPDATE | 409 | wykryte zakleszczenie przy równoległych operacjach — klient może ponowić (ADR-10) |

Format: `{"error": {"code": "TASK_LOCKED", "message": "Task is locked until the previous task is passed.", "details": null}}`

## AuditLog — akcje

`USER_REGISTERED`, `USER_APPROVED`, `USER_REJECTED`, `USER_CREATED`, `USER_UPDATED`, `USER_PASSWORD_RESET`, `USER_PASSWORD_CHANGED`, `USER_LOGIN`,
`PATH_CREATED`, `PATH_VERSION_CREATED`, `PATH_VERSION_UPDATED`, `STAGE_CREATED`, `STAGE_UPDATED`, `TASK_CREATED`, `TASK_UPDATED` (nowa rewizja), `TASK_DEACTIVATED`, `TASK_ACTIVATED`, `ORDER_CHANGED`,
`PATH_ASSIGNED`, `ENROLLMENT_CANCELLED`, `ENROLLMENT_COMPLETED`, `PERMISSION_GRANTED`, `PERMISSION_REVOKED`,
`SUBMISSION_CREATED`, `COURSE_RESULT_RECORDED`, `QUIZ_ATTEMPTED`, `SUBMISSION_SUBMITTED`, `SUBMISSION_CANCELLED`, `SUBMISSION_CLAIMED`, `SUBMISSION_RELEASED`, `SUBMISSION_ASSESSED`, `TASK_PASSED`, `TASK_REJECTED` (= NEEDS_IMPROVEMENT).
