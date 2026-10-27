// The only way the panel talks to the backend (ADR-26, ADR-27).
// The access token lives in memory only; the refresh token is an HttpOnly cookie the page cannot read.

import type { Tokens } from "./types";

const BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: unknown = null,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionLost: () => void = () => {};

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function onSessionExpired(fn: () => void) {
  onSessionLost = fn;
}

async function raise(res: Response): Promise<never> {
  let body: { error?: { code?: string; message?: string; details?: unknown } } = {};
  try {
    body = await res.json();
  } catch {
    /* not JSON: proxy or network error page */
  }
  throw new ApiError(res.status, body.error?.code ?? "NETWORK_ERROR", body.error?.message ?? res.statusText, body.error?.details);
}

/** One refresh at a time: parallel 401s wait for the same attempt instead of burning the rotating token. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: "POST", headers: { "X-Client": "web" }, credentials: "same-origin" });
      if (!res.ok) return false;
      accessToken = ((await res.json()) as Tokens).access_token;
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function send(method: string, path: string, body?: BodyInit, json = false, retry = true): Promise<Response> {
  const headers: Record<string, string> = { "X-Client": "web" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (json) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body, credentials: "same-origin" });
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    if (await refreshSession()) return send(method, path, body, json, false);
    accessToken = null;
    onSessionLost();
  }
  if (!res.ok) await raise(res);
  return res;
}

export async function api<T>(method: string, path: string, data?: unknown): Promise<T> {
  const res = await send(method, path, data === undefined ? undefined : JSON.stringify(data), data !== undefined);
  return (res.status === 204 ? null : await res.json()) as T;
}

export const get = <T>(path: string) => api<T>("GET", path);
export const post = <T>(path: string, data?: unknown) => api<T>("POST", path, data);
export const patch = <T>(path: string, data?: unknown) => api<T>("PATCH", path, data);
export const put = <T>(path: string, data?: unknown) => api<T>("PUT", path, data);
export const del = (path: string) => api<null>("DELETE", path);

/** Multipart upload (one file per request, field `file`). */
export async function upload<T>(path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", file);
  return (await (await send("POST", path, form)).json()) as T;
}

/** A protected file (photo, PDF): fetched with the token, never with the token in the URL. */
export async function blob(path: string): Promise<Blob> {
  return (await send("GET", path)).blob();
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "X-Client": "web", "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    credentials: "same-origin",
  });
  if (!res.ok) await raise(res);
  accessToken = ((await res.json()) as Tokens).access_token;
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${BASE}/auth/logout`, { method: "POST", headers: { "X-Client": "web" }, credentials: "same-origin" });
  } finally {
    accessToken = null;
  }
}
