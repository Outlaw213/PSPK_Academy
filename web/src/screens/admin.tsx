import { useState, type FormEvent } from "react";
import { Check, KeyRound, Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import { Screen } from "../components/screen";
import { ApiPhotoTile } from "../components/files";
import { Badge, Button, Field, Group, inputClass, ProgressBar, Row, Segmented, Sheet, StatusDot, cx } from "../components/ui";
import { useStore } from "../store";
import { del, get, post, put } from "../api/client";
import type {
  AdminSubmissionDetail,
  AdminSubmissionItem,
  AdminUser,
  AuditItem,
  Enrollment,
  Page,
  PathDetail,
  PathSummary,
  Permission,
  Role,
  SubmissionStatus,
  Version,
  VersionDetail,
} from "../api/types";
import { auditActions, auditObject } from "../lib/audit";
import { errorText } from "../lib/errors";
import { formatDate, formatDateTime, personName } from "../lib/format";
import { roleLabel, submissionStatus, userStatus } from "../lib/status";
import { useApi } from "../lib/useApi";
import { FeedbackCard, Loading } from "./participant";

const ROLES: Role[] = ["PARTICIPANT", "INSTRUCTOR", "ADMIN"];

function Empty({ children }: { children: string }) {
  return <p className="rounded-card bg-bg-2 p-8 text-center text-body text-fg-2">{children}</p>;
}

function ErrorText({ children }: { children: string | null }) {
  return children ? (
    <p className="rounded-ctl bg-bad/8 px-4 py-3 text-subhead text-bad" role="alert">
      {children}
    </p>
  ) : null;
}

/** Run an API call; on failure keep the message for the form and the toast. */
function useAction() {
  const { toast } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (done) toast(done);
      return true;
    } catch (e) {
      setError(errorText(e));
      toast(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

const roleTone = (r: Role) => (r === "ADMIN" ? "accent" : r === "INSTRUCTOR" ? "info" : "muted");

function RolePicker({ value, onChange }: { value: Role[]; onChange: (r: Role[]) => void }) {
  return (
    <Group title="Role" footer="Ocena wymaga roli Instruktor i uprawnienia do etapu. Sama rola Administrator nie wystarcza.">
      {ROLES.map((r) => {
        const on = value.includes(r);
        return (
          <Row
            key={r}
            chevron={false}
            onClick={() => onChange(on ? value.filter((x) => x !== r) : [...value, r])}
            trailing={<span className={cx("grid size-6 place-items-center rounded-full", on ? "bg-accent text-accent-fg" : "border-2 border-fg/20")}>{on && <Check size={14} strokeWidth={3} />}</span>}
          >
            <span role="checkbox" aria-checked={on} className="text-body">
              {roleLabel[r]}
            </span>
          </Row>
        );
      })}
    </Group>
  );
}

// --- users (FR-ADM-01) -------------------------------------------------------------------------

export function UsersScreen() {
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<AdminUser | null>(null);
  const [creating, setCreating] = useState(false);
  const pending = useApi(() => get<Page<AdminUser>>("/admin/users?status=PENDING_APPROVAL&limit=200"), []);
  const all = useApi(() => get<Page<AdminUser>>(`/admin/users?limit=200${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`), [q]);
  const act = useAction();
  const reload = () => Promise.all([pending.reload(), all.reload()]);
  const decide = async (u: AdminUser, approve: boolean) => {
    await act.run(() => post(`/admin/users/${u.id}/${approve ? "approve" : "reject"}`), approve ? "Konto zatwierdzone" : "Rejestracja odrzucona");
    await reload();
  };
  const rest = (all.data?.items ?? []).filter((u) => u.status !== "PENDING_APPROVAL");

  return (
    <Screen
      title="Użytkownicy"
      subtitle={all.data ? `${all.data.total} kont · konta się nie usuwa, tylko dezaktywuje` : undefined}
      actions={<Button variant="plain" icon={UserPlus} aria-label="Dodaj użytkownika" onClick={() => setCreating(true)} />}
    >
      {(pending.data?.items.length ?? 0) > 0 && (
        <Group title={`Czekają na akceptację (${pending.data!.items.length})`}>
          {pending.data!.items.map((u) => (
            <Row
              key={u.id}
              chevron={false}
              trailing={
                <div className="flex shrink-0 gap-1">
                  <Button variant="destructive" aria-label={`Odrzuć ${personName(u)}`} icon={X} className="w-11 px-0" disabled={act.busy} onClick={() => decide(u, false)} />
                  <Button aria-label={`Zatwierdź ${personName(u)}`} icon={Check} disabled={act.busy} onClick={() => decide(u, true)}>
                    <span className="hidden sm:inline">Zatwierdź</span>
                  </Button>
                </div>
              }
            >
              <div className="truncate text-body">{personName(u)}</div>
              <div className="truncate text-footnote text-fg-2">
                {u.email} · {formatDate(u.created_at)}
              </div>
            </Row>
          ))}
        </Group>
      )}

      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden />
        <input id="user-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj po nazwisku lub e-mailu" aria-label="Szukaj użytkowników" className={inputClass + " bg-bg-2 pl-10"} />
      </div>

      {!all.data ? (
        <Loading error={all.error} onRetry={all.reload} />
      ) : rest.length === 0 ? (
        <Empty>Nikogo nie znaleziono.</Empty>
      ) : (
        <Group title="Wszyscy">
          {rest.map((u) => {
            const st = userStatus[u.status as keyof typeof userStatus];
            return (
              <Row key={u.id} onClick={() => setEdit(u)}>
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className={cx("text-body", u.status !== "ACTIVE" && "text-fg-2")}>{personName(u)}</span>
                  {u.status !== "ACTIVE" && <Badge tone={st.tone}>{st.label}</Badge>}
                </div>
                <div className="truncate text-footnote text-fg-2">{u.email}</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {u.roles.map((r) => (
                    <Badge key={r} tone={roleTone(r)}>
                      {roleLabel[r]}
                    </Badge>
                  ))}
                </div>
              </Row>
            );
          })}
        </Group>
      )}

      <UserSheet user={edit} onClose={() => setEdit(null)} onChanged={reload} />
      <NewUserSheet open={creating} onClose={() => setCreating(false)} onCreated={reload} />
    </Screen>
  );
}

function UserSheet({ user, onClose, onChanged }: { user: AdminUser | null; onClose: () => void; onChanged: () => Promise<unknown> }) {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [password, setPassword] = useState("");
  const act = useAction();
  if (!user) return null;
  const current = roles ?? user.roles;
  const close = () => {
    setRoles(null);
    setPassword("");
    act.setError(null);
    onClose();
  };
  const save = async (body: object, done: string) => {
    if (await act.run(() => put(`/admin/users/${user.id}`, body), done)) {
      await onChanged();
      close();
    }
  };
  const setPw = async () => {
    if (await act.run(() => post(`/admin/users/${user.id}/password`, { new_password: password }), "Hasło ustawione. Sesje tej osoby zostały zakończone.")) setPassword("");
  };
  return (
    <Sheet open title={personName(user)} onClose={close}>
      <div className="flex flex-col gap-5">
        <p className="text-subhead text-fg-2">{user.email}</p>
        <RolePicker value={current} onChange={setRoles} />
        <Group title="Hasło" footer="Ustawienie hasła wylogowuje tę osobę ze wszystkich urządzeń.">
          <div className="flex flex-col gap-2 p-3 sm:flex-row">
            <input
              type="password"
              aria-label="Nowe hasło"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nowe hasło (min. 10 znaków)"
              className={inputClass + " flex-1"}
            />
            <Button variant="bordered" icon={KeyRound} disabled={act.busy || password.length < 10} onClick={setPw}>
              Ustaw hasło
            </Button>
          </div>
        </Group>
        <ErrorText>{act.error}</ErrorText>
        <div className="flex flex-wrap justify-between gap-3">
          {user.status === "ACTIVE" ? (
            <Button variant="destructive" disabled={act.busy} onClick={() => save({ status: "DEACTIVATED" }, "Konto dezaktywowane")}>
              Dezaktywuj konto
            </Button>
          ) : user.status === "DEACTIVATED" ? (
            <Button variant="bordered" disabled={act.busy} onClick={() => save({ status: "ACTIVE" }, "Konto aktywne")}>
              Aktywuj ponownie
            </Button>
          ) : (
            <span />
          )}
          <Button disabled={act.busy || current.length === 0} onClick={() => save({ roles: current }, "Zapisano zmiany")}>
            Zapisz
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function NewUserSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<unknown> }) {
  const empty = { first_name: "", last_name: "", email: "", password: "" };
  const [f, setF] = useState(empty);
  const [roles, setRoles] = useState<Role[]>(["PARTICIPANT"]);
  const act = useAction();
  const close = () => (setF(empty), setRoles(["PARTICIPANT"]), act.setError(null), onClose());
  const ok = f.first_name.trim() && f.last_name.trim() && f.email.trim() && f.password.length >= 10 && roles.length > 0;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    if (await act.run(() => post("/admin/users", { ...f, email: f.email.trim(), roles }), "Konto utworzone")) {
      await onCreated();
      close();
    }
  };
  const field = (k: keyof typeof empty, label: string, type = "text", hint?: string) => (
    <Field label={label} hint={hint}>
      {(id) => <input id={id} type={type} autoComplete="off" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={inputClass} />}
    </Field>
  );
  return (
    <Sheet open={open} title="Nowe konto" onClose={close}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3">
          {field("first_name", "Imię")}
          {field("last_name", "Nazwisko")}
        </div>
        {field("email", "E-mail", "email")}
        {field("password", "Hasło", "password", "Co najmniej 10 znaków. Przekaż je tej osobie bezpiecznie.")}
        <RolePicker value={roles} onChange={setRoles} />
        <ErrorText>{act.error}</ErrorText>
        <Button type="submit" size="lg" disabled={!ok || act.busy}>
          Utwórz konto
        </Button>
      </form>
    </Sheet>
  );
}

// --- paths (connected to the API in M12c2) ------------------------------------------------------

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

/** Every version of every path, for the enrollment and permission pickers. */
function useVersions() {
  return useApi(async () => {
    const paths = await get<Page<PathSummary>>("/admin/paths?limit=200");
    const details = await Promise.all(paths.items.map((p) => get<PathDetail>(`/admin/paths/${p.id}`)));
    return details.flatMap((d) => d.versions.map((v) => ({ ...v, path_name: d.name }) as Version & { path_name: string }));
  }, []);
}

// --- enrollments (FR-ADM-03) ---------------------------------------------------------------------

const enrollTone = { ACTIVE: "accent", COMPLETED: "ok", CANCELLED: "muted" } as const;
const enrollLabel = { ACTIVE: "Aktywny", COMPLETED: "Ukończony", CANCELLED: "Anulowany" } as const;
type EnrollFilter = "ALL" | Enrollment["status"];

export function EnrollmentsScreen() {
  const [filter, setFilter] = useState<EnrollFilter>("ALL");
  const [open, setOpen] = useState(false);
  const [cancel, setCancel] = useState<Enrollment | null>(null);
  const list = useApi(() => get<Page<Enrollment>>(`/admin/enrollments?limit=200${filter === "ALL" ? "" : `&status=${filter}`}`), [filter]);
  const act = useAction();

  const doCancel = async () => {
    if (cancel && (await act.run(() => post(`/admin/enrollments/${cancel.id}/cancel`), "Zapis anulowany"))) setCancel(null);
    await list.reload();
  };

  return (
    <Screen title="Zapisy" subtitle="Kto realizuje którą wersję ścieżki" actions={<Button variant="plain" icon={Plus} onClick={() => setOpen(true)}>Zapisz</Button>}>
      <Segmented
        label="Filtr zapisów"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "ALL", label: "Wszystkie" },
          { value: "ACTIVE", label: "Aktywne" },
          { value: "COMPLETED", label: "Ukończone" },
          { value: "CANCELLED", label: "Anulowane" },
        ]}
      />
      {!list.data ? (
        <Loading error={list.error} onRetry={list.reload} />
      ) : list.data.items.length === 0 ? (
        <Empty>Brak zapisów.</Empty>
      ) : (
        <Group footer={list.data.total > list.data.items.length ? `Pokazano ${list.data.items.length} z ${list.data.total}.` : undefined}>
          {list.data.items.map((e) => (
            <Row key={e.id} chevron={false} onClick={e.status === "ACTIVE" ? () => setCancel(e) : undefined} trailing={<Badge tone={enrollTone[e.status]}>{enrollLabel[e.status]}</Badge>}>
              <div className="text-body">{personName(e.user)}</div>
              <div className="text-footnote text-fg-2">
                {e.path.name} · v{e.path.version} · od {formatDate(e.enrolled_at)}
              </div>
              <div className="mt-2 flex max-w-xs items-center gap-2">
                <ProgressBar done={e.progress.completed} total={e.progress.total} />
                <span className="shrink-0 text-caption tabular-nums text-fg-3">
                  {e.progress.completed}/{e.progress.total}
                </span>
              </div>
            </Row>
          ))}
        </Group>
      )}

      <EnrollSheet open={open} onClose={() => setOpen(false)} onDone={list.reload} />

      <Sheet open={!!cancel} title="Anulować zapis?" onClose={() => setCancel(null)}>
        {cancel && (
          <div className="flex flex-col gap-4">
            <p className="text-body">
              {personName(cancel.user)} · {cancel.path.name} · v{cancel.path.version}
            </p>
            <p className="text-subhead text-fg-2">Otwarte próby zostaną wycofane. Historia i zaliczenia zostają; zapis można później przywrócić.</p>
            <ErrorText>{act.error}</ErrorText>
            <Button variant="destructive" size="lg" disabled={act.busy} onClick={doCancel}>
              Anuluj zapis
            </Button>
          </div>
        )}
      </Sheet>
    </Screen>
  );
}

function EnrollSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [q, setQ] = useState("");
  const [userId, setUserId] = useState("");
  const [versionId, setVersionId] = useState("");
  const people = useApi(
    () => (open ? get<Page<AdminUser>>(`/admin/users?role=PARTICIPANT&status=ACTIVE&limit=20${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`) : Promise.resolve(null)),
    [open, q],
  );
  const versions = useVersions();
  const act = useAction();
  const accepting = (versions.data ?? []).filter((v) => v.is_active);
  const close = () => (setQ(""), setUserId(""), setVersionId(""), act.setError(null), onClose());
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await act.run(() => post("/admin/enrollments", { user_id: userId, path_version_id: versionId }), "Uczestnik zapisany")) {
      await onDone();
      close();
    }
  };
  return (
    <Sheet open={open} title="Zapisz uczestnika" onClose={close}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label="Uczestnik">
          {(id) => <input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj po nazwisku lub e-mailu" className={inputClass} />}
        </Field>
        <div role="radiogroup" aria-label="Wybierz uczestnika" className="flex max-h-56 flex-col overflow-y-auto rounded-card bg-bg-2">
          {(people.data?.items ?? []).map((u) => (
            <button
              key={u.id}
              type="button"
              role="radio"
              aria-checked={userId === u.id}
              onClick={() => setUserId(u.id)}
              className={cx("focus-ring flex min-h-11 items-center gap-3 border-t px-4 py-2 text-left hairline first:border-t-0", userId === u.id && "bg-accent/8")}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-body">{personName(u)}</span>
                <span className="block truncate text-footnote text-fg-2">{u.email}</span>
              </span>
              {userId === u.id && <Check size={18} className="text-accent" aria-hidden />}
            </button>
          ))}
          {people.data && people.data.items.length === 0 && <p className="p-4 text-subhead text-fg-2">Brak aktywnych uczestników o takim nazwisku.</p>}
        </div>
        <Field label="Ścieżka i wersja" hint="Tylko wersje przyjmujące zapisy.">
          {(id) => (
            <select id={id} value={versionId} onChange={(e) => setVersionId(e.target.value)} className={inputClass}>
              <option value="">Wybierz…</option>
              {accepting.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.path_name} · wersja {v.version_number}
                </option>
              ))}
            </select>
          )}
        </Field>
        <ErrorText>{act.error}</ErrorText>
        <Button type="submit" size="lg" disabled={!userId || !versionId || act.busy}>
          Zapisz
        </Button>
      </form>
    </Sheet>
  );
}

// --- instructor permissions (FR-ADM-04) ----------------------------------------------------------

const scopeText = (p: Permission) => `${p.path.name} v${p.path.version} · ${p.stage ? `Etap ${p.stage.position} · ${p.stage.name}` : "cała wersja"}`;

export function PermissionsScreen() {
  const [open, setOpen] = useState(false);
  const [revoke, setRevoke] = useState<Permission | null>(null);
  const list = useApi(() => get<Page<Permission>>("/admin/instructor-permissions?limit=200"), []);
  const act = useAction();
  const doRevoke = async () => {
    if (revoke && (await act.run(() => del(`/admin/instructor-permissions/${revoke.id}`), "Uprawnienie odebrane"))) setRevoke(null);
    await list.reload();
  };
  return (
    <Screen
      title="Uprawnienia"
      subtitle="Instruktor ocenia tylko zgłoszenia z przypisanych mu wersji lub etapów"
      actions={<Button variant="plain" icon={Plus} onClick={() => setOpen(true)}>Nadaj</Button>}
    >
      {!list.data ? (
        <Loading error={list.error} onRetry={list.reload} />
      ) : list.data.items.length === 0 ? (
        <Empty>Żaden instruktor nie ma jeszcze uprawnień.</Empty>
      ) : (
        <Group footer="Odebranie uprawnienia automatycznie zwalnia przejęte zgłoszenia z tego zakresu.">
          {list.data.items.map((p) => (
            <Row key={p.id} chevron={false} onClick={() => setRevoke(p)} trailing={<Badge tone={p.stage ? "info" : "accent"}>{p.stage ? "Etap" : "Wersja"}</Badge>}>
              <div className="text-body">{personName(p.instructor)}</div>
              <div className="text-footnote text-fg-2">{scopeText(p)}</div>
            </Row>
          ))}
        </Group>
      )}

      <GrantSheet open={open} onClose={() => setOpen(false)} onDone={list.reload} />

      <Sheet open={!!revoke} title="Odebrać uprawnienie?" onClose={() => setRevoke(null)}>
        {revoke && (
          <div className="flex flex-col gap-4">
            <p className="text-body">
              {personName(revoke.instructor)} · {scopeText(revoke)}
            </p>
            <p className="text-subhead text-fg-2">Zgłoszenia, które ta osoba ocenia w tym zakresie, wrócą do kolejki.</p>
            <ErrorText>{act.error}</ErrorText>
            <Button variant="destructive" size="lg" icon={Trash2} disabled={act.busy} onClick={doRevoke}>
              Odbierz uprawnienie
            </Button>
          </div>
        )}
      </Sheet>
    </Screen>
  );
}

function GrantSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [instructorId, setInstructorId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [stageId, setStageId] = useState("");
  const instructors = useApi(() => (open ? get<Page<AdminUser>>("/admin/users?role=INSTRUCTOR&status=ACTIVE&limit=200") : Promise.resolve(null)), [open]);
  const versions = useVersions();
  const version = useApi(() => (versionId ? get<VersionDetail>(`/admin/path-versions/${versionId}`) : Promise.resolve(null)), [versionId]);
  const act = useAction();
  const close = () => (setInstructorId(""), setVersionId(""), setStageId(""), act.setError(null), onClose());
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = stageId ? { instructor_id: instructorId, stage_id: stageId } : { instructor_id: instructorId, path_version_id: versionId };
    if (await act.run(() => post("/admin/instructor-permissions", body), "Uprawnienie nadane")) {
      await onDone();
      close();
    }
  };
  return (
    <Sheet open={open} title="Nadaj uprawnienie" onClose={close}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label="Instruktor">
          {(id) => (
            <select id={id} value={instructorId} onChange={(e) => setInstructorId(e.target.value)} className={inputClass}>
              <option value="">Wybierz…</option>
              {(instructors.data?.items ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {personName(u)} · {u.email}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Ścieżka i wersja">
          {(id) => (
            <select id={id} value={versionId} onChange={(e) => (setVersionId(e.target.value), setStageId(""))} className={inputClass}>
              <option value="">Wybierz…</option>
              {(versions.data ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.path_name} · wersja {v.version_number}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Zakres" hint="Uprawnienie do wersji obejmuje wszystkie jej etapy.">
          {(id) => (
            <select id={id} value={stageId} disabled={!versionId} onChange={(e) => setStageId(e.target.value)} className={inputClass}>
              <option value="">Cała wersja</option>
              {(version.data?.stages ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  Etap {s.position} · {s.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <ErrorText>{act.error}</ErrorText>
        <Button type="submit" size="lg" disabled={!instructorId || !versionId || act.busy}>
          Nadaj
        </Button>
      </form>
    </Sheet>
  );
}

// --- log: submissions and events (FR-ADM-05, FR-ADM-06) -----------------------------------------

export function AuditScreen() {
  const [view, setView] = useState<"submissions" | "events">("submissions");
  return (
    <Screen title="Dziennik" subtitle="Tylko do odczytu">
      <Segmented
        label="Widok dziennika"
        value={view}
        onChange={setView}
        options={[
          { value: "submissions", label: "Zgłoszenia" },
          { value: "events", label: "Zdarzenia" },
        ]}
      />
      {view === "submissions" ? <SubmissionsLog /> : <EventsLog />}
    </Screen>
  );
}

function EventsLog() {
  const [action, setAction] = useState("");
  const { data, error, reload } = useApi(() => get<Page<AuditItem>>(`/admin/audit-logs?limit=100${action ? `&action=${action}` : ""}`), [action]);
  return (
    <>
      <Field label="Rodzaj zdarzenia">
        {(id) => (
          <select id={id} value={action} onChange={(e) => setAction(e.target.value)} className={inputClass + " bg-bg-2"}>
            <option value="">Wszystkie</option>
            {Object.entries(auditActions).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        )}
      </Field>
      {!data ? (
        <Loading error={error} onRetry={reload} />
      ) : data.items.length === 0 ? (
        <Empty>Brak zdarzeń.</Empty>
      ) : (
        <Group footer={data.total > data.items.length ? `Pokazano ${data.items.length} najnowszych z ${data.total}.` : undefined}>
          {data.items.map((a) => (
            <Row key={a.id} chevron={false} leading={<StatusDot status={a.action === "TASK_PASSED" || a.action === "ENROLLMENT_COMPLETED" ? "PASSED" : "SUBMITTED"} />}>
              <div className="text-body">{auditActions[a.action] ?? a.action}</div>
              <div className="text-footnote text-fg-2">
                {a.user ? personName(a.user) : "system"} · {auditObject(a.entity_type, a.metadata)}
              </div>
              <div className="font-mono text-caption tabular-nums text-fg-3">
                {formatDateTime(a.created_at)} · {a.action}
              </div>
            </Row>
          ))}
        </Group>
      )}
    </>
  );
}

function SubmissionsLog() {
  const { push } = useStore();
  const [status, setStatus] = useState<"" | SubmissionStatus>("");
  const { data, error, reload } = useApi(() => get<Page<AdminSubmissionItem>>(`/admin/submissions?limit=100${status ? `&status=${status}` : ""}`), [status]);
  return (
    <>
      <Field label="Status">
        {(id) => (
          <select id={id} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputClass + " bg-bg-2"}>
            <option value="">Wszystkie</option>
            {(Object.keys(submissionStatus) as SubmissionStatus[]).map((s) => (
              <option key={s} value={s}>
                {submissionStatus[s].label}
              </option>
            ))}
          </select>
        )}
      </Field>
      {!data ? (
        <Loading error={error} onRetry={reload} />
      ) : data.items.length === 0 ? (
        <Empty>Brak zgłoszeń.</Empty>
      ) : (
        <Group footer={data.total > data.items.length ? `Pokazano ${data.items.length} najnowszych z ${data.total}.` : undefined}>
          {data.items.map((i) => {
            const st = submissionStatus[i.submission.status];
            return (
              <Row key={i.submission.id} onClick={() => push({ name: "admin-submission", id: i.submission.id })} leading={<ApiPhotoTile path={null} kind={i.task.task_type} className="size-12 shrink-0 rounded-[10px]" />}>
                <div className="text-body">{personName(i.participant)}</div>
                <div className="truncate text-footnote text-fg-2">
                  {i.task.label ? `${i.task.label} · ` : ""}
                  {i.task.name} · próba {i.submission.attempt_number} · {formatDateTime(i.submission.submitted_at ?? i.submission.created_at)}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {i.instructor && <span className="text-footnote text-fg-3">{personName(i.instructor)}</span>}
                </div>
              </Row>
            );
          })}
        </Group>
      )}
    </>
  );
}

export function AdminSubmissionScreen({ id }: { id: string }) {
  const { pop } = useStore();
  const { data: d, error, reload } = useApi(() => get<AdminSubmissionDetail>(`/admin/submissions/${id}`), [id]);
  if (!d)
    return (
      <Screen title="Zgłoszenie" back="Dziennik" onBack={pop}>
        <Loading error={error} onRetry={reload} />
      </Screen>
    );
  const s = d.submission;
  const st = submissionStatus[s.status];
  return (
    <Screen
      title={personName(d.participant)}
      back="Dziennik"
      onBack={pop}
      subtitle={
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge tone={st.tone}>{st.label}</Badge>
          <span className="text-footnote text-fg-2">
            {d.task.label ? `${d.task.label} · ` : ""}
            {d.task.name} · próba {s.attempt_number} · {d.participant.email}
          </span>
        </div>
      }
    >
      {s.photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {s.photos.map((p, i) => (
            <ApiPhotoTile key={p.id} path={`/submissions/${s.id}/photos/${p.id}`} label={`Zdjęcie ${i + 1}`} />
          ))}
        </div>
      )}
      {s.comment && (
        <section className="flex flex-col gap-1 rounded-card bg-bg-2 p-5">
          <h3 className="text-footnote font-semibold uppercase tracking-[0.06em] text-fg-3">Komentarz uczestnika</h3>
          <p className="max-w-[65ch] whitespace-pre-line text-body">{s.comment}</p>
        </section>
      )}
      <FeedbackCard s={s} />
      <section className="flex flex-col gap-2 rounded-card bg-bg-2 p-5">
        <h3 className="text-headline">Kryteria oceny · wersja treści {d.revision.revision_number}</h3>
        <p className="max-w-[65ch] text-body text-fg-2">{d.revision.evaluation_criteria ?? "Kryteria nie zostały opisane w karcie zadania."}</p>
      </section>
      <Group title="Wszystkie próby tego zadania">
        {d.attempts.map((a) => (
          <Row key={a.id} chevron={false}>
            <div className="text-body">Próba {a.attempt_number}</div>
            <div className="text-footnote text-fg-2">
              {submissionStatus[a.status].label}
              {a.assessment && ` · ${personName(a.assessment.instructor)}`} · {formatDateTime(a.submitted_at ?? a.created_at)}
            </div>
            {a.assessment?.comment && <div className="mt-1 max-w-[65ch] text-footnote text-fg-3">„{a.assessment.comment}”</div>}
          </Row>
        ))}
      </Group>
    </Screen>
  );
}
