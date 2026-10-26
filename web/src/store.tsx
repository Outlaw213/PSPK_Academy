import { createContext, useContext } from "react";
import type { AdminUser, Stage, Submission } from "./mock/data";

export type Route =
  | { name: "paths" }
  | { name: "path" }
  | { name: "task"; taskId: string }
  | { name: "draft"; taskId: string }
  | { name: "history"; taskId?: string }
  | { name: "submission"; id: string }
  | { name: "queue" }
  | { name: "assessed" }
  | { name: "review"; id: string }
  | { name: "users" }
  | { name: "admin-paths" }
  | { name: "version" }
  | { name: "task-edit"; taskId: string }
  | { name: "enrollments" }
  | { name: "permissions" }
  | { name: "audit" };

export interface Draft {
  taskId: string;
  attempt: number;
  comment: string;
  photos: { id: string; url: string; name: string }[];
}

export interface Store {
  stages: Stage[];
  setStages: (f: (s: Stage[]) => Stage[]) => void;
  history: Submission[];
  setHistory: (f: (s: Submission[]) => Submission[]) => void;
  queue: Submission[];
  setQueue: (f: (s: Submission[]) => Submission[]) => void;
  users: AdminUser[];
  setUsers: (f: (s: AdminUser[]) => AdminUser[]) => void;
  draft: Draft | null;
  setDraft: (d: Draft | null) => void;
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

export const allTasks = (stages: Stage[]) => stages.flatMap((s) => s.tasks.map((t) => ({ ...t, stage: s })));
