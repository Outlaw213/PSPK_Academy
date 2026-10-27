// Polish names of the audit actions (catalogue in docs/api.md) and of the objects they concern.

export const auditActions: Record<string, string> = {
  USER_REGISTERED: "Rejestracja",
  USER_APPROVED: "Akceptacja konta",
  USER_REJECTED: "Odrzucenie rejestracji",
  USER_CREATED: "Założenie konta przez admina",
  USER_UPDATED: "Zmiana konta",
  USER_PASSWORD_RESET: "Ustawienie hasła przez admina",
  USER_PASSWORD_CHANGED: "Zmiana hasła",
  USER_LOGIN: "Logowanie",
  PATH_CREATED: "Nowa ścieżka",
  PATH_VERSION_CREATED: "Nowa wersja ścieżki",
  PATH_VERSION_UPDATED: "Zmiana wersji ścieżki",
  STAGE_CREATED: "Nowy etap",
  STAGE_UPDATED: "Zmiana etapu",
  TASK_CREATED: "Nowe zadanie",
  TASK_UPDATED: "Nowa wersja treści zadania",
  TASK_DEACTIVATED: "Wyłączenie zadania",
  TASK_ACTIVATED: "Włączenie zadania",
  ORDER_CHANGED: "Zmiana kolejności",
  PATH_ASSIGNED: "Zapis na ścieżkę",
  ENROLLMENT_CANCELLED: "Anulowanie zapisu",
  ENROLLMENT_COMPLETED: "Ukończenie ścieżki",
  PERMISSION_GRANTED: "Nadanie uprawnienia",
  PERMISSION_REVOKED: "Odebranie uprawnienia",
  SUBMISSION_CREATED: "Nowy szkic",
  COURSE_RESULT_RECORDED: "Wpis wyniku kursu",
  QUIZ_ATTEMPTED: "Podejście do quizu",
  SUBMISSION_SUBMITTED: "Wysłanie zgłoszenia",
  SUBMISSION_CANCELLED: "Wycofanie zgłoszenia",
  SUBMISSION_CLAIMED: "Przejęcie zgłoszenia",
  SUBMISSION_RELEASED: "Zwolnienie zgłoszenia",
  SUBMISSION_ASSESSED: "Ocena",
  TASK_PASSED: "Zaliczenie zadania",
  TASK_REJECTED: "Skierowanie do poprawy",
};

const entities: Record<string, string> = {
  user: "konto",
  submission: "zgłoszenie",
  task: "zadanie",
  path: "ścieżka",
  path_version: "wersja ścieżki",
  stage: "etap",
  enrollment: "zapis",
  instructor_permission: "uprawnienie",
};

// Metadata keys written by the backend (app/services/*) and how to show them; ids are left out.
const keys: Record<string, string> = {
  revision: "wersja treści",
  attempt: "próba",
  result: "wynik",
  score: "wynik %",
  passed: "zaliczony",
  added: "dodano",
  name: "nazwa",
  type: "typ",
  position: "pozycja",
  roles: "role",
  reason: "powód",
  via: "przez",
  stages: "etapy w nowej kolejności",
  tasks: "zadania w nowej kolejności",
  changes: "zmiany",
};

const values: Record<string, string> = {
  PASSED: "zaliczone",
  NEEDS_IMPROVEMENT: "do poprawy",
  material: "zdjęcie wzorcowe",
  pdf: "PDF",
  manual: "ręcznie",
  automatic: "automatycznie",
  "permission revoked": "odebrane uprawnienie",
  true: "tak",
  false: "nie",
  PATH_VERSION: "wersja",
  STAGE: "etap",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

const show = (v: unknown): string | null => {
  if (Array.isArray(v)) return v.every((x) => typeof x === "string" && UUID.test(x)) ? String(v.length) : v.map(show).join(", ");
  if (v !== null && typeof v === "object") return Object.keys(v).join(", "); // e.g. which fields changed
  const text = String(v);
  return UUID.test(text) ? null : (values[text] ?? text);
};

/** "zadanie · wersja treści: 4, dodano: PDF" — enough to find the object, without guessing its name. */
export function auditObject(entityType: string, meta: Record<string, unknown>) {
  const details = Object.entries(meta)
    .map(([k, v]) => {
      const value = show(v);
      return value === null || !(k in keys) ? null : `${keys[k]}: ${value}`;
    })
    .filter(Boolean)
    .join(", ");
  return [entities[entityType] ?? entityType, details].filter(Boolean).join(" · ");
}
