// API shortcuts for test setup. The browser part of each test only uses what a person sees.
import { readFileSync } from "node:fs";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const PASSWORD = process.env.SEED_PASSWORD ?? "";
const API = "/api/v1";
export const ADMIN = "admin@akademia.example";
export const INSTRUCTOR = "instruktor@akademia.example";
export const PHOTO = readFileSync(new URL("./fixtures/gwozdz.jpg", import.meta.url));

type Json = Record<string, unknown>;

export async function token(request: APIRequestContext, email: string, password = PASSWORD): Promise<string> {
  const r = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(r.ok(), `login ${email}`).toBeTruthy();
  return (await r.json()).access_token;
}

export async function call<T = Json>(request: APIRequestContext, tok: string, method: string, path: string, data?: unknown, expected = 0) {
  const r = await request.fetch(`${API}${path}`, { method, data: data as Json, headers: { Authorization: `Bearer ${tok}` } });
  if (expected) expect(r.status(), `${method} ${path}`).toBe(expected);
  else expect(r.ok(), `${method} ${path}: ${r.status()} ${await r.text()}`).toBeTruthy();
  return (r.status() === 204 ? null : await r.json()) as T;
}

export interface TestParticipant {
  email: string;
  password: string;
  token: string;
  versionId: string;
  tasks: Record<string, string>; // name → id
}

/** A fresh participant enrolled in "Podstawy kowalstwa", so every test starts from the first task. */
export async function newParticipant(request: APIRequestContext, first = "Ewa"): Promise<TestParticipant> {
  const admin = await token(request, ADMIN);
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@akademia.example`;
  const password = "haslo-testowe-e2e-2026";
  const user = await call<{ id: string }>(request, admin, "POST", "/admin/users", { email, password, first_name: first, last_name: "Testowa", roles: ["PARTICIPANT"] });
  const paths = await call<{ items: { id: string; name: string }[] }>(request, admin, "GET", "/admin/paths");
  const path = paths.items.find((p) => p.name === "Podstawy kowalstwa")!;
  const detail = await call<{ versions: { id: string }[] }>(request, admin, "GET", `/admin/paths/${path.id}`);
  const versionId = detail.versions[0].id;
  await call(request, admin, "POST", "/admin/enrollments", { user_id: user.id, path_version_id: versionId });
  const tok = await token(request, email, password);
  const progress = await call<{ stages: { tasks: { id: string; name: string }[] }[] }>(request, tok, "GET", `/me/paths/${versionId}/progress`);
  const tasks = Object.fromEntries(progress.stages.flatMap((s) => s.tasks.map((t) => [t.name, t.id])));
  return { email, password, token: tok, versionId, tasks };
}

/** Participant sends an attempt (comment, optional photo); the seeded instructor claims and assesses it. */
export async function sendAndAssess(request: APIRequestContext, p: TestParticipant, task: string, result: "PASSED" | "NEEDS_IMPROVEMENT", comment?: string) {
  const draft = await call<{ id: string }>(request, p.token, "POST", `/tasks/${p.tasks[task]}/submissions`, { comment: "Odpowiedź" });
  const up = await request.post(`${API}/submissions/${draft.id}/photos`, {
    headers: { Authorization: `Bearer ${p.token}` },
    multipart: { file: { name: "gwozdz.jpg", mimeType: "image/jpeg", buffer: PHOTO } },
  });
  expect(up.ok()).toBeTruthy();
  await call(request, p.token, "POST", `/submissions/${draft.id}/submit`);
  const ins = await token(request, INSTRUCTOR);
  await call(request, ins, "POST", `/submissions/${draft.id}/claim`);
  await call(request, ins, "POST", `/submissions/${draft.id}/assessment`, { result, comment: comment ?? null }, 201);
}

export async function uiLogin(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Moje ścieżki" })).toBeVisible();
}

/** The visible navigation item (tab bar on phones, sidebar on desktop). */
export const nav = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).filter({ visible: true }).first();

export const title = (page: Page, name: string | RegExp) => page.getByRole("heading", { level: 1, name });

export async function shot(page: Page, name: string, project: string) {
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `e2e/screenshots/${project}-${name}.png`, fullPage: false });
}
