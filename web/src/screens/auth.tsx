import { useState, type ChangeEvent, type FormEvent } from "react";
import { Hourglass } from "lucide-react";
import { Button, Field, inputClass, Segmented } from "../components/ui";
import logoUrl from "../assets/logo-pspk.png";
import { post } from "../api/client";
import { useSession } from "../api/session";
import { errorText } from "../lib/errors";

export function Logo({ size = 56 }: { size?: number }) {
  // Black-on-white PSPK seal: kept on a light disc in both themes instead of being inverted.
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.12)] ring-1 ring-black/5" style={{ width: size, height: size }}>
      <img src={logoUrl} alt="Polskie Stowarzyszenie Pasjonatów Kowalstwa" className="size-[92%]" />
    </span>
  );
}

export function AuthScreen() {
  const { login } = useSession();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", first_name: "", last_name: "" });
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pwShort = mode === "register" && form.password.length < 10;
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    setError(null);
    if (mode === "register" && (pwShort || !form.first_name.trim() || !form.last_name.trim())) return;
    setBusy(true);
    try {
      if (mode === "login") await login(form.email.trim(), form.password);
      else {
        await post("/auth/register", { ...form, email: form.email.trim() });
        setPending(true);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center px-[max(16px,env(safe-area-inset-left,0px))] py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo size={112} />
          <div>
            <h1 className="font-display text-large-title">Akademia</h1>
            <p className="text-subhead text-fg-2">Polskie Stowarzyszenie Pasjonatów Kowalstwa</p>
          </div>
        </div>

        {pending ? (
          <div className="flex w-full flex-col items-center gap-3 rounded-card bg-bg-2 p-6 text-center" role="status">
            <span className="grid size-12 place-items-center rounded-full bg-warn/14 text-warn">
              <Hourglass size={22} aria-hidden />
            </span>
            <h2 className="text-headline">Konto czeka na akceptację</h2>
            <p className="text-subhead text-fg-2">Administrator PSPK sprawdzi zgłoszenie. Zalogujesz się, gdy konto zostanie zatwierdzone.</p>
            <Button variant="plain" onClick={() => (setPending(false), setMode("login"), setForm({ ...form, password: "" }))}>
              Wróć do logowania
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex w-full flex-col gap-4" noValidate>
            <Segmented
              label="Logowanie lub rejestracja"
              value={mode}
              onChange={(m) => (setMode(m), setTried(false), setError(null))}
              options={[
                { value: "login", label: "Zaloguj się" },
                { value: "register", label: "Załóż konto" },
              ]}
            />
            {mode === "register" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Imię" error={tried && !form.first_name.trim() ? "Podaj imię." : undefined}>
                  {(id) => <input id={id} autoComplete="given-name" value={form.first_name} onChange={set("first_name")} className={inputClass + " bg-bg-2"} />}
                </Field>
                <Field label="Nazwisko" error={tried && !form.last_name.trim() ? "Podaj nazwisko." : undefined}>
                  {(id) => <input id={id} autoComplete="family-name" value={form.last_name} onChange={set("last_name")} className={inputClass + " bg-bg-2"} />}
                </Field>
              </div>
            )}
            <Field label="E-mail">
              {(id) => <input id={id} type="email" autoComplete="email" value={form.email} onChange={set("email")} className={inputClass + " bg-bg-2"} />}
            </Field>
            <Field label="Hasło" hint={mode === "register" ? "Co najmniej 10 znaków" : undefined} error={tried && pwShort ? "Hasło musi mieć co najmniej 10 znaków." : undefined}>
              {(id) => (
                <input
                  id={id}
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={form.password}
                  aria-invalid={tried && pwShort}
                  onChange={set("password")}
                  className={inputClass + " bg-bg-2"}
                />
              )}
            </Field>
            {error && (
              <p className="rounded-ctl bg-bad/8 px-4 py-3 text-subhead text-bad" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="mt-2" disabled={busy}>
              {mode === "login" ? "Zaloguj się" : "Załóż konto"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
