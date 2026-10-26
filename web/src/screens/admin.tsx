import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, EyeOff, Plus, Search, UserPlus, X } from "lucide-react";
import { Screen } from "../components/screen";
import { Badge, Button, Field, Group, inputClass, PhotoTile, ProgressBar, Row, Segmented, Sheet, StatusDot, cx } from "../components/ui";
import { allTasks, useStore } from "../store";
import { audit, enrollments, permissions, type AdminUser, type Role, type Stage } from "../mock/data";
import { roleLabel, taskTypeLabel, userStatus } from "../lib/status";

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
          <div className="text-footnote text-fg-2">3 etapy · 8 zadań · 5 zapisów</div>
        </Row>
        <Row chevron={false} trailing={<Badge tone="muted">Szkic</Badge>}>
          <div className="text-body text-fg-2">Wersja 2</div>
          <div className="text-footnote text-fg-3">kopia wersji 1 · nie przyjmuje zapisów</div>
        </Row>
      </Group>
      <Group title="Ostrza i noże">
        <Row chevron={false} trailing={<Badge tone="ok">Przyjmuje zapisy</Badge>}>
          <div className="text-body">Wersja 1</div>
          <div className="text-footnote text-fg-2">4 etapy · 12 zadań · 1 zapis</div>
        </Row>
      </Group>
    </Screen>
  );
}

export function VersionScreen() {
  const { stages, setStages, push, pop, toast } = useStore();
  const [accepting, setAccepting] = useState(true);
  const [off, setOff] = useState<string[]>([]);

  const move = (stageId: string, idx: number, dir: -1 | 1) =>
    setStages((ss: Stage[]) =>
      ss.map((s) => {
        if (s.id !== stageId) return s;
        const t = [...s.tasks];
        const j = idx + dir;
        if (j < 0 || j >= t.length) return s;
        [t[idx], t[j]] = [t[j], t[idx]];
        return { ...s, tasks: t.map((x, i) => ({ ...x, position: i + 1 })) };
      }),
    );

  return (
    <Screen
      title="Podstawy kowalstwa · v1"
      back="Ścieżki"
      onBack={pop}
      subtitle="Edycja treści tworzy nową wersję zadania. Zaliczenia nigdy nie są cofane."
      actions={<Button variant="plain" icon={Copy} onClick={() => toast("Utworzono wersję 2 (kopia)")}>Kopia</Button>}
    >
      <Group>
        <Row
          chevron={false}
          onClick={() => setAccepting(!accepting)}
          trailing={
            <span role="switch" aria-checked={accepting} className={cx("relative h-[31px] w-[51px] shrink-0 rounded-full transition", accepting ? "bg-ok" : "bg-fg/15")}>
              <span className={cx("absolute top-[2px] size-[27px] rounded-full bg-white shadow transition-all", accepting ? "left-[22px]" : "left-[2px]")} />
            </span>
          }
        >
          <div className="text-body">Przyjmuje nowe zapisy</div>
          <div className="text-footnote text-fg-2">Wyłączenie nie wpływa na osoby już zapisane</div>
        </Row>
      </Group>

      {stages.map((s) => (
        <Group key={s.id} title={`Etap ${s.position} · ${s.name}`}>
          {s.tasks.map((t, i) => {
            const disabled = off.includes(t.id);
            return (
              <Row
                key={t.id}
                chevron={false}
                trailing={
                  <div className="flex shrink-0 items-center">
                    <Button variant="plain" className="w-11 px-0" aria-label={`Przesuń ${t.name} wyżej`} icon={ArrowUp} disabled={i === 0} onClick={() => move(s.id, i, -1)} />
                    <Button variant="plain" className="w-11 px-0" aria-label={`Przesuń ${t.name} niżej`} icon={ArrowDown} disabled={i === s.tasks.length - 1} onClick={() => move(s.id, i, 1)} />
                    <Button
                      variant="plain"
                      className="w-11 px-0"
                      aria-label={disabled ? `Włącz ${t.name}` : `Wyłącz ${t.name}`}
                      icon={EyeOff}
                      onClick={() => setOff(disabled ? off.filter((x) => x !== t.id) : [...off, t.id])}
                    />
                  </div>
                }
              >
                <button type="button" onClick={() => push({ name: "task-edit", taskId: t.id })} className="focus-ring -my-3 block w-full rounded-ctl py-3 text-left">
                  <div className={cx("text-body", disabled && "text-fg-3 line-through")}>
                    {t.position}. {t.name}
                  </div>
                  <div className="text-footnote text-fg-2">
                    {t.code} · {taskTypeLabel[t.type]} · wersja treści {t.revision}
                    {disabled && " · wyłączone"}
                  </div>
                </button>
              </Row>
            );
          })}
          <Row onClick={() => toast("Dodawanie zadania — w M4")} leading={<Plus size={20} className="text-accent" aria-hidden />} chevron={false}>
            <span className="text-body text-accent">Dodaj zadanie</span>
          </Row>
        </Group>
      ))}
    </Screen>
  );
}

export function TaskEditScreen({ taskId }: { taskId: string }) {
  const { stages, setStages, pop, toast } = useStore();
  const t = allTasks(stages).find((x) => x.id === taskId)!;
  const [f, setF] = useState({
    name: t.name,
    code: t.code,
    type: t.type,
    quantity: t.quantity ?? "",
    material: t.material ?? "",
    description: t.description,
    instructions: t.instructions.join("\n"),
    criteria: t.criteria.join("\n"),
    requirements: t.requirements,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    setStages((ss) =>
      ss.map((s) => ({
        ...s,
        tasks: s.tasks.map((x) =>
          x.id === taskId
            ? { ...x, ...f, quantity: f.quantity || undefined, material: f.material || undefined, instructions: f.instructions.split("\n").filter(Boolean), criteria: f.criteria.split("\n").filter(Boolean), revision: x.revision + 1 }
            : x,
        ),
      })),
    );
    toast(`Zapisano wersję treści ${t.revision + 1}`);
    pop();
  };
  const text = (k: keyof typeof f, label: string, rows = 3, hint?: string) => (
    <Field label={label} hint={hint}>
      {(id) => <textarea id={id} rows={rows} value={f[k]} onChange={set(k)} className={inputClass} />}
    </Field>
  );
  const line = (k: keyof typeof f, label: string) => (
    <Field label={label}>{(id) => <input id={id} value={f[k]} onChange={set(k)} className={inputClass} />}</Field>
  );

  return (
    <Screen
      title="Edycja zadania"
      back="Wersja 1"
      onBack={pop}
      subtitle={`${t.stage.name} · obecnie wersja treści ${t.revision}`}
      footer={
        <>
          <span className="flex-1 text-subhead text-fg-2">Zapis utworzy wersję treści {t.revision + 1}. Wcześniejsze zgłoszenia zachowują swoją.</span>
          <Button size="lg" onClick={save}>
            Zapisz
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 rounded-card bg-bg-2 p-5">
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          {line("name", "Tytuł")}
          {line("code", "Oznaczenie na karcie")}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-footnote font-semibold text-fg-2">Typ zadania</span>
          <Segmented
            label="Typ zadania"
            value={f.type}
            onChange={(v) => setF({ ...f, type: v })}
            options={[
              { value: "PRACTICAL", label: "Praktyczne" },
              { value: "THEORY", label: "Teoria" },
              { value: "QUIZ", label: "Quiz" },
            ]}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {line("quantity", "Do wykonania")}
          {line("material", "Materiał")}
        </div>
      </div>
      <div className="flex flex-col gap-4 rounded-card bg-bg-2 p-5">
        {text("description", "Cel ćwiczenia")}
        {text("instructions", "Kolejność operacji", 6, "Każdy krok w osobnej linii")}
        {text("criteria", "Na co zwrócić uwagę", 4, "Każde kryterium w osobnej linii")}
        {text("requirements", "Materiał do zaliczenia w aplikacji", 2)}
      </div>
      {t.reference && (
        <Group title="Zdjęcia wzorcowe">
          {t.reference.map((r) => (
            <Row key={r.photo.id} chevron={false} leading={<PhotoTile photo={r.photo} className="size-14 shrink-0 rounded-[12px]" />}>
              <span className="text-body">{r.caption}</span>
            </Row>
          ))}
          <Row onClick={() => toast("Dodawanie zdjęć — w M4")} chevron={false} leading={<Plus size={20} className="text-accent" aria-hidden />}>
            <span className="text-body text-accent">Dodaj zdjęcie wzorcowe</span>
          </Row>
        </Group>
      )}
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
