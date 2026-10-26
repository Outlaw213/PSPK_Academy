import type { SubmissionStatus, TaskStatus, UserStatus } from "../mock/data";

export type Tone = "ok" | "warn" | "bad" | "info" | "accent" | "muted";

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

export const taskTypeLabel = { PRACTICAL: "Praktyczne", THEORY: "Teoria", QUIZ: "Quiz" } as const;
