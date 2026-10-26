// Example data for the design mockup only. In the real panel (M12) all of this,
// including every task status, comes from the backend API (docs/api.md).

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

export type TaskType = "PRACTICAL" | "THEORY" | "QUIZ";

/** Placeholder "photo": a hue + motif, rendered as a forged-steel swatch. */
export interface Photo {
  id: string;
  tone: number;
  motif: "hook" | "nail" | "scroll" | "tongs" | "fire" | "anvil";
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
  expectedDays?: number;
  quantity?: string;
  material?: string;
  description: string;
  instructions: string[];
  assignment: string;
  criteria: string[];
  requirements: string;
  reference?: { photo: Photo; caption: string }[];
  difficulty?: number;
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
}

export const me = {
  firstName: "Jan",
  lastName: "Kowalski",
  email: "jan.kowalski@example.pl",
  roles: ["PARTICIPANT", "INSTRUCTOR", "ADMIN"] as Role[],
};

const p = (id: string, tone: number, motif: Photo["motif"]): Photo => ({ id, tone, motif });

export const stages: Stage[] = [
  {
    id: "s1",
    position: 1,
    name: "Bezpieczeństwo",
    tasks: [
      {
        id: "t1",
        position: 1,
        name: "Zasady bezpiecznej pracy w kuźni",
        code: "TEORIA 01",
        type: "THEORY",
        status: "PASSED",
        revision: 2,
        expectedDays: 7,
        description: "Poznanie zagrożeń w kuźni i środków ochrony osobistej.",
        instructions: [
          "Przeczytaj regulamin kuźni PSPK.",
          "Opisz własnymi słowami pięć najczęstszych zagrożeń.",
          "Wymień środki ochrony, których używasz przy palenisku.",
        ],
        assignment: "Krótka notatka (pół strony) o zagrożeniach i ochronie.",
        criteria: ["Kompletność listy zagrożeń", "Znajomość środków ochrony osobistej"],
        requirements: "Komentarz z notatką albo zdjęcie notatki.",
      },
      {
        id: "t2",
        position: 2,
        name: "Przygotowanie stanowiska",
        code: "PRACA WŁASNA 01",
        type: "PRACTICAL",
        status: "PASSED",
        revision: 1,
        expectedDays: 7,
        description: "Uporządkowanie stanowiska: palenisko, kowadło, narzędzia w zasięgu ręki.",
        instructions: [
          "Ustaw kowadło na wysokości kostek dłoni.",
          "Rozłóż narzędzia po stronie ręki roboczej.",
          "Przygotuj wiadro z wodą i gaśnicę.",
        ],
        assignment: "Przygotuj stanowisko i sfotografuj je z dwóch stron.",
        criteria: ["Wysokość kowadła", "Dostęp do wody i gaśnicy", "Porządek wokół paleniska"],
        requirements: "Minimum 2 zdjęcia stanowiska.",
      },
    ],
  },
  {
    id: "s2",
    position: 2,
    name: "Narzędzia",
    tasks: [
      {
        id: "t3",
        position: 1,
        name: "Rozpalanie i prowadzenie paleniska",
        code: "PRACA WŁASNA 01a",
        type: "PRACTICAL",
        status: "PASSED",
        revision: 1,
        expectedDays: 7,
        description: "Utrzymanie stabilnego, czystego ognia przez całą sesję.",
        instructions: ["Rozpal palenisko.", "Zbuduj gniazdo żaru.", "Utrzymaj ogień przez 60 minut."],
        assignment: "Zdjęcie paleniska w pełnym żarze.",
        criteria: ["Czysty ogień bez dymu", "Głęboki żar"],
        requirements: "Minimum 1 zdjęcie.",
      },
      {
        id: "t4",
        position: 2,
        name: "Haczyk / zawieszka",
        code: "PRACA WŁASNA 02",
        type: "PRACTICAL",
        status: "NEEDS_IMPROVEMENT",
        revision: 3,
        expectedDays: 14,
        quantity: "2 sztuki",
        material: "płaskownik 30–50 × 3–5 mm lub pręt Ø 8–10 mm, stal S235",
        difficulty: 2,
        description:
          "Nauka wyciągania, zwijania końcówki i gięcia na rogu kowadła. Dwa egzemplarze sprawdzają powtarzalność.",
        instructions: [
          "Wyciągnij końcówkę na długości 6–8 cm do przekroju kwadratowego.",
          "Zaokrąglij i zwiń końcówkę w małe oczko.",
          "Rozklep część środkową na płasko pod otwór montażowy.",
          "Przebij otwór na gorąco przebijakiem.",
          "Zegnij hak na rogu kowadła.",
          "Wyrównaj i oczyść szczotką drucianą.",
        ],
        assignment: "Wykonaj dwa haczyki o możliwie zbliżonym kształcie i wymiarach.",
        criteria: [
          "Równomierne wyciągnięcie bez zakładek",
          "Płynny łuk haka bez załamań",
          "Otwór na osi, bez pęknięć",
          "Podobieństwo obu egzemplarzy",
        ],
        requirements: "Zdjęcia obu egzemplarzy obok siebie, z boku i z góry. Minimum 2 zdjęcia.",
        reference: [
          { photo: p("r1", 22, "hook"), caption: "Wymagane: 2 podobne egzemplarze" },
          { photo: p("r2", 30, "hook"), caption: "Zbliżenie zwiniętej końcówki" },
        ],
      },
      {
        id: "t5",
        position: 3,
        name: "Gwóźdź kuty",
        code: "PRACA WŁASNA 03",
        type: "PRACTICAL",
        status: "LOCKED",
        revision: 1,
        expectedDays: 14,
        quantity: "5 sztuk",
        material: "pręt kwadratowy 8 × 8 mm",
        description: "Wyciąganie ostrza i formowanie łba w gwoździowni.",
        instructions: ["Wyciągnij ostrze.", "Podetnij pręt.", "Uformuj łeb w gwoździowni."],
        assignment: "Pięć gwoździ o równej długości.",
        criteria: ["Ostre, proste ostrze", "Symetryczny łeb"],
        requirements: "Minimum 1 zdjęcie wszystkich egzemplarzy.",
      },
    ],
  },
  {
    id: "s3",
    position: 3,
    name: "Podstawowe operacje",
    tasks: [
      {
        id: "t6",
        position: 1,
        name: "Ślimacznica (zwój)",
        code: "PRACA WŁASNA 04",
        type: "PRACTICAL",
        status: "LOCKED",
        revision: 1,
        description: "Zwijanie spirali z wyciągniętego końca.",
        instructions: ["Wyciągnij koniec stożkowo.", "Zwiń spiralę na krawędzi kowadła."],
        assignment: "Jedna ślimacznica o trzech zwojach.",
        criteria: ["Równe odstępy zwojów"],
        requirements: "Minimum 1 zdjęcie.",
      },
      {
        id: "t7",
        position: 2,
        name: "Skręcanie pręta",
        code: "PRACA WŁASNA 05",
        type: "PRACTICAL",
        status: "LOCKED",
        revision: 1,
        description: "Równomierne skręcenie pręta kwadratowego na gorąco.",
        instructions: ["Nagrzej odcinek równomiernie.", "Skręć w imadle kluczem."],
        assignment: "Pręt z dwoma skręconymi odcinkami.",
        criteria: ["Równy skok skrętu"],
        requirements: "Minimum 1 zdjęcie.",
      },
      {
        id: "t8",
        position: 3,
        name: "Test wiedzy: gatunki stali",
        code: "QUIZ 01",
        type: "QUIZ",
        status: "LOCKED",
        revision: 1,
        description: "Sprawdzenie znajomości podstawowych gatunków stali.",
        instructions: ["Odpowiedz na pytania z karty."],
        assignment: "Odpowiedzi w komentarzu.",
        criteria: ["Poprawność odpowiedzi"],
        requirements: "Komentarz z odpowiedziami.",
      },
    ],
  },
];

export const myHistory: Submission[] = [
  {
    id: "sub-12",
    taskId: "t4",
    taskName: "Haczyk / zawieszka",
    taskCode: "PRACA WŁASNA 02",
    participant: "Jan Kowalski",
    attempt: 2,
    status: "NEEDS_IMPROVEMENT",
    comment: "Druga próba, poprawiłem otwór.",
    photos: [p("h21", 18, "hook"), p("h22", 26, "hook"), p("h23", 34, "hook")],
    submittedAt: "2026-10-21 18:40",
    instructor: "Marek Nowak",
    revision: 3,
    stageName: "Narzędzia",
    assessment: {
      result: "NEEDS_IMPROVEMENT",
      comment:
        "Otwór już na osi, dobrze. Łuk haka w drugim egzemplarzu załamany przy nasadzie — grzej dłużej przed gięciem i giń na rogu, nie na krawędzi.",
      instructor: "Marek Nowak",
      at: "2026-10-23 09:12",
    },
  },
  {
    id: "sub-9",
    taskId: "t4",
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
    stageName: "Narzędzia",
    assessment: {
      result: "NEEDS_IMPROVEMENT",
      comment: "Otwór przesunięty od osi, pęknięcie przy krawędzi. Przebijaj w pełnym żarze, z obu stron.",
      instructor: "Marek Nowak",
      at: "2026-10-14 08:30",
    },
  },
  {
    id: "sub-5",
    taskId: "t3",
    taskName: "Rozpalanie i prowadzenie paleniska",
    taskCode: "PRACA WŁASNA 01a",
    participant: "Jan Kowalski",
    attempt: 1,
    status: "PASSED",
    comment: "Węgiel kamienny, sesja 70 min.",
    photos: [p("f1", 12, "fire")],
    submittedAt: "2026-10-04 17:00",
    instructor: "Anna Wiśniewska",
    revision: 1,
    stageName: "Narzędzia",
    assessment: { result: "PASSED", comment: "Ładne gniazdo żaru.", instructor: "Anna Wiśniewska", at: "2026-10-05 10:00" },
  },
];

export const queue: Submission[] = [
  {
    id: "sub-31",
    taskId: "t5",
    taskName: "Gwóźdź kuty",
    taskCode: "PRACA WŁASNA 03",
    participant: "Piotr Zieliński",
    attempt: 1,
    status: "SUBMITTED",
    comment: "Pięć gwoździ, jeden krzywy — zostawiłem do porównania.",
    photos: [p("q1", 24, "nail"), p("q2", 32, "nail"), p("q3", 16, "anvil")],
    submittedAt: "2026-10-25 21:14",
    revision: 1,
    stageName: "Narzędzia",
  },
  {
    id: "sub-30",
    taskId: "t4",
    taskName: "Haczyk / zawieszka",
    taskCode: "PRACA WŁASNA 02",
    participant: "Katarzyna Wójcik",
    attempt: 3,
    status: "SUBMITTED",
    comment: "Trzecie podejście, tym razem pręt Ø 10.",
    photos: [p("q4", 20, "hook"), p("q5", 28, "hook")],
    submittedAt: "2026-10-25 19:02",
    revision: 3,
    stageName: "Narzędzia",
  },
  {
    id: "sub-28",
    taskId: "t6",
    taskName: "Ślimacznica (zwój)",
    taskCode: "PRACA WŁASNA 04",
    participant: "Tomasz Lewandowski",
    attempt: 2,
    status: "UNDER_REVIEW",
    comment: "",
    photos: [p("q6", 26, "scroll"), p("q7", 36, "scroll")],
    submittedAt: "2026-10-24 16:45",
    instructor: "Jan Kowalski",
    revision: 1,
    stageName: "Podstawowe operacje",
  },
  {
    id: "sub-27",
    taskId: "t2",
    taskName: "Przygotowanie stanowiska",
    taskCode: "PRACA WŁASNA 01",
    participant: "Magdalena Kamińska",
    attempt: 1,
    status: "SUBMITTED",
    comment: "Kowadło na pniu dębowym.",
    photos: [p("q8", 10, "anvil"), p("q9", 18, "tongs")],
    submittedAt: "2026-10-24 12:30",
    revision: 1,
    stageName: "Bezpieczeństwo",
  },
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
  { id: "e1", user: "Jan Kowalski", path: "Podstawy kowalstwa", version: 1, status: "ACTIVE", progress: [3, 8], at: "2026-09-02" },
  { id: "e2", user: "Piotr Zieliński", path: "Podstawy kowalstwa", version: 1, status: "ACTIVE", progress: [4, 8], at: "2026-09-10" },
  { id: "e3", user: "Katarzyna Wójcik", path: "Podstawy kowalstwa", version: 1, status: "ACTIVE", progress: [3, 8], at: "2026-09-12" },
  { id: "e4", user: "Tomasz Lewandowski", path: "Podstawy kowalstwa", version: 1, status: "ACTIVE", progress: [5, 8], at: "2026-09-12" },
  { id: "e5", user: "Robert Krawczyk", path: "Podstawy kowalstwa", version: 1, status: "CANCELLED", progress: [1, 8], at: "2026-09-15" },
  { id: "e6", user: "Anna Wiśniewska", path: "Ostrza i noże", version: 1, status: "COMPLETED", progress: [12, 12], at: "2026-06-01" },
] as const;

export const permissions = [
  { id: "pm1", instructor: "Marek Nowak", scope: "Podstawy kowalstwa v1", kind: "Cała wersja" },
  { id: "pm2", instructor: "Anna Wiśniewska", scope: "Podstawy kowalstwa v1 · Narzędzia", kind: "Etap" },
  { id: "pm3", instructor: "Jan Kowalski", scope: "Podstawy kowalstwa v1 · Podstawowe operacje", kind: "Etap" },
];

export const audit = [
  { at: "2026-10-26 08:02", who: "Marek Nowak", action: "SUBMISSION_CLAIMED", entity: "Zgłoszenie #28" },
  { at: "2026-10-25 21:14", who: "Piotr Zieliński", action: "SUBMISSION_SUBMITTED", entity: "Zgłoszenie #31" },
  { at: "2026-10-25 20:40", who: "Ewa Szymańska", action: "USER_REGISTERED", entity: "Użytkownik" },
  { at: "2026-10-25 19:02", who: "Katarzyna Wójcik", action: "SUBMISSION_SUBMITTED", entity: "Zgłoszenie #30" },
  { at: "2026-10-23 09:12", who: "Marek Nowak", action: "SUBMISSION_ASSESSED", entity: "Zgłoszenie #12" },
  { at: "2026-10-22 11:00", who: "Jan Kowalski", action: "TASK_UPDATED", entity: "Haczyk / zawieszka (rew. 3)" },
  { at: "2026-10-20 15:30", who: "Jan Kowalski", action: "PERMISSION_GRANTED", entity: "Anna Wiśniewska · Narzędzia" },
];

export const assessedByMe = [
  { id: "a1", participant: "Tomasz Lewandowski", task: "Gwóźdź kuty", attempt: 1, result: "PASSED", at: "2026-10-22 18:10", photo: p("a1p", 24, "nail") },
  { id: "a2", participant: "Katarzyna Wójcik", task: "Haczyk / zawieszka", attempt: 2, result: "NEEDS_IMPROVEMENT", at: "2026-10-20 09:45", photo: p("a2p", 30, "hook") },
  { id: "a3", participant: "Piotr Zieliński", task: "Haczyk / zawieszka", attempt: 1, result: "PASSED", at: "2026-10-18 20:02", photo: p("a3p", 20, "hook") },
] as const;
