import { useState } from "react";
import { Check, Plus, Search, UserPlus, X } from "lucide-react";
import { Screen } from "../components/screen";
import { Badge, Button, Field, Group, inputClass, ProgressBar, Row, Sheet, StatusDot, cx } from "../components/ui";
import { useStore } from "../store";
import { audit, enrollments, permissions, type AdminUser, type Role } from "../mock/data";
import { roleLabel, userStatus } from "../lib/status";

const ROLES: Role[] = ["PARTICIPANT", "INSTRUCTOR", "ADMIN"];

export function UsersScreen() {
  const { users, setUsers, toast } = useStore();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<AdminUser | null>(null);
  const pending = users.filter((u) => u.status === "PENDING_APPROVAL");
  const rest = users.filter((u) => u.status !== "PENDING_APPROVAL" && (u.name + u.email).toLowerCase().includes(q.toLowerCase()));

  const setStatus = (id: string, status: AdminUser["status"], msg: string) => {
    setUsers((us) => us.map((u) => (u.id === id ? { ...u, status } : u)));
    toast(msg);
  };

  return (
    <Screen title="Użytkownicy" subtitle={`${users.length} kont · konta się nie usuwa, tylko dezaktywuje`} actions={<Button variant="plain" icon={UserPlus} aria-label="Dodaj użytkownika" />}>
      {pending.length > 0 && (
        <Group title={`Czekają na akceptację (${pending.length})`}>
          {pending.map((u) => (
            <Row key={u.id} chevron={false} trailing={
              <div className="flex shrink-0 gap-1">
                <Button variant="destructive" aria-label={`Odrzuć ${u.name}`} icon={X} className="w-11 px-0" onClick={() => setStatus(u.id, "REJECTED", "Rejestracja odrzucona")} />
                <Button aria-label={`Zatwierdź ${u.name}`} icon={Check} onClick={() => setStatus(u.id, "ACTIVE", "Konto zatwierdzone")}>
                  <span className="hidden sm:inline">Zatwierdź</span>
                </Button>
              </div>
            }>
              <div className="truncate text-body">{u.name}</div>
              <div className="truncate text-footnote text-fg-2">
                {u.email} · {u.created}
              </div>
            </Row>
          ))}
        </Group>
      )}

      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden />
        <input id="user-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj po nazwisku lub e-mailu" aria-label="Szukaj użytkowników" className={inputClass + " bg-bg-2 pl-10"} />
      </div>

      <Group title="Wszyscy">
        {rest.map((u) => {
          const st = userStatus[u.status];
          return (
            <Row key={u.id} onClick={() => setEdit(u)}>
              <div className="flex flex-wrap items-center gap-x-2">
                <span className={cx("text-body", u.status !== "ACTIVE" && "text-fg-2")}>{u.name}</span>
                {u.status !== "ACTIVE" && <Badge tone={st.tone}>{st.label}</Badge>}
              </div>
              <div className="truncate text-footnote text-fg-2">{u.email}</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {u.roles.map((r) => (
                  <Badge key={r} tone={r === "ADMIN" ? "accent" : r === "INSTRUCTOR" ? "info" : "muted"}>
                    {roleLabel[r]}
                  </Badge>
                ))}
              </div>
            </Row>
          );
        })}
      </Group>

      <Sheet open={!!edit} title={edit?.name ?? ""} onClose={() => setEdit(null)}>
        {edit && (
          <div className="flex flex-col gap-5">
            <p className="text-subhead text-fg-2">{edit.email}</p>
            <Group title="Role" footer="Ocena wymaga roli Instruktor i uprawnienia do etapu. Sama rola Administrator nie wystarcza.">
              {ROLES.map((r) => {
                const on = edit.roles.includes(r);
                return (
                  <Row
                    key={r}
                    chevron={false}
                    onClick={() => setEdit({ ...edit, roles: on ? edit.roles.filter((x) => x !== r) : [...edit.roles, r] })}
                    trailing={<span className={cx("grid size-6 place-items-center rounded-full", on ? "bg-accent text-accent-fg" : "border-2 border-fg/20")}>{on && <Check size={14} strokeWidth={3} />}</span>}
                  >
                    <span role="checkbox" aria-checked={on} className="text-body">
                      {roleLabel[r]}
                    </span>
                  </Row>
                );
              })}
            </Group>
            <div className="flex flex-wrap justify-between gap-3">
              {edit.status === "ACTIVE" ? (
                <Button variant="destructive" onClick={() => (setStatus(edit.id, "DEACTIVATED", "Konto dezaktywowane"), setEdit(null))}>
                  Dezaktywuj konto
                </Button>
              ) : (
                <Button variant="bordered" onClick={() => (setStatus(edit.id, "ACTIVE", "Konto aktywne"), setEdit(null))}>
                  Aktywuj ponownie
                </Button>
              )}
              <Button
                onClick={() => {
                  setUsers((us) => us.map((u) => (u.id === edit.id ? edit : u)));
                  setEdit(null);
                  toast("Zapisano zmiany");
                }}
              >
                Zapisz
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </Screen>
  );
}

export function AdminPathsScreen() {
  const { push } = useStore();
  return (
    <Screen title="Ścieżki" subtitle="Treść edukacyjna i jej wersje" actions={<Button variant="plain" icon={Plus} aria-label="Nowa ścieżka" />}>
      <Group title="Podstawy kowalstwa" footer="Uczestnik zostaje przy wersji, do której go zapisano. Nowa wersja nie zmienia jego historii.">
        <Row onClick={() => push({ name: "version" })} trailing={<Badge tone="ok">Przyjmuje zapisy</Badge>}>
          <div className="text-body">Wersja 1</div>
          <div className="text-footnote text-fg-2">2 etapy · 35 zadań · 6 zapisów</div>
        </Row>
        <Row chevron={false} trailing={<Badge tone="muted">Szkic</Badge>}>
          <div className="text-body text-fg-2">Wersja 2</div>
          <div className="text-footnote text-fg-3">kopia wersji 1 · nie przyjmuje zapisów</div>
        </Row>
      </Group>
    </Screen>
  );
}

const enrollTone = { ACTIVE: "accent", COMPLETED: "ok", CANCELLED: "muted" } as const;
const enrollLabel = { ACTIVE: "Aktywny", COMPLETED: "Ukończony", CANCELLED: "Anulowany" } as const;

export function EnrollmentsScreen() {
  const { toast } = useStore();
  const [open, setOpen] = useState(false);
  return (
    <Screen title="Zapisy" subtitle="Kto realizuje którą wersję ścieżki" actions={<Button variant="plain" icon={Plus} onClick={() => setOpen(true)}>Zapisz</Button>}>
      <Group>
        {enrollments.map((e) => (
          <Row key={e.id} chevron={false} trailing={<Badge tone={enrollTone[e.status]}>{enrollLabel[e.status]}</Badge>}>
            <div className="text-body">{e.user}</div>
            <div className="text-footnote text-fg-2">
              {e.path} · v{e.version} · od {e.at}
            </div>
            <div className="mt-2 flex max-w-xs items-center gap-2">
              <ProgressBar done={e.progress[0]} total={e.progress[1]} />
              <span className="shrink-0 text-caption tabular-nums text-fg-3">
                {e.progress[0]}/{e.progress[1]}
              </span>
            </div>
          </Row>
        ))}
      </Group>
      <Sheet open={open} title="Zapisz uczestnika" onClose={() => setOpen(false)}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setOpen(false);
            toast("Uczestnik zapisany");
          }}
        >
          <Field label="Uczestnik">
            {(id) => (
              <select id={id} className={inputClass}>
                <option>Ewa Szymańska</option>
                <option>Michał Dąbrowski</option>
              </select>
            )}
          </Field>
          <Field label="Ścieżka i wersja" hint="Tylko wersje przyjmujące zapisy.">
            {(id) => (
              <select id={id} className={inputClass}>
                <option>Podstawy kowalstwa · wersja 1</option>
                <option>Ostrza i noże · wersja 1</option>
              </select>
            )}
          </Field>
          <Button type="submit" size="lg">
            Zapisz
          </Button>
        </form>
      </Sheet>
    </Screen>
  );
}

export function PermissionsScreen() {
  return (
    <Screen title="Uprawnienia" subtitle="Instruktor ocenia tylko zgłoszenia z przypisanych mu wersji lub etapów" actions={<Button variant="plain" icon={Plus}>Nadaj</Button>}>
      <Group footer="Odebranie uprawnienia automatycznie zwalnia przejęte zgłoszenia z tego zakresu.">
        {permissions.map((p) => (
          <Row key={p.id} chevron={false} trailing={<Badge tone={p.kind === "Etap" ? "info" : "accent"}>{p.kind}</Badge>}>
            <div className="text-body">{p.instructor}</div>
            <div className="text-footnote text-fg-2">{p.scope}</div>
          </Row>
        ))}
      </Group>
    </Screen>
  );
}

const auditLabel: Record<string, string> = {
  SUBMISSION_CLAIMED: "Przejęcie zgłoszenia",
  SUBMISSION_SUBMITTED: "Wysłanie zgłoszenia",
  USER_REGISTERED: "Rejestracja",
  SUBMISSION_ASSESSED: "Ocena",
  TASK_UPDATED: "Nowa wersja treści zadania",
  PERMISSION_GRANTED: "Nadanie uprawnienia",
};

export function AuditScreen() {
  return (
    <Screen title="Dziennik zdarzeń" subtitle="Kluczowe operacje · tylko do odczytu">
      <Group>
        {audit.map((a, i) => (
          <Row key={i} chevron={false} leading={<StatusDot status={a.action === "SUBMISSION_ASSESSED" ? "PASSED" : "SUBMITTED"} />}>
            <div className="text-body">{auditLabel[a.action] ?? a.action}</div>
            <div className="text-footnote text-fg-2">
              {a.who} · {a.entity}
            </div>
            <div className="font-mono text-caption tabular-nums text-fg-3">
              {a.at} · {a.action}
            </div>
          </Row>
        ))}
      </Group>
    </Screen>
  );
}
