// Navigation, toasts, and the sample data of the path builder, not yet connected to the API (M12c2).
import { createContext, useContext } from "react";
import type { Stage } from "./mock/data";

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
  | { name: "quiz"; taskId: string; preview?: boolean }
  | { name: "courses" }
  | { name: "course"; taskId: string }
  | { name: "users" }
  | { name: "admin-paths" }
  | { name: "version" }
  | { name: "task-edit"; taskId: string }
  | { name: "enrollments" }
  | { name: "permissions" }
  | { name: "audit" }
  | { name: "admin-submission"; id: string };

export interface Store {
  stages: Stage[];
  setStages: (f: (s: Stage[]) => Stage[]) => void;
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

/** Mock only: in the connected panel the label always comes from the API (BR-34). */
export const taskLabel = (stage: { position: number }, task: { position: number }) => `E${stage.position}.${task.position}`;

export const allTasks = (stages: Stage[]) => stages.flatMap((s) => s.tasks.map((t) => ({ ...t, stage: s, label: taskLabel(s, t) })));

/** Current label of a task by id; history shows today's numbering (Q-64). */
export const labelOf = (stages: Stage[], taskId: string) => allTasks(stages).find((t) => t.id === taskId)?.label ?? "";
