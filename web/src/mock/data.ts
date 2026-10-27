// Example data for the design mockup only. In the real panel (M12) all of this,
// including every task status, comes from the backend API (docs/api.md).
// Programme: docs/assets/lista-zadan-sciezki.jpeg; full cards: docs/assets/karta-*.png.

import refHaczyk from "../assets/ref-haczyk.webp";
import refSerce1 from "../assets/ref-serce-1.webp";
import refSerce2 from "../assets/ref-serce-2.webp";

export type Role = "PARTICIPANT" | "INSTRUCTOR" | "ADMIN";

export type TaskStatus =
  | "LOCKED"
  | "AVAILABLE"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "NEEDS_IMPROVEMENT"
  | "PASSED";

export type SubmissionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "NEEDS_IMPROVEMENT"
  | "PASSED"
  | "CANCELLED";

export type TaskType = "PRACTICAL" | "THEORY" | "QUIZ" | "COURSE";

/** Photo: a real image (`url`) or a placeholder steel swatch (hue + motif). */
export interface Photo {
  id: string;
  tone: number;
  motif: "hook" | "nail" | "scroll" | "tongs" | "fire" | "anvil" | "heart" | "leaf";
  url?: string;
}

export interface Task {
  id: string;
  position: number;
  name: string;
  type: TaskType;
  status: TaskStatus;
  revision: number;
  expectedDays: number;
  quantity?: string;
  material?: string;
  /** Card content; absent while the card for this task is not written yet (Q-36a). */
  description?: string;
  instructions?: string[];
  assignment?: string;
  criteria?: string;
  requirements?: string;
  reference?: { photo: Photo; caption: string }[];
  referenceNote?: string;
  /** Markdown body (Q-62). */
  content?: string;
  attachments?: Attachment[];
  quiz?: Quiz;
}

export interface Attachment {
  id: string;
  kind: "PDF" | "VIDEO_LINK";
  title: string;
  url?: string;
  size?: string;
}

export interface QuizQuestion {
  id: string;
  text: string;
  kind: "SINGLE" | "MULTI";
  options: { id: string; text: string; correct: boolean }[];
}

/** Auto-graded against the admin's key (BR-32). The key never reaches the participant in the real API. */
export interface Quiz {
  threshold: number;
  questions: QuizQuestion[];
}

export interface Stage {
  id: string;
  position: number;
  name: string;
  tasks: Task[];
}

const img = (id: string, url: string): Photo => ({ id, tone: 0, motif: "hook", url });

const kinds = { P: "PRACTICAL", K: "COURSE", T: "THEORY", Q: "QUIZ" } as const;
// `n` keeps ids stable while the admin reorders; position (and so the E1.2 label) comes from the array order.
const t = (stage: number, n: number | string, type: keyof typeof kinds, name: string, days: number, status: TaskStatus = "LOCKED", extra: Partial<Task> = {}): Task => ({
  id: `t${stage}-${n}`,
  position: 0,
  name,
  type: kinds[type],
  status,
  revision: 1,
  expectedDays: days,
  ...extra,
});
const ordered = (tasks: Task[]) => tasks.map((x, i) => ({ ...x, position: i + 1 }));

const theory: Partial<Task> = {
  content: `Kuźnia to miejsce pracy z ogniem, rozgrzanym metalem i ciężkimi narzędziami. Zanim zaczniesz kuć, poznaj zasady, które obowiązują na każdym stanowisku PSPK.

## Najczęstsze zagrożenia
- **oparzenia** — od materiału, narzędzi i zgorzeliny,
- **urazy oczu** — odpryski zgorzeliny i opiłki,
- **urazy dłoni i nadgarstków** — źle trzymany młotek, odbicie od kowadła,
- **zatrucie tlenkiem węgla** — przy słabej wentylacji paleniska.

## Zasady
1. Zawsze okulary ochronne i pełne skórzane obuwie.
2. Ubranie z włókien naturalnych, bez luźnych elementów.
3. Gorącego materiału nie dotyka się dłonią — także w rękawicy. Używaj kleszczy.
4. Woda i gaśnica w zasięgu ręki, zanim rozpalisz palenisko.`,
  assignment: "Opisz własnymi słowami pięć zagrożeń w kuźni i sposób, w jaki się przed nimi chronisz na swoim stanowisku.",
  requirements: "Odpowiedź w komentarzu albo zdjęcie odręcznej notatki.",
  attachments: [
    { id: "a1", kind: "PDF", title: "Regulamin kuźni PSPK", size: "1,2 MB" },
    { id: "a2", kind: "VIDEO_LINK", title: "Bezpieczne rozpalanie paleniska (film)", url: "https://www.youtube.com/results?search_query=kowalstwo+bezpiecze%C5%84stwo" },
  ],
};

const quiz: Partial<Task> = {
  content: "Krótki test z wiadomości o stali i pracy w kuźni. Wynik zobaczysz od razu po wysłaniu odpowiedzi.",
  quiz: {
    threshold: 80,
    questions: [
      {
        id: "q1",
        kind: "SINGLE",
        text: "Jaki kolor żaru odpowiada właściwej temperaturze kucia stali niskowęglowej?",
        options: [
          { id: "q1a", text: "Ciemnoczerwony", correct: false },
          { id: "q1b", text: "Wiśniowy", correct: false },
          { id: "q1c", text: "Żółto-pomarańczowy", correct: true },
          { id: "q1d", text: "Biały, iskrzący", correct: false },
        ],
      },
      {
        id: "q2",
        kind: "SINGLE",
        text: "Dlaczego nie kuje się stali, która ostygła poniżej koloru wiśniowego?",
        options: [
          { id: "q2a", text: "Rośnie ryzyko pęknięć i zakładek", correct: true },
          { id: "q2b", text: "Stal zaczyna się topić", correct: false },
          { id: "q2c", text: "Młotek się odbija i niszczy kowadło", correct: false },
        ],
      },
      {
        id: "q3",
        kind: "MULTI",
        text: "Które oznaczenia to stale niskowęglowe? Zaznacz wszystkie poprawne.",
        options: [
          { id: "q3a", text: "S235", correct: true },
          { id: "q3b", text: "C45", correct: false },
          { id: "q3c", text: "St3S", correct: true },
          { id: "q3d", text: "NC6", correct: false },
        ],
      },
      {
        id: "q4",
        kind: "SINGLE",
        text: "Co oznaczają białe iskry wylatujące z materiału w palenisku?",
        options: [
          { id: "q4a", text: "Materiał jest gotowy do kucia", correct: false },
          { id: "q4b", text: "Stal się przepala i jest niszczona", correct: true },
          { id: "q4c", text: "Palenisko ma za mało powietrza", correct: false },
        ],
      },
      {
        id: "q5",
        kind: "MULTI",
        text: "Które środki ochrony są obowiązkowe przy kuciu? Zaznacz wszystkie poprawne.",
        options: [
          { id: "q5a", text: "Okulary ochronne", correct: true },
          { id: "q5b", text: "Pełne skórzane obuwie", correct: true },
          { id: "q5c", text: "Rękawice do chwytania gorącego materiału dłonią", correct: false },
          { id: "q5d", text: "Ubranie z włókien naturalnych", correct: true },
        ],
      },
    ],
  },
};

const haczyk: Partial<Task> = {
  revision: 3,
  quantity: "2 sztuki",
  material: "płaskownik 30–50 × 3–5 mm, stal niskowęglowa",
  description:
    "Nauka pracy z płaskownikiem oraz łączenia kilku podstawowych operacji w jednym wyrobie. Ćwiczenie rozwija kontrolę rozcinania, wyciągania, kształtowania i gięcia materiału oraz wprowadza przebijanie otworu. Ważnym elementem jest wykonanie dwóch możliwie podobnych zawieszek.",
  instructions: [
    "Rozcięcie części górnej – przygotowanie materiału do wykonania dwóch wąsów.",
    "Odgięcie wąsów – rozdzielenie i wstępne ustawienie obu części.",
    "Wyciąganie i kształtowanie wąsów – zwężenie oraz nadanie im docelowej formy.",
    "Kształtowanie krawędzi – uporządkowanie obrysu i proporcji korpusu.",
    "Kształtowanie rybiego ogona – wykonanie ozdobnego zakończenia dolnej części.",
    "Zaginanie – uformowanie haka i nadanie wyrobowi końcowej geometrii.",
    "Przebijanie – wykonanie otworu montażowego.",
  ],
  assignment:
    "Samodzielnie wykonaj 2 haczyki / zawieszki według jednego wzorca. Oba elementy powinny mieć zbliżone proporcje, kształt wąsów, geometrię haka, położenie otworu i sposób wykończenia. Celem jest uzyskanie dwóch elementów wyglądających jak jedna seria.",
  criteria:
    "Równe i kontrolowane rozcięcie; zbliżona długość oraz kształt obu wąsów; płynne przejścia przekrojów; estetycznie ukształtowane krawędzie i rybi ogon; równy łuk haka; otwór umieszczony prawidłowo względem osi; brak niezamierzonych skręceń płaskownika. Najważniejsze kryterium: kontrola formy i powtarzalność dwóch egzemplarzy.",
  requirements:
    "Dodaj zdjęcie obu zawieszek ułożonych obok siebie. Fotografia powinna umożliwiać ocenę kształtu wąsów, krawędzi, rybiego ogona, geometrii haków, otworów oraz powtarzalności wykonania.",
  reference: [{ photo: img("ref-haczyk", refHaczyk), caption: "Grafika wzorcowej pracy" }],
  referenceNote: "Wymagane: 2 podobne egzemplarze",
};

const serce: Partial<Task> = {
  quantity: "2 sztuki – po 1 każdym sposobem",
  material: "pręt okrągły Ø6 mm, stal niskowęglowa",
  description:
    "Nauka świadomego kształtowania pręta w formę symetryczną oraz kontroli wyciągania, zawijania i gięcia. Wykonanie serca uczy planowania ilości materiału potrzebnego na obie strony wyrobu oraz zachowania proporcji podczas kolejnych operacji.",
  instructions: [
    "Wyciągnięcie szpica – przygotowanie pierwszego zakończenia.",
    "Zawinięcie – uformowanie pierwszego ślimaka.",
    "Odcięcie – oddzielenie odpowiedniej długości materiału.",
    "Wyciągnięcie drugiego szpica – przygotowanie drugiego zakończenia.",
    "Zawinięcie – uformowanie drugiego ślimaka.",
    "Złożenie na pół – wyznaczenie osi i podstawowej formy serca.",
    "Skucie czubka – ukształtowanie dolnej części serca.",
    "Formowanie prawej części – nadanie właściwego łuku.",
    "Formowanie lewej części – dopasowanie drugiej strony i korekta symetrii.",
  ],
  assignment:
    "Samodzielnie wykonaj 2 serca – po jednym każdym z dwóch pokazanych sposobów. Oba wyroby powinny mieć czytelną formę serca, płynne łuki i starannie ukształtowane zakończenia.",
  criteria:
    "Równe wyciągnięcie obu szpiców; podobna wielkość zawinięć; właściwe dobranie długości materiału przed odcięciem; zachowanie osi podczas składania; czytelny i estetyczny czubek; płynność prawego i lewego łuku; brak przypadkowych załamań i skręceń. Najważniejsze kryterium: kontrola proporcji i symetrii formy.",
  requirements:
    "Dodaj zdjęcie obu wykonanych serc ułożonych obok siebie. Fotografia powinna umożliwiać ocenę proporcji, symetrii, jakości zawinięć, czubka oraz płynności łuków.",
  reference: [
    { photo: img("ref-serce-1", refSerce1), caption: "Sposób 1" },
    { photo: img("ref-serce-2", refSerce2), caption: "Sposób 2" },
  ],
  referenceNote: "Wymagane: 2 sztuki – po 1 każdym sposobem",
};

const course: Partial<Task> = {
  description: "Zajęcia stacjonarne z instruktorem PSPK. Termin ustala instruktor prowadzący.",
};

const W2 = 14;
const W4 = 28;

export const stages: Stage[] = [
  {
    id: "s1",
    position: 1,
    name: "Kowalstwo podstawowe",
    tasks: ordered([
      t(1, "teoria", "T", "Bezpieczeństwo pracy w kuźni", 7, "PASSED", theory),
      t(1, 1, "P", "Gwóźdź", W2, "PASSED"),
      t(1, 2, "P", "Haczyk / zawieszka", W2, "NEEDS_IMPROVEMENT", haczyk),
      t(1, "quiz", "Q", "Stal i ogień — test wiedzy", 7, "LOCKED", quiz),
      t(1, 3, "P", "Serce [dwa sposoby]", W2, "LOCKED", serce),
      t(1, 4, "P", "Rybi ogon", W2),
      t(1, 5, "P", "Liść", W2),
      t(1, 6, "P", "Ślimak z twistem [trylobit]", W2),
      t(1, 7, "P", "Fibula", W2),
      t(1, 8, "P", "Szpila do włosów", W2),
      t(1, 9, "P", "Pogrzebacz", W2),
      t(1, 10, "P", "Otwieracz sowa", W2),
      t(1, 11, "P", "Świecznik z liściem", W2),
      t(1, 12, "P", "Dzwonek", W2),
      t(1, 13, "P", "Głowa konia", W2),
      t(1, 14, "P", "Wieszak ozdobny nitowany", W2),
      t(1, 15, "P", "Kołatka", W2),
      t(1, 16, "K", "Podkowa", 1, "PASSED", course),
      t(1, 17, "K", "Głowa byka", 1, "AVAILABLE", course),
      t(1, 18, "K", "Głowa barana", 1, "AVAILABLE", course),
      t(1, 19, "K", "Zestaw sztućców", 2, "AVAILABLE", course),
    ]),
  },
  {
    id: "s2",
    position: 2,
    name: "Kowalstwo zaawansowane",
    tasks: ordered([
      t(2, 1, "P", "Kleszcze kowalskie", W4),
      t(2, 2, "P", "Nóż typu Full Tang [Clip Point]", W4),
      t(2, 3, "P", "Nóż typu Hidden Tang [Drop Point]", W4),
      t(2, 4, "P", "Nóż typu Hidden Tang [Gyuto]", W4),
      t(2, 5, "P", "Nóż typu Through Tang [Dagger]", W4),
      t(2, 6, "P", "Topór brodaty", W4),
      t(2, 7, "P", "Topór z wgrzewanym ostrzem", W4),
      t(2, 8, "P", "Topór dwuostrzowy", W4),
      t(2, 9, "P", "Miecz jednoręczny", W4),
      t(2, 10, "K", "Zgrzewanie kowalskie", 1, "LOCKED", course),
      t(2, 11, "K", "Wgrzewanie stali", 1, "LOCKED", course),
      t(2, 12, "K", "San-Mai", 1, "LOCKED", course),
      t(2, 13, "K", "Damast warstwowy", 1, "LOCKED", course),
      t(2, 14, "K", "Damast puszkowy", 1, "LOCKED", course),
    ]),
  },
];
