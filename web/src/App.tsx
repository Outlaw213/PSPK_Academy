import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ClipboardCheck, GraduationCap, History, Inbox, KeyRound, LogOut, Moon, Route as RouteIcon, ScrollText, ShieldCheck, Sun, SunMoon, Users, type LucideIcon } from "lucide-react";
import { me, myHistory, queue as queueSeed, stages as stagesSeed, users as usersSeed, type Role } from "./mock/data";
import { StoreContext, type Draft, type Route, type Store } from "./store";
import { Button, Group, Row, Segmented, Sheet, Toast, cx } from "./components/ui";
import { roleLabel } from "./lib/status";
import { AuthScreen, Logo } from "./screens/auth";
import { QuizScreen } from "./screens/quiz";
import { DraftScreen, HistoryScreen, PathScreen, PathsScreen, SubmissionScreen, TaskScreen } from "./screens/participant";
import { AssessedScreen, CourseScreen, CoursesScreen, QueueScreen, ReviewScreen } from "./screens/instructor";
import { AdminPathsScreen, AuditScreen, EnrollmentsScreen, PermissionsScreen, UsersScreen } from "./screens/admin";
import { TaskEditScreen, VersionScreen } from "./screens/builder";

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
  root: Route;
  badge?: number;
}

type Theme = "system" | "light" | "dark";

function render(r: Route) {
  switch (r.name) {
    case "paths":
      return <PathsScreen />;
    case "path":
      return <PathScreen />;
    case "task":
      return <TaskScreen taskId={r.taskId} />;
    case "draft":
      return <DraftScreen taskId={r.taskId} />;
    case "history":
      return <HistoryScreen />;
    case "submission":
      return <SubmissionScreen id={r.id} />;
    case "queue":
      return <QueueScreen />;
    case "assessed":
      return <AssessedScreen />;
    case "review":
      return <ReviewScreen id={r.id} />;
    case "quiz":
      return <QuizScreen taskId={r.taskId} preview={r.preview} />;
    case "courses":
      return <CoursesScreen />;
    case "course":
      return <CourseScreen taskId={r.taskId} />;
    case "users":
      return <UsersScreen />;
    case "admin-paths":
      return <AdminPathsScreen />;
    case "version":
      return <VersionScreen />;
    case "task-edit":
      return <TaskEditScreen taskId={r.taskId} />;
    case "enrollments":
      return <EnrollmentsScreen />;
    case "permissions":
      return <PermissionsScreen />;
    case "audit":
      return <AuditScreen />;
  }
}

function readTheme(): Theme {
  try {
    return (localStorage.getItem("pspk-theme") as Theme) || "system";
  } catch {
    return "system";
  }
}

export default function App() {
  const [authed, setAuthed] = useState(true);
  const [role, setRole] = useState<Role>("PARTICIPANT");
  const [stages, setStagesRaw] = useState(stagesSeed);
  const [history, setHistoryRaw] = useState(myHistory);
  const [queue, setQueueRaw] = useState(queueSeed);
  const [users, setUsersRaw] = useState(usersSeed);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [account, setAccount] = useState(false);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const toastTimer = useRef<number>(0);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [role]);

  useEffect(() => {
    const el = document.documentElement;
    if (theme === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("pspk-theme", theme);
    } catch {
      /* storage unavailable: theme just isn't remembered */
    }
  }, [theme]);

  const pendingUsers = users.filter((u) => u.status === "PENDING_APPROVAL").length;
  const openQueue = queue.filter((q) => q.status === "SUBMITTED").length;

  const tabs: Record<Role, Tab[]> = {
    PARTICIPANT: [
      { id: "paths", label: "Ścieżki", icon: RouteIcon, root: { name: "paths" } },
      { id: "history", label: "Zgłoszenia", icon: History, root: { name: "history" } },
    ],
    INSTRUCTOR: [
      { id: "queue", label: "Kolejka", icon: Inbox, root: { name: "queue" }, badge: openQueue },
      { id: "courses", label: "Kursy", icon: GraduationCap, root: { name: "courses" } },
      { id: "assessed", label: "Ocenione", icon: ClipboardCheck, root: { name: "assessed" } },
    ],
    ADMIN: [
      { id: "users", label: "Użytkownicy", icon: Users, root: { name: "users" }, badge: pendingUsers },
      { id: "admin-paths", label: "Ścieżki", icon: BookOpen, root: { name: "admin-paths" } },
      { id: "enrollments", label: "Zapisy", icon: RouteIcon, root: { name: "enrollments" } },
      { id: "permissions", label: "Uprawnienia", icon: ShieldCheck, root: { name: "permissions" } },
      { id: "audit", label: "Dziennik", icon: ScrollText, root: { name: "audit" } },
    ],
  };

  // One navigation stack per tab, so switching tabs keeps your place.
  const [activeTab, setActiveTab] = useState<Record<Role, string>>({ PARTICIPANT: "paths", INSTRUCTOR: "queue", ADMIN: "users" });
  const [stacks, setStacks] = useState<Record<string, Route[]>>({});
  const tabId = activeTab[role];
  const tab = tabs[role].find((t) => t.id === tabId)!;
  const stack = stacks[tabId] ?? [tab.root];
  const route = stack[stack.length - 1];

  const scrollTop = () => window.scrollTo({ top: 0 });
  const push = useCallback(
    (r: Route) => {
      setStacks((s) => ({ ...s, [tabId]: [...(s[tabId] ?? [tab.root]), r] }));
      scrollTop();
    },
    [tabId, tab.root],
  );
  const pop = useCallback(() => {
    setStacks((s) => {
      const cur = s[tabId] ?? [tab.root];
      return { ...s, [tabId]: cur.length > 1 ? cur.slice(0, -1) : cur };
    });
    scrollTop();
  }, [tabId, tab.root]);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2200);
  }, []);

  const store: Store = useMemo(
    () => ({
      stages,
      setStages: setStagesRaw,
      history,
      setHistory: setHistoryRaw,
      queue,
      setQueue: setQueueRaw,
      users,
      setUsers: setUsersRaw,
      draft,
      setDraft,
      toast,
      push,
      pop,
    }),
    [stages, history, queue, users, draft, toast, push, pop],
  );

  const selectTab = (id: string) => {
    if (id === tabId) setStacks((s) => ({ ...s, [id]: [tabs[role].find((t) => t.id === id)!.root] }));
    setActiveTab((a) => ({ ...a, [role]: id }));
    scrollTop();
  };

  if (!authed)
    return (
      <AuthScreen
        onLogin={() => {
          setAuthed(true);
          toast("Zalogowano");
        }}
      />
    );

  const initials = me.firstName[0] + me.lastName[0];
  const avatar = (
    <button type="button" onClick={() => setAccount(true)} aria-label="Konto i ustawienia" className="focus-ring grid size-11 place-items-center rounded-full">
      <span className="grid size-9 place-items-center rounded-full bg-accent/14 text-footnote font-semibold text-accent">{initials}</span>
    </button>
  );

  return (
    <StoreContext.Provider value={store}>
      <div className="flex min-h-full">
        {/* Sidebar (desktop) */}
        <aside className="glass sticky top-0 hidden h-screen w-72 shrink-0 flex-col gap-6 border-y-0 border-l-0 px-4 py-6 lg:flex">
          <div className="flex items-center gap-3 px-2">
            <Logo size={48} />
            <div>
              <div className="text-headline">Akademia</div>
              <div className="text-footnote text-fg-2">PSPK</div>
            </div>
          </div>
          <Segmented
            label="Widok roli"
            value={role}
            onChange={setRole}
            options={me.roles.map((r) => ({ value: r, label: r === "PARTICIPANT" ? "Uczestnik" : r === "INSTRUCTOR" ? "Instruktor" : "Admin" }))}
          />
          <nav aria-label="Sekcje" className="flex flex-col gap-1">
            {tabs[role].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                aria-current={t.id === tabId ? "page" : undefined}
                className={cx(
                  "focus-ring flex min-h-11 items-center gap-3 rounded-ctl px-3 text-body transition",
                  t.id === tabId ? "bg-accent/12 font-semibold text-accent" : "text-fg hover:bg-fg/[0.05]",
                )}
              >
                <t.icon size={20} strokeWidth={t.id === tabId ? 2.4 : 1.8} aria-hidden />
                <span className="flex-1 text-left">{t.label}</span>
                {!!t.badge && <span className="min-w-6 rounded-full bg-accent px-1.5 text-center text-caption font-semibold tabular-nums text-accent-fg">{t.badge}</span>}
              </button>
            ))}
          </nav>
          <button type="button" onClick={() => setAccount(true)} className="focus-ring mt-auto flex min-h-11 items-center gap-3 rounded-ctl px-2 py-2 text-left hover:bg-fg/[0.05]">
            <span className="grid size-9 place-items-center rounded-full bg-accent/14 text-footnote font-semibold text-accent">{initials}</span>
            <span className="min-w-0">
              <span className="block truncate text-subhead font-semibold">
                {me.firstName} {me.lastName}
              </span>
              <span className="block truncate text-footnote text-fg-2">{roleLabel[role]}</span>
            </span>
          </button>
        </aside>

        <div className="relative min-w-0 flex-1">
          {/* Account button for phones, floating at the top right of every screen */}
          <div className="fixed right-[max(8px,env(safe-area-inset-right,0px))] top-[calc(env(safe-area-inset-top,0px)+4px)] z-30 lg:hidden">{avatar}</div>
          <div key={tabId + stack.length}>{render(route)}</div>
        </div>
      </div>

      {/* Tab bar (phones) */}
      <nav
        aria-label="Sekcje"
        className="glass fixed inset-x-0 bottom-0 z-30 flex border-x-0 border-b-0 px-[max(4px,env(safe-area-inset-left,0px))] pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
      >
        {tabs[role].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectTab(t.id)}
            aria-current={t.id === tabId ? "page" : undefined}
            className={cx("focus-ring relative flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", t.id === tabId ? "text-accent" : "text-fg-3")}
          >
            <t.icon size={24} strokeWidth={t.id === tabId ? 2.4 : 1.7} aria-hidden />
            {t.label}
            {!!t.badge && (
              <span className="absolute left-1/2 top-1.5 ml-2 min-w-5 rounded-full bg-bad px-1 text-center text-[11px] font-semibold tabular-nums leading-5 text-white">{t.badge}</span>
            )}
          </button>
        ))}
      </nav>

      <Sheet open={account} title="Konto" onClose={() => setAccount(false)}>
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <span className="grid size-14 place-items-center rounded-full bg-accent/14 text-headline text-accent">{initials}</span>
            <div className="min-w-0">
              <div className="text-headline">
                {me.firstName} {me.lastName}
              </div>
              <div className="truncate text-subhead text-fg-2">{me.email}</div>
            </div>
          </div>
          <Group title="Widok" footer="Masz kilka ról. W aplikacji przełączasz się między nimi tutaj.">
            <div className="p-3">
              <Segmented
                label="Widok roli"
                value={role}
                onChange={(r) => (setRole(r), setAccount(false))}
                options={me.roles.map((r) => ({ value: r, label: r === "PARTICIPANT" ? "Uczestnik" : r === "INSTRUCTOR" ? "Instruktor" : "Admin" }))}
              />
            </div>
          </Group>
          <Group title="Wygląd">
            <div className="p-3">
              <Segmented
                label="Motyw"
                value={theme}
                onChange={setTheme}
                options={[
                  { value: "system", label: "Systemowy" },
                  { value: "light", label: "Jasny" },
                  { value: "dark", label: "Ciemny" },
                ]}
              />
            </div>
          </Group>
          <Group>
            <Row leading={<KeyRound size={20} className="text-fg-2" aria-hidden />} onClick={() => (setAccount(false), toast("Zmiana hasła — w M3"))}>
              <span className="text-body">Zmień hasło</span>
            </Row>
            <Row
              chevron={false}
              leading={<LogOut size={20} className="text-bad" aria-hidden />}
              onClick={() => {
                setAccount(false);
                setAuthed(false);
              }}
            >
              <span className="text-body text-bad">Wyloguj się</span>
            </Row>
          </Group>
          <p className="flex items-center justify-center gap-2 text-center text-footnote text-fg-3">
            {theme === "dark" ? <Moon size={14} /> : theme === "light" ? <Sun size={14} /> : <SunMoon size={14} />}
            Makieta PSPK Akademia · dane przykładowe
          </p>
          <Button variant="plain" onClick={() => setAccount(false)}>
            Gotowe
          </Button>
        </div>
      </Sheet>

      <Toast message={toastMsg} />
    </StoreContext.Provider>
  );
}
