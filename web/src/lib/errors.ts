import { ApiError } from "../api/client";

// Polish texts for API error codes (the codes themselves stay English — docs/api.md).
const messages: Record<string, string> = {
  INVALID_CREDENTIALS: "Nieprawidłowy e-mail lub hasło.",
  ACCOUNT_PENDING_APPROVAL: "Konto czeka na akceptację administratora.",
  ACCOUNT_INACTIVE: "Konto jest nieaktywne. Skontaktuj się z administratorem PSPK.",
  EMAIL_ALREADY_EXISTS: "Konto z tym adresem e-mail już istnieje.",
  CANNOT_MODIFY_SELF: "Nie możesz dezaktywować siebie ani odebrać sobie roli administratora.",
  ALREADY_ENROLLED: "Ten uczestnik jest już zapisany na tę ścieżkę.",
  PATH_VERSION_INACTIVE: "Ta wersja ścieżki nie przyjmuje zapisów.",
  USER_NOT_PARTICIPANT: "Zapisać można tylko osobę z rolą Uczestnik.",
  USER_NOT_INSTRUCTOR: "Uprawnienie można nadać tylko osobie z rolą Instruktor.",
  PERMISSION_EXISTS: "Takie uprawnienie już istnieje.",
  QUIZ_INVALID: "Quiz potrzebuje pytań, każde z co najmniej dwiema odpowiedziami i poprawną odpowiedzią.",
  ORDER_MISMATCH: "Lista zmieniła się w międzyczasie. Odśwież i spróbuj ponownie.",
  STAGE_OUTSIDE_VERSION: "Zadanie można przenieść tylko do etapu tej samej wersji.",
  TASK_HAS_PENDING_SUBMISSIONS: "Nie można wyłączyć zadania, które ma zgłoszenia czekające na ocenę.",
  UNKNOWN_FILE: "Ten plik nie należy do tego zadania.",
  ATTACHMENT_TOO_LARGE: "PDF jest za duży (maks. 20 MB).",
  INVALID_ATTACHMENT_TYPE: "Dozwolone są tylko pliki PDF.",
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
  NOT_ASSIGNED_INSTRUCTOR: "To zgłoszenie ocenia inny instruktor.",
  INSTRUCTOR_NOT_AUTHORIZED: "Nie masz uprawnień do tej ścieżki lub etapu.",
  SELF_ASSESSMENT_FORBIDDEN: "Nie możesz oceniać własnych prób.",
  ASSESSMENT_COMMENT_REQUIRED: "Napisz, co uczestnik ma poprawić.",
  TASK_NOT_COURSE: "To zadanie nie jest kursem.",
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
