# Kontrakt API v1

Prefix `/api/v1`. Autoryzacja: `Authorization: Bearer <access_token>`. **[+]** = rozszerzenie spoza spec. v1, zatwierdzone decyzjami PO.
Zasób spoza zakresu użytkownika zwraca **404**, nie 403 (nie ujawniamy istnienia, BR-17). Wyjątek: instruktor bez uprawnień przy claim/ocenie dostaje 403 `INSTRUCTOR_NOT_AUTHORIZED` (wymóg TEST 11).
Role sprawdzane jako przynależność do zbioru ról użytkownika (BR-27).

## Endpointy

### Auth (publiczne poza `/me`, `/logout`, `/change-password`)
| Metoda | Ścieżka | Wynik | Błędy |
|---|---|---|---|
| POST | /auth/register | 201 user (`PENDING_APPROVAL`), bez tokenów | 409 EMAIL_ALREADY_EXISTS, 422 |
| POST | /auth/login | 200 tokens | 401 INVALID_CREDENTIALS, 403 ACCOUNT_PENDING_APPROVAL, 403 ACCOUNT_INACTIVE |
| POST | /auth/refresh | 200 tokens | 401 INVALID_TOKEN, 403 ACCOUNT_INACTIVE |
| POST | **[+]** /auth/logout | 204 | — |
| POST | **[+]** /auth/change-password | 204 (`current_password`, `new_password`) | 401 INVALID_CREDENTIALS, 422 |
| GET | /auth/me | 200 user + `roles[]` | 401 |

### Uczestnik (`PARTICIPANT`)
| Metoda | Ścieżka | Wynik | Błędy |
|---|---|---|---|
| GET | /me | 200 profil | |
| GET | /me/paths | 200 lista zapisów | |
| GET | /me/paths/{path_version_id} | 200 wersja + etapy + zadania (bez statusów) | 404 |
| GET | /me/paths/{path_version_id}/progress | 200 struktura z §17 (nazwy wg widocznej rewizji) | 404 |
| GET | /tasks/{task_id} | 200 zadanie: widoczna rewizja (BR-19) + `status` + zdjęcia wzorcowe | 404 |
| GET | **[+]** /tasks/{task_id}/materials/{material_id} | 200 obraz (stream) | 404 |
| GET | /tasks/{task_id}/submissions | 200 historia prób (z ocenami) | 404 |
| POST | /tasks/{task_id}/submissions | 201 szkic `DRAFT` (JSON: `comment?`) | 403 NO_ACTIVE_ENROLLMENT, 409 TASK_LOCKED, 409 TASK_ALREADY_PASSED, 409 SUBMISSION_PENDING |
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

### Admin (`ADMIN`)
| Metoda | Ścieżka | Uwagi |
|---|---|---|
| GET / POST | /admin/users | lista z filtrami (`status`, `role`, wyszukiwanie); utworzenie: od razu `ACTIVE`, z rolami |
| PUT | /admin/users/{user_id} | dane, role, `status` (`ACTIVE`/`DEACTIVATED`); dezaktywacja/odebranie roli INSTRUCTOR → automatyczny release (BR-26) |
| POST | **[+]** /admin/users/{user_id}/approve, /reject | tylko z `PENDING_APPROVAL` → 409 INVALID_STATE_TRANSITION |
| POST | **[+]** /admin/users/{user_id}/password | nowe hasło; unieważnia sesje użytkownika |
| GET / POST | /admin/paths | |
| GET | **[+]** /admin/paths/{path_id} | ścieżka + lista wersji |
| POST | /admin/paths/{path_id}/versions | **[+]** `copy_from_version_id` (Q-07, kopiuje też uprawnienia — BR-24) |
| GET | /admin/path-versions/{version_id} | pełna struktura (z zadaniami wyłączonymi) |
| PUT | **[+]** /admin/path-versions/{version_id} | `description`, `is_active` (przyjmowanie zapisów) |
| POST / PUT | /admin/stages, /admin/stages/{id} | |
| POST / PUT | /admin/tasks, /admin/tasks/{id} | każdy zapis treści tworzy nową rewizję (BR-19); `material_ids[]` = uporządkowana lista zdjęć wzorcowych |
| GET | **[+]** /admin/tasks/{id}/revisions | historia rewizji |
| POST | **[+]** /admin/tasks/{id}/materials | upload zdjęcia wzorcowego (multipart) → `material_id`, podpinany przez PUT zadania |
| POST | **[+]** /admin/tasks/{id}/deactivate, /activate | BR-20 → 409 TASK_HAS_PENDING_SUBMISSIONS |
| PUT | **[+]** /admin/stages/{id}/tasks/order, /admin/path-versions/{id}/stages/order | zmiana kolejności całej listy w jednej transakcji (BR-16) |
| GET / POST | /admin/enrollments | lista z filtrami (`path_version_id`, `user_id`, `status`); utworzenie → 201 (albo 200 przy reaktywacji anulowanego zapisu, Q-45), 409 ALREADY_ENROLLED, 409 PATH_VERSION_INACTIVE, 422 USER_NOT_PARTICIPANT |
| POST | **[+]** /admin/enrollments/{id}/cancel | BR-29 |
| GET / POST | /admin/instructor-permissions | lista z filtrami; nadanie `{instructor_id, path_version_id \| stage_id}` → 422 USER_NOT_INSTRUCTOR |
| DELETE | **[+]** /admin/instructor-permissions/{id} | odebranie + automatyczny release (BR-26) |
| GET | **[+]** /admin/submissions, /admin/submissions/{id} | podgląd (FR-ADM-05), filtry: `path_version_id`, `status`, `user_id`, `instructor_id` |
| GET | **[+]** /admin/audit-logs | podgląd (FR-ADM-06), filtry: `action`, `user_id`, `entity_type`, `entity_id`, `from`, `to`; paginacja |

Listy są stronicowane (`limit`, `offset`).

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
| TASK_HAS_PENDING_SUBMISSIONS | 409 | wyłączenie zadania z oczekującymi zgłoszeniami |
| PATH_VERSION_INACTIVE | 409 | zapis do wersji nieprzyjmującej zapisów |
| ALREADY_ENROLLED | 409 | zapis do tej wersji istnieje albo aktywny zapis do innej wersji tej ścieżki |
| USER_NOT_PARTICIPANT | 422 | zapis użytkownika bez roli PARTICIPANT |
| USER_NOT_INSTRUCTOR | 422 | uprawnienie dla użytkownika bez roli INSTRUCTOR |
| CONCURRENT_UPDATE | 409 | wykryte zakleszczenie przy równoległych operacjach — klient może ponowić (ADR-10) |

Format: `{"error": {"code": "TASK_LOCKED", "message": "Task is locked until the previous task is passed.", "details": null}}`

## AuditLog — akcje

`USER_REGISTERED`, `USER_APPROVED`, `USER_REJECTED`, `USER_CREATED`, `USER_UPDATED`, `USER_PASSWORD_RESET`, `USER_PASSWORD_CHANGED`, `USER_LOGIN`,
`PATH_CREATED`, `PATH_VERSION_CREATED`, `PATH_VERSION_UPDATED`, `STAGE_CREATED`, `STAGE_UPDATED`, `TASK_CREATED`, `TASK_UPDATED` (nowa rewizja), `TASK_DEACTIVATED`, `TASK_ACTIVATED`, `ORDER_CHANGED`,
`PATH_ASSIGNED`, `ENROLLMENT_CANCELLED`, `ENROLLMENT_COMPLETED`, `PERMISSION_GRANTED`, `PERMISSION_REVOKED`,
`SUBMISSION_CREATED`, `SUBMISSION_SUBMITTED`, `SUBMISSION_CANCELLED`, `SUBMISSION_CLAIMED`, `SUBMISSION_RELEASED`, `SUBMISSION_ASSESSED`, `TASK_PASSED`, `TASK_REJECTED` (= NEEDS_IMPROVEMENT).
