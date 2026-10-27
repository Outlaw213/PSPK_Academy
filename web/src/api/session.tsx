import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as client from "./client";
import type { Tokens, User } from "./types";

interface Session {
  /** undefined while the saved session (cookie) is being checked on start. */
  user: User | null | undefined;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    client.onSessionExpired(() => setUser(null));
    // A reload keeps you logged in: the HttpOnly cookie gives a new access token (ADR-26).
    client
      .refreshSession()
      .then((ok) => (ok ? client.get<User>("/auth/me") : null))
      .then(setUser, () => setUser(null));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await client.login(email, password);
    setUser(await client.get<User>("/auth/me"));
  }, []);

  const logout = useCallback(async () => {
    await client.logout();
    setUser(null);
  }, []);

  const changePassword = useCallback(async (current: string, next: string) => {
    const t = await client.post<Tokens>("/auth/change-password", { current_password: current, new_password: next });
    client.setAccessToken(t.access_token); // other sessions are revoked, this one continues (Q-38)
  }, []);

  const value = useMemo(() => ({ user, login, logout, changePassword }), [user, login, logout, changePassword]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const s = useContext(SessionContext);
  if (!s) throw new Error("SessionProvider missing");
  return s;
}
