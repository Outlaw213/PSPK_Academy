// Navigation and toasts shared by every screen. All data comes from the API (docs/api.md).
import { createContext, useContext } from "react";
import type { TaskType } from "./api/types";

/** Quiz as edited in the builder, before it is saved: previewed in the browser only. */
export interface QuizDraft {
  name: string;
  threshold: number;
  questions: { text: string; kind: "SINGLE" | "MULTI"; options: { text: string; is_correct: boolean }[] }[];
}

export type Route =
  | { name: "paths" }
  | { name: "path"; versionId: string }
  | { name: "task"; taskId: string }
  | { name: "draft"; taskId: string; submissionId: string }
  | { name: "history" }
  | { name: "submission"; id: string }
  | { name: "queue" }
  | { name: "assessed" }
  | { name: "review"; id: string }
  | { name: "quiz"; taskId: string }
  | { name: "courses" }
  | { name: "course"; taskId: string }
  | { name: "users" }
  | { name: "admin-paths" }
  | { name: "version"; versionId: string }
  | { name: "task-edit"; taskId: string }
  | { name: "task-new"; stageId: string; type: TaskType; title: string }
  | { name: "enrollments" }
  | { name: "permissions" }
  | { name: "audit" }
  | { name: "admin-submission"; id: string };

export interface Store {
  toast: (msg: string) => void;
  push: (r: Route) => void;
  pop: () => void;
}

export const StoreContext = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(StoreContext);
  if (!s) throw new Error("StoreContext missing");
  return s;
}
