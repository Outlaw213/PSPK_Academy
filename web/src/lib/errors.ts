import { ApiError } from "../api/client";

// Polish texts for API error codes (the codes themselves stay English — docs/api.md).
const messages: Record<string, string> = {
  INVALID_CREDENTIALS: "Nieprawidłowy e-mail lub hasło.",
  ACCOUNT_PENDING_APPROVAL: "Konto czeka na akceptację administratora.",
  ACCOUNT_INACTIVE: "Konto jest nieaktywne. Skontaktuj się z administratorem PSPK.",
  EMAIL_ALREADY_EXISTS: "Konto z tym adresem e-mail już istnieje.",
  INVALID_TOKEN: "Sesja wygasła. Zaloguj się ponownie.",
  UNAUTHENTICATED: "Sesja wygasła. Zaloguj się ponownie.",
  VALIDATION_ERROR: "Sprawdź wpisane dane.",
  NOT_FOUND: "Nie znaleziono.",
  FORBIDDEN: "Brak dostępu.",
  NO_ACTIVE_ENROLLMENT: "Twój zapis na tę ścieżkę nie jest aktywny.",
  TASK_LOCKED: "Zadanie jest zablokowane — najpierw zalicz poprzednie.",
  TASK_ALREADY_PASSED: "To zadanie jest już zaliczone.",
  SUBMISSION_PENDING: "Masz już otwartą próbę tego zadania.",
  SUBMISSION_ALREADY_CLAIMED: "Instruktor już ocenia to zgłoszenie.",
  SUBMISSION_REQUIREMENTS_NOT_MET: "Dodaj zdjęcia lub komentarz wymagane w tym zadaniu.",
  INVALID_STATE_TRANSITION: "Tej próby nie można już zmienić.",
  TOO_MANY_PHOTOS: "Limit to 10 zdjęć w jednej próbie.",
  INVALID_PHOTO_TYPE: "Dozwolone są tylko zdjęcia JPEG, PNG lub WebP.",
  PHOTO_TOO_LARGE: "Zdjęcie jest za duże (maks. 10 MB).",
  QUIZ_ANSWERS_INVALID: "Odpowiedz na każde pytanie.",
  TASK_IS_COURSE: "Wynik kursu wpisuje instruktor.",
  TASK_IS_QUIZ: "Quiz rozwiązuje się w całości, bez szkicu.",
  CONCURRENT_UPDATE: "Ktoś zmienił te dane w tej samej chwili. Spróbuj ponownie.",
  NETWORK_ERROR: "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.",
  INTERNAL_ERROR: "Błąd serwera. Spróbuj ponownie za chwilę.",
};

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return messages[e.code] ?? `Nie udało się (${e.code}).`;
  if (e instanceof TypeError) return messages.NETWORK_ERROR; // fetch failed
  return "Coś poszło nie tak.";
}
