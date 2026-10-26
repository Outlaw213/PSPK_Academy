# Model danych

Konwencje: PostgreSQL 18; PK `UUID` (v4, generowany w aplikacji); czasy `timestamptz` w UTC; enumy jako `VARCHAR` + `CHECK` (ADR-18); nazwane ograniczenia (konwencja nazw w `MetaData`).
Pola i tabele **[+]** wykraczają poza specyfikację v1 — zatwierdzone decyzjami PO (`docs/open-questions.md`).

## Encje

| Tabela | Pola | Ograniczenia |
|---|---|---|
| `users` | id, email, password_hash, first_name, last_name, **[+] status** (`PENDING_APPROVAL`/`ACTIVE`/`REJECTED`/`DEACTIVATED`; zastępuje `is_active` ze spec.), **[+] token_version** (int, podnoszony przy zmianie/resecie hasła — ADR-19), created_at, updated_at | unique(lower(email)) |
| **[+]** `user_roles` | user_id, role (`PARTICIPANT`/`INSTRUCTOR`/`ADMIN`) | PK(user_id, role); zastępuje kolumnę `users.role` (Q-16) |
| `learning_paths` | id, name, description, is_active, created_at, updated_at | |
| `path_versions` | id, learning_path_id, version_number, description, is_active (= przyjmuje nowe zapisy; nowa wersja startuje jako nieaktywna), **[+] copied_from_version_id**, created_at | unique(learning_path_id, version_number) |
| `stages` | id, path_version_id, name, description, position, created_at, updated_at | unique(path_version_id, position) DEFERRABLE INITIALLY DEFERRED (ADR-15) |
| `tasks` | id, stage_id, position, is_active, created_at, updated_at — treść zadania przeniesiona do `task_revisions`; aktualna rewizja = najwyższy `revision_number` (ADR-14) | unique(stage_id, position) DEFERRABLE INITIALLY DEFERRED (ADR-15) |
| **[+]** `task_revisions` | id, task_id, revision_number, name, description, instructions, task_type (`PRACTICAL`/`THEORY`/`QUIZ`/**[+]** `COURSE` — Q-56), estimated_minutes, difficulty (1–5), code, **[+] pass_threshold** (0–100, tylko QUIZ — Q-60), **[+] content_md** (treść Markdown — Q-62), assignment, evaluation_criteria, submission_requirements, material, quantity_description, expected_duration_days, created_by, created_at | unique(task_id, revision_number); wiersz niezmienny (Q-06) |
| **[+]** `task_materials` | id, task_id, storage_key, original_filename, mime_type, file_size, width, height, created_by, created_at | plik niezmienny (Q-19) |
| **[+]** `quiz_questions` | id, revision_id, position, text, kind (`SINGLE`/`MULTI`) | unique(revision_id, position); niezmienne z rewizją (Q-60) |
| **[+]** `quiz_options` | id, question_id, position, text, is_correct | unique(question_id, position); ≥ 1 poprawna na pytanie (walidacja w serwisie) |
| **[+]** `task_revision_attachments` | id, revision_id, position, kind (`PDF`/`VIDEO_LINK`), title, storage_key (PDF), url (link), file_size, created_at | unique(revision_id, position); check(kind='PDF' ⇒ storage_key, kind='VIDEO_LINK' ⇒ url LIKE 'https://%') (Q-62) |
| **[+]** `submission_answers` | submission_id, question_id, option_ids (UUID[]) | PK(submission_id, question_id) — odpowiedzi quizu (Q-60) |
| **[+]** `task_revision_materials` | revision_id, material_id, position, caption | PK(revision_id, material_id); unique(revision_id, position) — zdjęcia wzorcowe są częścią rewizji (Q-43) |
| `enrollments` | id, user_id, path_version_id, **[+] learning_path_id** (kopia z wersji, pod indeks), status (`ACTIVE`/`COMPLETED`/`CANCELLED`), enrolled_at, completed_at, **[+] cancelled_at** | unique(user_id, path_version_id); częściowy unique(user_id, learning_path_id) WHERE status = 'ACTIVE' (Q-14) |
| `instructor_path_permissions` | id, instructor_id, path_version_id, **[+] created_at** | unique(instructor_id, path_version_id) |
| `instructor_stage_permissions` | id, instructor_id, stage_id, **[+] created_at** | unique(instructor_id, stage_id) |
| `submissions` | id, task_id, user_id, attempt_number, status, **[+] comment**, **[+] task_revision_id** (ustawiane przy wysyłce), instructor_id, **[+] recorded_by** (instruktor wpisujący wynik kursu, BR-30; NULL dla prac własnych), submitted_at, claimed_at, assessed_at, **[+] cancelled_at**, created_at, updated_at | unique(task_id, user_id, attempt_number); check(attempt_number ≥ 1); check(instructor_id ≠ user_id) |
| `assessments` | id, submission_id, instructor_id (**[+]** NULL = ocena systemowa quizu), result (`PASSED`/`NEEDS_IMPROVEMENT`), comment, **[+] score** (0–100, quiz), created_at | unique(submission_id); check(instructor_id IS NOT NULL OR score IS NOT NULL); check(result ≠ NEEDS_IMPROVEMENT OR comment niepusty OR instructor_id IS NULL) |
| `submission_photos` | id, submission_id, storage_key, original_filename, mime_type, file_size, width, height, position, created_at | unique(submission_id, position); check(position 1..10) |
| `audit_logs` | id, user_id (nullable), action, entity_type, entity_id, metadata (JSONB; atrybut ORM `meta` — Q-05), created_at | indeksy (entity_type, entity_id), (created_at), (user_id) |
| **[+]** `refresh_tokens` | id (= `jti` w refresh JWT), user_id, family_id (sesja), expires_at, used_at (rotacja), revoked_at, created_at | indeksy (user_id), (family_id); mechanika — ADR-09 |

Indeksy dodatkowe: `submissions(user_id, task_id)`, `submissions(status)` (kolejka instruktora), `enrollments(user_id)`, `tasks(stage_id) WHERE is_active`.

Uprawnienia instruktorów i zdjęcia szkicu to konfiguracja / dane robocze: odebranie uprawnienia i usunięcie zdjęcia ze szkicu usuwają wiersz (ślad w AuditLog). Wszystko inne jest tylko dezaktywowane lub zmienia status.

### Ograniczenia na poziomie bazy (obrona w głąb)
- `check(position BETWEEN 1 AND 10)` + `unique(submission_id, position)` na zdjęciach — twardy limit 10. Usunięcie zdjęcia ze szkicu przenumerowuje pozostałe.
- Jedna otwarta próba: częściowy `unique(task_id, user_id) WHERE status IN ('DRAFT','SUBMITTED','UNDER_REVIEW')` (BR-14).
- Jedno zaliczenie: częściowy `unique(task_id, user_id) WHERE status = 'PASSED'` (BR-05).
- `check(status <> 'UNDER_REVIEW' OR instructor_id IS NOT NULL)`.
- `check(status IN ('DRAFT','CANCELLED') OR (task_revision_id IS NOT NULL AND submitted_at IS NOT NULL))` — wysłane zgłoszenie zawsze wskazuje rewizję (BR-19).
- Jeden aktywny zapis na ścieżkę: częściowy indeks na `enrollments` (BR-12).
- `check(recorded_by IS NULL OR (status IN ('PASSED','NEEDS_IMPROVEMENT') AND instructor_id = recorded_by))` — wynik kursu powstaje od razu jako oceniony (BR-30).

## Karta zadania → pola rewizji (Q-19)

| Na karcie | Pole `task_revisions` |
|---|---|
| Tytuł („Haczyk / zawieszka”) | `name` |
| „PRACA WŁASNA 02” | `code` |
| Czas: „2 tygodnie” (tylko informacja, Q-20) | `expected_duration_days` |
| Do wykonania: „2 sztuki” | `quantity_description` |
| Materiał: „płaskownik 30–50 × 3–5 mm…” | `material` |
| Cel ćwiczenia | `description` |
| Kolejność operacji | `instructions` (Markdown, lista numerowana) |
| Zadanie | `assignment` |
| Na co zwrócić uwagę | `evaluation_criteria` |
| Materiał do zaliczenia w aplikacji | `submission_requirements` |
| Grafika wzorcowej pracy + podpis („Wymagane: 2 podobne egzemplarze”) | `task_revision_materials` (+ `caption`) |
| — (spec.) | `task_type`, `difficulty`, `estimated_minutes` (opcjonalne) |
| „ETAP 1 · Kowalstwo podstawowe” | `stages.name` |
| Typ z listy zadań: „Praca własna” / „Kurs” | `task_type` = `PRACTICAL` / `COURSE` |

## Maszyna stanów Submission

```
(utworzenie) ──► DRAFT ──submit──► SUBMITTED ──claim──► UNDER_REVIEW ──assess(PASSED)────────► PASSED (końcowy)
                   │                 │   ▲                   │
                   │                 │   └────release────────┤  (instruktor/ADMIN lub automatycznie — BR-26)
                   │                 │                       └──assess(NEEDS_IMPROVEMENT)──► NEEDS_IMPROVEMENT
                   │                 │                                                     (końcowy dla próby;
                   └──porzucenie──► CANCELLED ◄──wycofanie (przed claim)                    uczestnik tworzy nową)

Anulowanie zapisu (BR-29): DRAFT / SUBMITTED / UNDER_REVIEW → CANCELLED
Wyłączenie zadania (BR-20): DRAFT → CANCELLED
```

Quiz (BR-32): `(rozwiązanie) ──► PASSED | NEEDS_IMPROVEMENT` — jedna transakcja z odpowiedziami i systemowym Assessment.

Kurs (BR-30): `(wpis instruktora) ──► PASSED | NEEDS_IMPROVEMENT` — bez `DRAFT`/`SUBMITTED`/`UNDER_REVIEW`, w jednej transakcji z Assessment.

Każde przejście poza tym diagramem → `409 INVALID_STATE_TRANSITION`.

## Maszyna stanów User

```
rejestracja ──► PENDING_APPROVAL ──approve──► ACTIVE ◄──reactivate── DEACTIVATED
                      │                         └──────deactivate──────►
                      └──reject──► REJECTED
konto zakładane przez admina ──► ACTIVE
```

## Enrollment
`ACTIVE → COMPLETED` (automatycznie: BR-15) · `ACTIVE → CANCELLED` (admin, BR-29) · `CANCELLED → ACTIVE` (ponowny zapis do tej samej wersji, Q-45). Zapis `COMPLETED`/`CANCELLED`: historia tylko do odczytu.

## PathVersion
`is_active = false` (start) → admin włącza zapisy → `is_active = true`. Treść i struktura edytowalne zawsze (BR-16, BR-19). Wyłączenie wersji blokuje tylko nowe zapisy; istniejące działają dalej.
