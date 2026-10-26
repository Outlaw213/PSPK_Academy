# Pytania otwarte i decyzje

> **Wersja odtworzona 2026-10-26.** Oryginalny plik nie zachował się. Treść decyzji Q-xx odtworzona z odwołań w `business-rules.md`, `database.md`, `api.md` i `plan.md`. Jeśli coś się nie zgadza z tym, co ustaliłeś wcześniej — popraw tutaj, a potem w dokumentach zależnych.

## A. Otwarte

| ID | Pytanie | Blokuje |
|---|---|---|
| Q-51 | Logo i kolory PSPK (kolor główny, ewentualnie dodatkowe; plik logo w SVG/PNG). Do czasu odpowiedzi makieta używa koloru tymczasowego (token `--accent`). | finalny design (nie blokuje backendu) |
| Q-36 | Pełny program nauczania „Podstawy kowalstwa” (etapy, zadania z kart). | seed M11 |
| Q-46 | Kopie zapasowe: gdzie i jak często (baza + dysk zdjęć). | M11a |
| Q-47 | DNS `pspk.pl` w Cloudflare. | M11a |
| Q-48 | Kto ma dostęp do stagingu (Cloudflare Access — lista e-maili). | M11a |
| Q-49 | Wolny RAM / CPU na serwerze Proxmox. | M11a |
| Q-50 | Wersja Proxmox VE (oczekiwana 9). | M11a |
| Q-52 | Pojemność dysku na zdjęcia i sposób montowania do VM (osobny dysk wirtualny / passthrough / NFS). | M11a |
| Q-53 | Czy instruktor może przybliżać zdjęcia w pełnej rozdzielczości 2560 px (domyślnie tak), czy potrzebne też miniatury (domyślnie: generowane przy uploadzie 480 px, do list). | M9 (domyślne przyjęte) |

## B. Decyzje

| ID | Decyzja | Data |
|---|---|---|
| Q-03 | Próba zaczyna się jako szkic `DRAFT`; zdjęcia i komentarz w szkicu; osobna wysyłka. | 2026-10-03 |
| Q-05 | Kolumna `audit_logs.metadata`, atrybut ORM `meta` (kolizja nazwy w SQLAlchemy). | 2026-10-03 |
| Q-06 | Admin zawsze może edytować treść i strukturę wersji; edycja tworzy rewizje; zaliczenia nigdy nie są cofane; nowe zadanie obowiązkowe dla wszystkich. | 2026-10-03 |
| Q-07 | Nowa wersja ścieżki: pusta albo kopia istniejącej (`copy_from_version_id`). | 2026-10-03 |
| Q-08 | Zadania się wyłącza, nie usuwa. | 2026-10-03 |
| Q-10 | Najwyżej jedna otwarta próba na zadanie+uczestnika. | 2026-10-03 |
| Q-11 | Uczestnik może porzucić szkic / wycofać zgłoszenie przed claim. | 2026-10-03 |
| Q-12 | Instruktor może zwolnić przejęte zgłoszenie; ADMIN też. | 2026-10-03 |
| Q-13 | Uprawnienie do wersji obejmuje wszystkie etapy; do etapu — tylko etap; suma; kopia wersji kopiuje uprawnienia. | 2026-10-03 |
| Q-14 | Najwyżej jeden aktywny zapis na ścieżkę. | 2026-10-03 |
| Q-15 | Zapis `COMPLETED` automatycznie po zaliczeniu wszystkich aktywnych zadań. | 2026-10-03 |
| Q-16 | Wiele ról na użytkownika (`user_roles`); nikt nie ocenia własnego zgłoszenia. | 2026-10-03 |
| Q-17 | Sama rola ADMIN nie daje prawa oceny. | 2026-10-03 |
| Q-18 | Wymagania wysyłki wg typu zadania (BR-22). | 2026-10-03 |
| Q-19 | Pola karty zadania → pola rewizji; zdjęcia wzorcowe jako niezmienne pliki. | 2026-10-03 |
| Q-20 | Czas na zadanie tylko informacyjnie (bez terminów). | 2026-10-03 |
| Q-21 | Rejestracja → `PENDING_APPROVAL`, akceptacja admina. | 2026-10-03 |
| Q-22 | Odrzucone konto zostaje; e-mail zajęty. | 2026-10-03 |
| Q-29 | Hosting: Proxmox, Cloudflare Tunnel, `pspk.pl` (ADR-23). | 2026-10 |
| Q-30 | **Panel WWW: React + TypeScript + Vite + Tailwind. Android później, natywnie (Kotlin).** Najpierw makieta designu na danych przykładowych, potem backend M1–M11, potem podłączenie panelu (M12). | 2026-10-26 |
| Q-31 | Interfejs po polsku; kody błędów API po angielsku. | 2026-10-03 |
| Q-32 | Środowisko: repo GitHub z dokumentacją, praca w środowisku chmurowym Claude Code; lokalnie tylko Git. | 2026-10-25 |
| Q-34 | **Zdjęcia na własnym dysku serwera (nie S3). Zmniejszane tak, by detale były widoczne, a pliki małe: dłuższy bok 2560 px, WebP q82, bez EXIF, oryginał nie jest przechowywany** (ADR-24, ADR-25). Zastępuje wcześniejszą decyzję „S3 + SeaweedFS”. | 2026-10-26 |
| Q-35 | Anulowanie zapisu anuluje otwarte próby. | 2026-10-03 |
| Q-37 | **Sesja WWW: access token w pamięci, refresh w ciasteczku httpOnly** (ADR-26). | 2026-10-26 |
| Q-38 | Zmiana własnego hasła unieważnia pozostałe sesje. | 2026-10-03 |
| Q-39 | Zapis nieaktywny → zadania bez otwartej próby pokazywane jako `LOCKED`. | 2026-10-03 |
| Q-40 | Otwarta próba ma pierwszeństwo w wyświetlaniu przed blokadą kolejności. | 2026-10-03 |
| Q-41 | Automatyczne zwolnienie, gdy instruktor traci możliwość oceny. | 2026-10-03 |
| Q-42 | `COMPLETED` sprawdzane też przy wyłączeniu zadania; ukończenie nie jest cofane. | 2026-10-03 |
| Q-43 | Zdjęcia wzorcowe są częścią rewizji zadania. | 2026-10-03 |
| Q-44 | Wyłączone zadania i puste etapy nie są pokazywane uczestnikowi. | 2026-10-03 |
| Q-45 | Ponowny zapis do tej samej wersji reaktywuje anulowany zapis. | 2026-10-03 |
| Q-54 | **Design: styl Apple (HIG), kolory PSPK** (do czasu Q-51 — kolor tymczasowy). | 2026-10-26 |
