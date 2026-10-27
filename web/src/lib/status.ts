import type { SubmissionStatus, TaskStatus, UserStatus } from "../api/types";

export type Tone = "ok" | "warn" | "bad" | "info" | "accent" | "brand" | "muted";

// Labels only. Statuses themselves are always computed by the backend (R11).
export const taskStatus: Record<TaskStatus, { label: string; tone: Tone }> = {
  LOCKED: { label: "Zablokowane", tone: "muted" },
  AVAILABLE: { label: "Dostępne", tone: "accent" },
  IN_PROGRESS: { label: "Szkic", tone: "info" },
  SUBMITTED: { label: "Wysłane", tone: "info" },
  UNDER_REVIEW: { label: "W ocenie", tone: "info" },
  NEEDS_IMPROVEMENT: { label: "Do poprawy", tone: "warn" },
  PASSED: { label: "Zaliczone", tone: "ok" },
};

export const submissionStatus: Record<SubmissionStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Szkic", tone: "info" },
  SUBMITTED: { label: "Czeka na instruktora", tone: "info" },
  UNDER_REVIEW: { label: "W ocenie", tone: "info" },
  NEEDS_IMPROVEMENT: { label: "Do poprawy", tone: "warn" },
  PASSED: { label: "Zaliczone", tone: "ok" },
  CANCELLED: { label: "Wycofane", tone: "muted" },
};

export const userStatus: Record<UserStatus, { label: string; tone: Tone }> = {
  PENDING_APPROVAL: { label: "Czeka na akceptację", tone: "warn" },
  ACTIVE: { label: "Aktywne", tone: "ok" },
  REJECTED: { label: "Odrzucone", tone: "bad" },
  DEACTIVATED: { label: "Dezaktywowane", tone: "muted" },
};

export const roleLabel = { PARTICIPANT: "Uczestnik", INSTRUCTOR: "Instruktor", ADMIN: "Administrator" } as const;

export const taskTypeLabel = { PRACTICAL: "Praca własna", THEORY: "Teoria", QUIZ: "Quiz", COURSE: "Kurs" } as const;

export const durationLong = (days: number) => {
  if (days < 7) return days === 1 ? "1 dzień" : `${days} dni`;
  const w = days / 7;
  return w === 1 ? "1 tydzień" : w < 5 ? `${w} tygodnie` : `${w} tygodni`;
};

export const durationLabel = (days: number) =>
  days >= 7 ? `${days / 7} tyg.` : days === 1 ? "1 dzień" : `${days} dni`;
