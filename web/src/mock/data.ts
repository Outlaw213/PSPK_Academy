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
  code: string;
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
}

export interface Stage {
  id: string;
  position: number;
  name: string;
  tasks: Task[];
}

export interface Assessment {
  result: "PASSED" | "NEEDS_IMPROVEMENT";
  comment: string;
  instructor: string;
  at: string;
}

export interface Submission {
  id: string;
  taskId: string;
  taskName: string;
  taskCode: string;
  participant: string;
  attempt: number;
  status: SubmissionStatus;
  comment: string;
  photos: Photo[];
  submittedAt?: string;
  instructor?: string;
  assessment?: Assessment;
  revision: number;
  stageName: string;
  /** Course result entered by an instructor (BR-30). */
  recordedBy?: string;
}

export const me = {
  firstName: "Jan",
  lastName: "Kowalski",
  email: "jan.kowalski@example.pl",
  roles: ["PARTICIPANT", "INSTRUCTOR", "ADMIN"] as Role[],
};

const p = (id: string, tone: number, motif: Photo["motif"]): Photo => ({ id, tone, motif });
const img = (id: string, url: string): Photo => ({ id, tone: 0, motif: "hook", url });

const pad = (n: number) => String(n).padStart(2, "0");

let practicalNo = 0;
let courseNo = 0;
const t = (stage: number, pos: number, type: "P" | "K", name: string, days: number, status: TaskStatus = "LOCKED", extra: Partial<Task> = {}): Task => ({
  id: `t${stage}-${pos}`,
  position: pos,
  name,
  code: type === "P" ? `PRACA WŁASNA ${pad(++practicalNo)}` : `KURS ${pad(++courseNo)}`,
  type: type === "P" ? "PRACTICAL" : "COURSE",
  status,
  revision: 1,
  expectedDays: days,
  ...extra,
});

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
    tasks: [
      t(1, 1, "P", "Gwóźdź", W2, "PASSED"),
      t(1, 2, "P", "Haczyk / zawieszka", W2, "NEEDS_IMPROVEMENT", haczyk),
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
    ],
  },
  {
    id: "s2",
    position: 2,
    name: "Kowalstwo zaawansowane",
    tasks: [
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
    ],
  },
];

export const myHistory: Submission[] = [
  {
    id: "sub-12",
    taskId: "t1-2",
    taskName: "Haczyk / zawieszka",
    taskCode: "PRACA WŁASNA 02",
    participant: "Jan Kowalski",
    attempt: 2,
    status: "NEEDS_IMPROVEMENT",
    comment: "Druga próba. Poprawiłem położenie otworu.",
    photos: [p("h21", 18, "hook"), p("h22", 26, "hook"), p("h23", 34, "hook")],
    submittedAt: "2026-10-21 18:40",
    instructor: "Marek Nowak",
    revision: 3,
    stageName: "Kowalstwo podstawowe",
    assessment: {
      result: "NEEDS_IMPROVEMENT",
      comment:
        "Otwór już na osi, dobrze. Wąsy w drugiej zawieszce wyraźnie krótsze, a łuk haka załamany przy nasadzie. Odmierz materiał na wąsy przed rozcięciem i giń na rogu kowadła w pełnym żarze.",
      instructor: "Marek Nowak",
      at: "2026-10-23 09:12",
    },
  },
  {
    id: "sub-9",
    taskId: "t1-2",
    taskName: "Haczyk / zawieszka",
    taskCode: "PRACA WŁASNA 02",
    participant: "Jan Kowalski",
    attempt: 1,
    status: "NEEDS_IMPROVEMENT",
    comment: "",
    photos: [p("h11", 14, "hook"), p("h12", 20, "hook")],
    submittedAt: "2026-10-12 20:05",
    instructor: "Marek Nowak",
    revision: 2,
    stageName: "Kowalstwo podstawowe",
    assessment: {
      result: "NEEDS_IMPROVEMENT",
      comment: "Otwór przesunięty od osi, pęknięcie przy krawędzi. Przebijaj w pełnym żarze, z obu stron.",
      instructor: "Marek Nowak",
      at: "2026-10-14 08:30",
    },
  },
  {
    id: "sub-7",
    taskId: "t1-16",
    taskName: "Podkowa",
    taskCode: "KURS 01",
    participant: "Jan Kowalski",
    attempt: 1,
    status: "PASSED",
    comment: "",
    photos: [p("k1", 16, "anvil")],
    submittedAt: "2026-10-10 16:00",
    instructor: "Anna Wiśniewska",
    recordedBy: "Anna Wiśniewska",
    revision: 1,
    stageName: "Kowalstwo podstawowe",
    assessment: { result: "PASSED", comment: "Udział w kursie, podkowa wykonana poprawnie.", instructor: "Anna Wiśniewska", at: "2026-10-10 16:00" },
  },
  {
    id: "sub-5",
    taskId: "t1-1",
    taskName: "Gwóźdź",
    taskCode: "PRACA WŁASNA 01",
    participant: "Jan Kowalski",
    attempt: 1,
    status: "PASSED",
    comment: "Pręt kwadratowy 8 mm, pięć sztuk.",
    photos: [p("g1", 12, "nail")],
    submittedAt: "2026-10-04 17:00",
    instructor: "Marek Nowak",
    revision: 1,
    stageName: "Kowalstwo podstawowe",
    assessment: { result: "PASSED", comment: "Równe ostrza, łby symetryczne.", instructor: "Marek Nowak", at: "2026-10-05 10:00" },
  },
];

export const queue: Submission[] = [
  {
    id: "sub-31",
    taskId: "t1-3",
    taskName: "Serce [dwa sposoby]",
    taskCode: "PRACA WŁASNA 03",
    participant: "Piotr Zieliński",
    attempt: 1,
    status: "SUBMITTED",
    comment: "Pierwsze serce z jednego kawałka, drugie składane. Drugie wyszło mniej symetryczne.",
    photos: [p("q1", 24, "heart"), p("q2", 32, "heart"), p("q3", 16, "heart")],
    submittedAt: "2026-10-25 21:14",
    revision: 1,
    stageName: "Kowalstwo podstawowe",
  },
  {
    id: "sub-30",
    taskId: "t1-2",
    taskName: "Haczyk / zawieszka",
    taskCode: "PRACA WŁASNA 02",
    participant: "Katarzyna Wójcik",
    attempt: 3,
    status: "SUBMITTED",
    comment: "Trzecie podejście. Tym razem odmierzyłam wąsy przed rozcięciem.",
    photos: [p("q4", 20, "hook"), p("q5", 28, "hook")],
    submittedAt: "2026-10-25 19:02",
    revision: 3,
    stageName: "Kowalstwo podstawowe",
  },
  {
    id: "sub-28",
    taskId: "t1-5",
    taskName: "Liść",
    taskCode: "PRACA WŁASNA 05",
    participant: "Tomasz Lewandowski",
    attempt: 2,
    status: "UNDER_REVIEW",
    comment: "",
    photos: [p("q6", 26, "leaf"), p("q7", 36, "leaf")],
    submittedAt: "2026-10-24 16:45",
    instructor: "Jan Kowalski",
    revision: 1,
    stageName: "Kowalstwo podstawowe",
  },
  {
    id: "sub-27",
    taskId: "t1-1",
    taskName: "Gwóźdź",
    taskCode: "PRACA WŁASNA 01",
    participant: "Magdalena Kamińska",
    attempt: 1,
    status: "SUBMITTED",
    comment: "Pięć gwoździ, jeden krzywy — zostawiłam do porównania.",
    photos: [p("q8", 10, "nail"), p("q9", 18, "nail")],
    submittedAt: "2026-10-24 12:30",
    revision: 1,
    stageName: "Kowalstwo podstawowe",
  },
];

export type CourseResult = "PASSED" | "NEEDS_IMPROVEMENT" | null;

/** Participants enrolled in the version, with their state for a course (FR-INS-06). */
export const courseRoster: { id: string; name: string; result: CourseResult; locked?: boolean }[] = [
  { id: "c1", name: "Piotr Zieliński", result: null },
  { id: "c2", name: "Katarzyna Wójcik", result: null },
  { id: "c3", name: "Tomasz Lewandowski", result: "PASSED" },
  { id: "c4", name: "Magdalena Kamińska", result: "NEEDS_IMPROVEMENT" },
  { id: "c5", name: "Ewa Szymańska", result: null, locked: true },
];

export type UserStatus = "PENDING_APPROVAL" | "ACTIVE" | "REJECTED" | "DEACTIVATED";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  status: UserStatus;
  created: string;
}

export const users: AdminUser[] = [
  { id: "u1", name: "Ewa Szymańska", email: "ewa.s@example.pl", roles: ["PARTICIPANT"], status: "PENDING_APPROVAL", created: "2026-10-25" },
  { id: "u2", name: "Michał Dąbrowski", email: "m.dabrowski@example.pl", roles: ["PARTICIPANT"], status: "PENDING_APPROVAL", created: "2026-10-24" },
  { id: "u3", name: "Jan Kowalski", email: "jan.kowalski@example.pl", roles: ["PARTICIPANT", "INSTRUCTOR", "ADMIN"], status: "ACTIVE", created: "2026-09-01" },
  { id: "u4", name: "Marek Nowak", email: "marek.nowak@example.pl", roles: ["INSTRUCTOR"], status: "ACTIVE", created: "2026-09-01" },
  { id: "u5", name: "Anna Wiśniewska", email: "a.wisniewska@example.pl", roles: ["INSTRUCTOR", "PARTICIPANT"], status: "ACTIVE", created: "2026-09-03" },
  { id: "u6", name: "Piotr Zieliński", email: "piotr.z@example.pl", roles: ["PARTICIPANT"], status: "ACTIVE", created: "2026-09-10" },
  { id: "u7", name: "Katarzyna Wójcik", email: "k.wojcik@example.pl", roles: ["PARTICIPANT"], status: "ACTIVE", created: "2026-09-12" },
  { id: "u8", name: "Robert Krawczyk", email: "r.krawczyk@example.pl", roles: ["PARTICIPANT"], status: "DEACTIVATED", created: "2026-09-15" },
];

export const enrollments = [
  { id: "e1", user: "Jan Kowalski", path: "Podstawy kowalstwa", version: 1, status: "ACTIVE", progress: [2, 33], at: "2026-09-02" },
  { id: "e2", user: "Piotr Zieliński", path: "Podstawy kowalstwa", version: 1, status: "ACTIVE", progress: [5, 33], at: "2026-09-10" },
  { id: "e3", user: "Katarzyna Wójcik", path: "Podstawy kowalstwa", version: 1, status: "ACTIVE", progress: [3, 33], at: "2026-09-12" },
  { id: "e4", user: "Tomasz Lewandowski", path: "Podstawy kowalstwa", version: 1, status: "ACTIVE", progress: [7, 33], at: "2026-09-12" },
  { id: "e5", user: "Robert Krawczyk", path: "Podstawy kowalstwa", version: 1, status: "CANCELLED", progress: [1, 33], at: "2026-09-15" },
  { id: "e6", user: "Magdalena Kamińska", path: "Podstawy kowalstwa", version: 1, status: "ACTIVE", progress: [2, 33], at: "2026-10-01" },
] as const;

export const permissions = [
  { id: "pm1", instructor: "Marek Nowak", scope: "Podstawy kowalstwa v1", kind: "Cała wersja" },
  { id: "pm2", instructor: "Anna Wiśniewska", scope: "Podstawy kowalstwa v1 · Kowalstwo podstawowe", kind: "Etap" },
  { id: "pm3", instructor: "Jan Kowalski", scope: "Podstawy kowalstwa v1 · Kowalstwo podstawowe", kind: "Etap" },
];

export const audit = [
  { at: "2026-10-26 08:02", who: "Jan Kowalski", action: "SUBMISSION_CLAIMED", entity: "Liść · próba 2" },
  { at: "2026-10-25 21:14", who: "Piotr Zieliński", action: "SUBMISSION_SUBMITTED", entity: "Serce · próba 1" },
  { at: "2026-10-25 20:40", who: "Ewa Szymańska", action: "USER_REGISTERED", entity: "Użytkownik" },
  { at: "2026-10-25 19:02", who: "Katarzyna Wójcik", action: "SUBMISSION_SUBMITTED", entity: "Haczyk / zawieszka · próba 3" },
  { at: "2026-10-23 09:12", who: "Marek Nowak", action: "SUBMISSION_ASSESSED", entity: "Haczyk / zawieszka · próba 2" },
  { at: "2026-10-22 11:00", who: "Jan Kowalski", action: "TASK_UPDATED", entity: "Haczyk / zawieszka (wersja 3)" },
  { at: "2026-10-10 16:00", who: "Anna Wiśniewska", action: "COURSE_RESULT_RECORDED", entity: "Kurs Podkowa · Jan Kowalski" },
];

export const assessedByMe = [
  { id: "a1", participant: "Tomasz Lewandowski", task: "Serce [dwa sposoby]", attempt: 1, result: "PASSED", at: "2026-10-22 18:10", photo: p("a1p", 24, "heart") },
  { id: "a2", participant: "Katarzyna Wójcik", task: "Haczyk / zawieszka", attempt: 2, result: "NEEDS_IMPROVEMENT", at: "2026-10-20 09:45", photo: p("a2p", 30, "hook") },
  { id: "a3", participant: "Piotr Zieliński", task: "Haczyk / zawieszka", attempt: 1, result: "PASSED", at: "2026-10-18 20:02", photo: p("a3p", 20, "hook") },
] as const;
