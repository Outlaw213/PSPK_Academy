# PSPK Akademia — proces Spec-Driven Development

## Zasada

Specyfikacja jest źródłem prawdy. Kod jest jej implementacją, a testy jej dowodem.
Nic nie trafia do kodu, czego nie ma w specyfikacji. Każda zmiana zachowania zaczyna się od zmiany specyfikacji.

## Dokumenty (kolejność czytania)

| Plik | Rola | Kto zmienia |
|---|---|---|
| `PSPK_Academy_specyfication_v1.txt` | Specyfikacja wejściowa (v1) — niezmieniana, tylko referencja | — |
| `docs/open-questions.md` | Braki i sprzeczności + decyzje | Product owner zatwierdza |
| `docs/business-rules.md` | Wymagania z ID (BR-xx, FR-xx) + kryteria akceptacji | po decyzji PO |
| `docs/database.md` | Model domenowy, maszyny stanów, ograniczenia DB | dev, po akceptacji |
| `docs/api.md` | Kontrakt API: endpointy, role, błędy | dev, po akceptacji |
| `docs/architecture.md` | Decyzje architektoniczne (ADR) | dev |
| `docs/infrastructure.md` | Stan serwera Proxmox, plan zasobów i prac na serwerze | dev (inwentaryzacja), PO (wykonanie prac) |
| `docs/plan.md` | Kamienie milowe i zadania | dev |

## Cykl pracy dla każdego kamienia milowego

1. **Spec delta** — doprecyzuj wymagania danego etapu (ID wymagań, kryteria akceptacji).
2. **Testy najpierw** — napisz testy odwzorowujące kryteria akceptacji. Uruchom: muszą być czerwone.
3. **Implementacja** — minimalny kod, by testy przeszły.
4. **Regresja** — uruchom cały zestaw testów.
5. **Raport** (wg §37 specyfikacji): lista plików, co zrobiono, wynik testów (prawdziwy — inaczej „TEST NIEURUCHOMIONY”), problemy.
6. **Akceptacja** — dopiero wtedy następny etap.

## Śledzalność

- Każde wymaganie ma ID: `BR-01` (reguła biznesowa), `FR-AUTH-01` (funkcjonalne), `NFR-01` (niefunkcjonalne).
- Każdy test w nazwie lub docstringu wskazuje ID: `test_br02_next_task_locked_until_previous_passed`.
- Macierz pokrycia (wymaganie → test) w `docs/business-rules.md`, sekcja „Pokrycie”.
- Zmiana wymagania = nowy wpis w `docs/open-questions.md` (sekcja Decyzje) z datą.

## Konstytucja (zasady nienegocjowalne)

1. Backend jest jedynym źródłem prawdy o rolach, dostępie, statusach i odblokowaniu zadań.
2. Historia jest nienaruszalna: prób, ocen i wersji ścieżek nie nadpisuje się i nie usuwa.
3. PASSED jest ostateczne i zawsze ma swoje Assessment.
4. Logika statusu zadania istnieje w jednym miejscu (`task_service`).
5. Żadnych sekretów w repozytorium; żadnych haseł/tokenów w logach.
6. Każda zmiana schematu przez Alembic.
7. Nie dodajemy funkcji spoza MVP „bo się przydadzą”.
8. Nie raportujemy fikcyjnych wyników testów.
