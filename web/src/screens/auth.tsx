import { useState, type FormEvent } from "react";
import { Hourglass } from "lucide-react";
import { Button, Field, inputClass, Segmented } from "../components/ui";
import logoUrl from "../assets/logo-pspk.png";

export function Logo({ size = 56 }: { size?: number }) {
  // Black-on-white PSPK seal: kept on a light disc in both themes instead of being inverted.
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.12)] ring-1 ring-black/5" style={{ width: size, height: size }}>
      <img src={logoUrl} alt="Polskie Stowarzyszenie Pasjonatów Kowalstwa" className="size-[92%]" />
    </span>
  );
}

export function AuthScreen({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [pending, setPending] = useState(false);
  const [pw, setPw] = useState("");
  const [tried, setTried] = useState(false);
  const pwShort = mode === "register" && pw.length < 10;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (mode === "login") return onLogin();
    if (!pwShort) setPending(true);
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
          <div className="flex w-full flex-col items-center gap-3 rounded-card bg-bg-2 p-6 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-warn/14 text-warn">
              <Hourglass size={22} aria-hidden />
            </span>
            <h2 className="text-headline">Konto czeka na akceptację</h2>
            <p className="text-subhead text-fg-2">Administrator PSPK sprawdzi zgłoszenie. Zalogujesz się, gdy konto zostanie zatwierdzone.</p>
            <Button variant="plain" onClick={() => (setPending(false), setMode("login"))}>
              Wróć do logowania
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex w-full flex-col gap-4" noValidate>
            <Segmented
              label="Logowanie lub rejestracja"
              value={mode}
              onChange={(m) => (setMode(m), setTried(false))}
              options={[
                { value: "login", label: "Zaloguj się" },
                { value: "register", label: "Załóż konto" },
              ]}
            />
            {mode === "register" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Imię">{(id) => <input id={id} autoComplete="given-name" className={inputClass + " bg-bg-2"} />}</Field>
                <Field label="Nazwisko">{(id) => <input id={id} autoComplete="family-name" className={inputClass + " bg-bg-2"} />}</Field>
              </div>
            )}
            <Field label="E-mail">
              {(id) => <input id={id} type="email" autoComplete="email" defaultValue="jan.kowalski@example.pl" className={inputClass + " bg-bg-2"} />}
            </Field>
            <Field label="Hasło" hint={mode === "register" ? "Co najmniej 10 znaków" : undefined} error={tried && pwShort ? "Hasło musi mieć co najmniej 10 znaków." : undefined}>
              {(id) => (
                <input
                  id={id}
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={pw}
                  aria-invalid={tried && pwShort}
                  onChange={(e) => setPw(e.target.value)}
                  className={inputClass + " bg-bg-2"}
                />
              )}
            </Field>
            <Button type="submit" size="lg" className="mt-2">
              {mode === "login" ? "Zaloguj się" : "Załóż konto"}
            </Button>
            <p className="text-center text-footnote text-fg-3">Makieta: dowolne dane logują na konto przykładowe.</p>
          </form>
        )}
      </div>
    </div>
  );
}
