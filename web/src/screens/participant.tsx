import { useRef, useState, type ReactNode } from "react";
import { ArrowRight, Camera, ClipboardList, ExternalLink, FileText, GraduationCap, Hourglass, Info, ListChecks, Lock, MessageSquareText, Package, PenLine, PlayCircle, Ruler, Send, Target, Trash2 } from "lucide-react";
import { Markdown } from "../components/markdown";
import { Screen } from "../components/screen";
import { ApiPhotoTile } from "../components/files";
import { Badge, Button, Group, inputClass, ProgressBar, Row, StatusBadge, StatusDot, cx } from "../components/ui";
import { useStore } from "../store";
import { del, get, patch, post, upload } from "../api/client";
import type { MyPath, MySubmission, Page, PathProgress, Revision, Submission, SubmissionDetail, TaskDetail, TaskItem, TaskType } from "../api/types";
import { errorText } from "../lib/errors";
import { fileSize, formatDateTime, personName } from "../lib/format";
import { durationLong, submissionStatus, taskTypeLabel } from "../lib/status";
import { openProtected, useApi } from "../lib/useApi";

const MAX_PHOTOS = 10;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** The task to work on now: shown first on the path. Picks from statuses the backend computed (R11). */
const nextTask = (p: PathProgress | null) =>
  p?.stages.flatMap((s) => s.tasks).find((t) => t.task_type !== "COURSE" && t.status !== "PASSED" && t.status !== "LOCKED");

const enrollmentLabel = { ACTIVE: "w trakcie", COMPLETED: "ukończona", CANCELLED: "zapis anulowany" } as const;

/** Eyebrow in PSPK bronze, as on the paper task cards: "ETAP 1 · KOWALSTWO PODSTAWOWE". */
function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-footnote font-bold uppercase tracking-[0.08em] text-brand">{children}</span>;
}

/** Loading / error / empty states shared by every connected screen. */
export function Loading({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  return error ? (
    <div className="flex flex-col items-center gap-3 rounded-card bg-bg-2 p-6 text-center" role="alert">
      <p className="text-subhead text-fg-2">{errorText(error)}</p>
      {onRetry && (
        <Button variant="bordered" onClick={onRetry}>
          Spróbuj ponownie
        </Button>
      )}
    </div>
  ) : (
    <p className="p-6 text-center text-subhead text-fg-3" aria-live="polite">
      Wczytywanie…
    </p>
  );
}

function summary(p: PathProgress) {
  const all = p.stages.flatMap((s) => s.tasks);
  const n = (t: TaskType) => all.filter((x) => x.task_type === t).length;
  return [
    `${p.stages.length} ${p.stages.length === 1 ? "etap" : "etapy"}`,
    `${n("PRACTICAL")} prac własnych`,
    `${n("COURSE")} kursów`,
    ...(n("THEORY") + n("QUIZ") ? ["teoria i quiz"] : []),
  ].join(" · ");
}

function PathCard({ e }: { e: MyPath }) {
  const { push } = useStore();
  const { data: p } = useApi(() => get<PathProgress>(`/me/paths/${e.path_version_id}/progress`), [e.path_version_id]);
  const { completed: done, total } = e.progress;
  const current = nextTask(p);
  return (
    <button
      type="button"
      onClick={() => push({ name: "path", versionId: e.path_version_id })}
      className="focus-ring group flex flex-col gap-5 overflow-hidden rounded-card bg-bg-2 p-5 text-left transition hover:shadow-[0_8px_30px_rgb(0_0_0/0.06)] sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Eyebrow>
            Wersja {e.path.version} · {enrollmentLabel[e.status]}
          </Eyebrow>
          <h2 className="font-display text-title2">{e.path.name}</h2>
          {p && <p className="text-subhead text-fg-2">{summary(p)}</p>}
        </div>
        <span className="grid size-14 shrink-0 place-items-center rounded-[16px] bg-brand-soft/14 font-display text-title3 tabular-nums text-brand">
          {total ? Math.round((done / total) * 100) : 0}%
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <ProgressBar done={done} total={total} />
        <span className="text-footnote tabular-nums text-fg-2">
          Zaliczone {done} z {total} zadań
        </span>
      </div>
      {current && (
        <div className="flex items-center gap-3 rounded-[14px] bg-bg-3/60 p-3">
          <StatusDot status={current.status} />
          <div className="min-w-0 flex-1">
            <div className="text-footnote text-fg-2">Następna praca</div>
            <div className="truncate text-headline">{current.name}</div>
          </div>
          <ArrowRight size={20} className="text-accent transition group-hover:translate-x-0.5" aria-hidden />
        </div>
      )}
    </button>
  );
}

export function PathsScreen() {
  const { data, error, reload } = useApi(() => get<MyPath[]>("/me/paths"), []);
  return (
    <Screen title="Moje ścieżki" subtitle="Polskie Stowarzyszenie Pasjonatów Kowalstwa">
      {!data ? (
        <Loading error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <p className="rounded-card border border-dashed hairline p-6 text-center text-subhead text-fg-2">
          Nie masz jeszcze żadnej ścieżki. Na ścieżkę zapisuje administrator PSPK.
        </p>
      ) : (
        data.map((e) => <PathCard key={e.id} e={e} />)
      )}
    </Screen>
  );
}

function TaskRow({ t }: { t: TaskItem }) {
  const { push } = useStore();
  return (
    <Row
      onClick={() => push({ name: "task", taskId: t.id })}
      leading={<StatusDot status={t.status} />}
      trailing={
        <span className="hidden shrink-0 sm:block">
          <StatusBadge status={t.status} />
        </span>
      }
    >
      <div className={cx("text-body", t.status === "LOCKED" && "text-fg-2")}>{t.name}</div>
      <div className="flex flex-wrap items-center gap-x-2 text-footnote text-fg-3">
        <span>{t.label}</span>
        <span aria-hidden>·</span>
        <span>{taskTypeLabel[t.task_type]}</span>
      </div>
      <div className="mt-1.5 sm:hidden">
        <StatusBadge status={t.status} />
      </div>
    </Row>
  );
}

function StageBlock({ s }: { s: PathProgress["stages"][number] }) {
  const works = s.tasks.filter((t) => t.task_type !== "COURSE");
  const courses = s.tasks.filter((t) => t.task_type === "COURSE");
  const passed = s.tasks.filter((t) => t.status === "PASSED").length;
  const locked = !s.gate_open;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 px-1">
        <Eyebrow>Etap {s.position}</Eyebrow>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="font-display text-title2">{s.name}</h2>
          <span className="text-footnote tabular-nums text-fg-2">
            {passed} z {s.tasks.length}
          </span>
        </div>
        {locked && (
          <p className="flex items-center gap-1.5 text-subhead text-fg-2">
            <Lock size={15} aria-hidden /> Odblokuje się po zaliczeniu wszystkich zadań poprzedniego etapu, także kursów.
          </p>
        )}
      </div>
      {works.length > 0 && (
        <Group title="Zadania po kolei" footer={locked ? undefined : "Odblokowują się po kolei: następne po zaliczeniu poprzedniego."}>
          {works.map((t) => (
            <TaskRow key={t.id} t={t} />
          ))}
        </Group>
      )}
      {courses.length > 0 && (
        <Group title="Kursy" footer={locked ? undefined : "Kursy możesz zaliczać w dowolnej kolejności. Wynik wpisuje instruktor po zajęciach."}>
          {courses.map((t) => (
            <TaskRow key={t.id} t={t} />
          ))}
        </Group>
      )}
    </section>
  );
}

export function PathScreen({ versionId }: { versionId: string }) {
  const { push, pop } = useStore();
  const { data: p, error, reload } = useApi(() => get<PathProgress>(`/me/paths/${versionId}/progress`), [versionId]);
  if (!p)
    return (
      <Screen title="Ścieżka" back="Ścieżki" onBack={pop}>
        <Loading error={error} onRetry={reload} />
      </Screen>
    );
  const current = nextTask(p);
  const { completed: done, total } = p.progress;
  return (
    <Screen
      title={p.path.name}
      back="Ścieżki"
      onBack={pop}
      subtitle={
        <span className="tabular-nums">
          Wersja {p.path.version} · zaliczone {done} z {total}
          {p.enrollment_status !== "ACTIVE" && ` · ${enrollmentLabel[p.enrollment_status]}`}
        </span>
      }
    >
      <ProgressBar done={done} total={total} />

      {current && (
        <section className="flex flex-col gap-4 rounded-card bg-accent p-5 text-accent-fg sm:flex-row sm:items-center sm:p-6">
          <div className="min-w-0 flex-1">
            <div className="text-footnote font-semibold uppercase tracking-[0.06em] opacity-80">Teraz · {current.label}</div>
            <h2 className="font-display text-title2">{current.name}</h2>
            <p className="mt-1 text-subhead opacity-90">
              {current.status === "NEEDS_IMPROVEMENT"
                ? "Instruktor skierował do poprawy. Zobacz uwagi i wyślij kolejną próbę."
                : current.status === "AVAILABLE"
                  ? "Praca czeka na Ciebie."
                  : "Twoja próba jest w toku."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => push({ name: "task", taskId: current.id })}
            className="focus-ring min-h-11 shrink-0 rounded-ctl bg-accent-fg px-5 text-subhead font-semibold text-accent transition active:scale-[0.98]"
          >
            Otwórz zadanie
          </button>
        </section>
      )}

      {p.stages.map((s) => (
        <StageBlock key={s.id} s={s} />
      ))}
      <p className="px-4 text-footnote text-fg-3">Liczba prób jest nieograniczona. Każda próba zostaje w historii.</p>
    </Screen>
  );
}

function Meta({ icon: Icon, label, value }: { icon: typeof Ruler; label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[16px] bg-bg-2 p-4">
      <Icon size={18} className="text-brand" aria-hidden />
      <span className="text-caption font-semibold uppercase tracking-[0.06em] text-fg-3">{label}</span>
      <span className="text-subhead font-semibold">{value}</span>
    </div>
  );
}

function Prose({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-card bg-bg-2 p-5">
      <h3 className="text-footnote font-bold uppercase tracking-[0.06em] text-fg">{title}</h3>
      <div className="max-w-[65ch] text-body text-fg-2">{children}</div>
    </section>
  );
}

/** "1. Rozcięcie…\n2. Odgięcie…" from the card → numbered steps. */
const steps = (text: string) =>
  text
    .split("\n")
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);

export function FeedbackCard({ s }: { s: Submission }) {
  const a = s.assessment;
  if (!a) return null;
  const passed = a.result === "PASSED";
  return (
    <section className={cx("flex flex-col gap-2 rounded-card p-5", passed ? "bg-ok/10" : "bg-warn/12")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={passed ? "ok" : "warn"}>{passed ? "Zaliczone" : "Do poprawy"}</Badge>
        <span className="text-footnote text-fg-2">
          {personName(a.instructor)} · {formatDateTime(a.created_at)}
        </span>
      </div>
      {a.comment && <p className="max-w-[65ch] text-body">{a.comment}</p>}
    </section>
  );
}

function TaskContent({ task }: { task: TaskDetail }) {
  const r: Revision = task.revision;
  const isCourse = r.task_type === "COURSE";
  const card = !!(r.description || r.instructions || r.assignment || r.evaluation_criteria);
  const empty = !card && !r.content_md && !r.materials.length && !r.attachments.length && !r.video_links.length && !isCourse;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {r.expected_duration_days && <Meta icon={Hourglass} label="Czas" value={durationLong(r.expected_duration_days)} />}
        {r.quantity_description && <Meta icon={Package} label="Do wykonania" value={r.quantity_description} />}
        {r.material && (
          <div className="col-span-2 sm:col-span-1">
            <Meta icon={Ruler} label="Materiał" value={r.material} />
          </div>
        )}
        {isCourse && <Meta icon={GraduationCap} label="Forma" value="Zajęcia z instruktorem" />}
      </div>

      {r.materials.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="px-1 text-footnote font-bold uppercase tracking-[0.06em] text-fg-3">
            {r.materials.length > 1 ? "Grafiki wzorcowych prac" : "Grafika wzorcowej pracy"}
          </h3>
          <div className={cx("grid gap-3", r.materials.length > 1 ? "grid-cols-2" : "grid-cols-1 sm:max-w-sm")}>
            {r.materials.map((m) => (
              <figure key={m.id} className="flex flex-col gap-1.5">
                <ApiPhotoTile path={`/tasks/${task.id}/materials/${m.id}`} label={m.caption ?? "Grafika wzorcowej pracy"} />
                {m.caption && <figcaption className="px-1 text-subhead font-semibold text-brand">{m.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      {isCourse && (
        <Prose title="Kurs">
          {r.description} Po zajęciach instruktor wpisuje wynik: zaliczony albo do powtórki z uwagami.
        </Prose>
      )}

      {!isCourse && r.description && <Prose title="Cel ćwiczenia">{r.description}</Prose>}
      {r.instructions && (
        <Prose title="Kolejność operacji">
          <ol className="flex flex-col gap-2">
            {steps(r.instructions).map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft/14 text-footnote font-semibold tabular-nums text-brand">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </Prose>
      )}

      {r.content_md && (
        <section className="flex flex-col gap-2 rounded-card bg-bg-2 p-5">
          <h3 className="text-footnote font-bold uppercase tracking-[0.06em] text-fg">{r.task_type === "QUIZ" ? "O teście" : "Materiał"}</h3>
          <Markdown source={r.content_md} />
        </section>
      )}

      {(r.attachments.length > 0 || r.video_links.length > 0) && <Attachments task={task} />}

      {r.task_type === "QUIZ" && (
        <section className="grid grid-cols-2 gap-3">
          <Meta icon={ListChecks} label="Pytania" value={`${r.questions.length} pytań zamkniętych`} />
          <Meta icon={Target} label="Zaliczenie" value={`od ${r.pass_threshold}% · wynik od razu`} />
        </section>
      )}

      {r.assignment &&
        (r.task_type === "THEORY" ? (
          <section className="flex gap-3 rounded-card border border-dashed border-brand-soft/50 p-5">
            <PenLine size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden />
            <div className="flex flex-col gap-1">
              <h3 className="text-footnote font-bold uppercase tracking-[0.06em]">Polecenie</h3>
              <p className="max-w-[65ch] text-body text-fg-2">{r.assignment}</p>
              {r.submission_requirements && <p className="max-w-[65ch] text-footnote text-fg-3">{r.submission_requirements} Odpowiedź ocenia instruktor.</p>}
            </div>
          </section>
        ) : (
          <Prose title="Zadanie">{r.assignment}</Prose>
        ))}
      {r.evaluation_criteria && r.task_type !== "THEORY" && <Prose title="Na co zwrócić uwagę">{r.evaluation_criteria}</Prose>}
      {r.submission_requirements && r.task_type === "PRACTICAL" && (
        <section className="flex gap-3 rounded-card border border-dashed border-brand-soft/50 p-5">
          <ClipboardList size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden />
          <div className="flex flex-col gap-1">
            <h3 className="text-footnote font-bold uppercase tracking-[0.06em]">Materiał do zaliczenia w aplikacji</h3>
            <p className="max-w-[65ch] text-body text-fg-2">{r.submission_requirements}</p>
          </div>
        </section>
      )}

      {empty && <p className="rounded-card border border-dashed hairline p-6 text-center text-subhead text-fg-2">Opis tego zadania jest w przygotowaniu.</p>}
    </>
  );
}

export function TaskScreen({ taskId }: { taskId: string }) {
  const { push, pop, toast } = useStore();
  const task = useApi(() => get<TaskDetail>(`/tasks/${taskId}`), [taskId]);
  const hist = useApi(() => get<Submission[]>(`/tasks/${taskId}/submissions`), [taskId]);
  const [busy, setBusy] = useState(false);
  const t = task.data;
  if (!t)
    return (
      <Screen title="Zadanie" back="Ścieżka" onBack={pop}>
        <Loading error={task.error} onRetry={task.reload} />
      </Screen>
    );

  const type = t.revision.task_type;
  const isCourse = type === "COURSE";
  const attempts = hist.data ?? [];
  const lastAssessed = attempts.find((a) => a.assessment);
  const open = attempts.find((a) => a.status === "DRAFT");
  const sent = attempts.find((a) => a.status === "SUBMITTED");
  const nextAttempt = (attempts[0]?.attempt_number ?? 0) + 1;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(errorText(e));
      await Promise.all([task.reload(), hist.reload()]); // show what the backend says now
    } finally {
      setBusy(false);
    }
  };
  const start = () =>
    act(async () => {
      const d = await post<Submission>(`/tasks/${taskId}/submissions`, {});
      push({ name: "draft", taskId, submissionId: d.id });
    });
  const withdraw = () =>
    act(async () => {
      await post(`/submissions/${sent!.id}/cancel`);
      toast("Zgłoszenie wycofane");
      await Promise.all([task.reload(), hist.reload()]);
    });

  let footer: ReactNode;
  if (t.status === "LOCKED") {
    footer = (
      <span className="flex items-center gap-2 text-subhead text-fg-2">
        <Lock size={18} className="shrink-0" aria-hidden />
        Odblokuje się po zaliczeniu poprzedniej pracy
      </span>
    );
  } else if (isCourse && t.status !== "PASSED") {
    footer = (
      <span className="flex items-center gap-2 text-subhead text-fg-2">
        <GraduationCap size={18} className="shrink-0" aria-hidden /> Zaliczenie potwierdza instruktor po zajęciach. Nic nie musisz wysyłać.
      </span>
    );
  } else if (type === "QUIZ" && (t.status === "AVAILABLE" || t.status === "NEEDS_IMPROVEMENT")) {
    footer = (
      <Button size="lg" icon={ListChecks} onClick={() => push({ name: "quiz", taskId })} className="flex-1 sm:flex-none">
        {t.status === "NEEDS_IMPROVEMENT" ? "Rozwiąż ponownie" : "Rozpocznij quiz"}
      </Button>
    );
  } else if (t.status === "AVAILABLE" || t.status === "NEEDS_IMPROVEMENT") {
    footer = (
      <Button size="lg" icon={Camera} disabled={busy} onClick={start} className="flex-1 sm:flex-none">
        {type === "THEORY" ? "Napisz odpowiedź" : `Rozpocznij próbę ${nextAttempt}`}
      </Button>
    );
  } else if (t.status === "IN_PROGRESS" && open) {
    footer = (
      <Button size="lg" icon={Camera} onClick={() => push({ name: "draft", taskId, submissionId: open.id })} className="flex-1 sm:flex-none">
        Kontynuuj szkic
      </Button>
    );
  } else if (t.status === "SUBMITTED" && sent) {
    footer = (
      <>
        <span className="flex flex-1 items-center gap-2 text-subhead text-fg-2">
          <Hourglass size={18} aria-hidden /> Czeka na instruktora
        </span>
        <Button variant="bordered" disabled={busy} onClick={withdraw}>
          Wycofaj
        </Button>
      </>
    );
  } else if (t.status === "UNDER_REVIEW") {
    footer = (
      <span className="flex items-center gap-2 text-subhead text-fg-2">
        <Hourglass size={18} aria-hidden /> Instruktor ocenia Twoją próbę
      </span>
    );
  }

  return (
    <Screen
      title={t.revision.name}
      back={`Etap ${t.stage.position}`}
      onBack={pop}
      subtitle={
        <div className="mt-1 flex flex-col gap-2">
          <span className="text-footnote font-bold uppercase tracking-[0.06em] text-fg-2">
            {t.label} · {taskTypeLabel[type]}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={t.status} />
            <span className="text-footnote text-fg-3">wersja treści {t.revision.revision_number}</span>
          </div>
        </div>
      }
      footer={footer}
    >
      <div className="-mt-3 order-first px-0.5">
        <Eyebrow>
          Etap {t.stage.position} · {t.stage.name}
        </Eyebrow>
      </div>

      {t.status === "NEEDS_IMPROVEMENT" && lastAssessed && <FeedbackCard s={lastAssessed} />}

      <TaskContent task={t} />

      {attempts.length > 0 && (
        <Group title="Historia prób">
          {attempts.map((a) => (
            <AttemptRow key={a.id} s={a} taskType={type} />
          ))}
        </Group>
      )}
    </Screen>
  );
}

function Attachments({ task }: { task: TaskDetail }) {
  const { toast } = useStore();
  const r = task.revision;
  return (
    <Group title="Materiały">
      {r.attachments.map((a) => (
        <Row
          key={a.id}
          onClick={() => openProtected(`/tasks/${task.id}/attachments/${a.id}`).catch((e) => toast(errorText(e)))}
          leading={<FileText size={22} className="shrink-0 text-bad" aria-hidden />}
        >
          <div className="text-body">{a.title}</div>
          <div className="text-footnote text-fg-2">PDF · {fileSize(a.file_size)}</div>
        </Row>
      ))}
      {r.video_links.map((v) => (
        <a
          key={v.id}
          href={v.url}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring flex min-h-11 w-full items-center gap-3 px-4 text-left border-t transition hairline first:border-t-0 hover:bg-fg/[0.03]"
        >
          <PlayCircle size={22} className="shrink-0 text-info" aria-hidden />
          <div className="min-w-0 flex-1 py-3">
            <div className="text-body">{v.title}</div>
            <div className="truncate text-footnote text-fg-2">Film · otwiera się w nowej karcie</div>
          </div>
          <ExternalLink size={16} className="shrink-0 text-fg-3" aria-hidden />
        </a>
      ))}
    </Group>
  );
}

export function AttemptRow({ s, taskType, taskName }: { s: Submission; taskType: TaskType; taskName?: string }) {
  const { push } = useStore();
  const st = submissionStatus[s.status];
  const course = taskType === "COURSE";
  const first = s.photos[0];
  const when = formatDateTime(s.submitted_at ?? s.created_at);
  return (
    <Row
      onClick={() => push({ name: "submission", id: s.id })}
      leading={<ApiPhotoTile path={first ? `/submissions/${s.id}/photos/${first.id}` : null} kind={taskType} className="size-12 shrink-0 rounded-[10px]" />}
    >
      <div className="text-body">{taskName ?? (course ? "Wynik kursu" : `Próba ${s.attempt_number}`)}</div>
      <div className="text-footnote tabular-nums text-fg-2">
        {course
          ? `wpisał(a) ${personName(s.assessment?.instructor ?? null)} · ${when}`
          : `${taskName ? `Próba ${s.attempt_number} · ` : ""}${when} · ${s.photos.length} zdj.`}
      </div>
      <div className="mt-1.5">
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
    </Row>
  );
}

export function DraftScreen({ taskId, submissionId }: { taskId: string; submissionId: string }) {
  const { pop, toast } = useStore();
  const task = useApi(() => get<TaskDetail>(`/tasks/${taskId}`), [taskId]);
  const sub = useApi(() => get<SubmissionDetail>(`/submissions/${submissionId}`), [submissionId]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [comment, setComment] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const t = task.data;
  const s = sub.data;
  if (!t || !s)
    return (
      <Screen title="Szkic" back="Zadanie" onBack={pop}>
        <Loading error={task.error ?? sub.error} onRetry={() => (task.reload(), sub.reload())} />
      </Screen>
    );

  const text = comment ?? s.comment ?? "";
  const photos = s.photos;
  const type = t.revision.task_type;
  const needsPhoto = type === "PRACTICAL";
  // A hint for the button only; the backend checks the requirements on submit (BR-22).
  const ok = needsPhoto ? photos.length >= 1 : photos.length >= 1 || text.trim().length > 0;
  const editable = s.status === "DRAFT";

  const saveComment = async () => {
    if (comment === null || comment === (s.comment ?? "")) return;
    await patch(`/submissions/${s.id}`, { comment });
    await sub.reload();
    setComment(null);
  };

  const add = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const accepted = Array.from(files).filter((f) => PHOTO_TYPES.includes(f.type));
    setError(
      accepted.length < files.length
        ? "Dozwolone są tylko zdjęcia JPEG, PNG lub WebP."
        : accepted.length > room
          ? `Limit to ${MAX_PHOTOS} zdjęć. Dodano ${room}, resztę pominięto.`
          : null,
    );
    const batch = accepted.slice(0, room);
    setUploading(batch.length);
    try {
      for (const f of batch) {
        await upload(`/submissions/${s.id}/photos`, f); // one by one: the server resizes each (ADR-25)
        setUploading((n) => n - 1);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setUploading(0);
      await sub.reload();
    }
  };

  const remove = async (photoId: string) => {
    try {
      await del(`/submissions/${s.id}/photos/${photoId}`);
    } catch (e) {
      setError(errorText(e));
    }
    await sub.reload();
  };

  const send = async () => {
    setBusy(true);
    try {
      await saveComment();
      await post(`/submissions/${s.id}/submit`);
      toast("Wysłano do oceny");
      pop();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const discard = async () => {
    setBusy(true);
    try {
      await post(`/submissions/${s.id}/cancel`);
      toast("Szkic porzucony");
      pop();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Screen
      title={`Próba ${s.attempt_number}`}
      back="Zadanie"
      onBack={() => void saveComment().finally(pop)}
      subtitle={`${t.revision.name} · szkic zapisuje się na serwerze`}
      footer={
        editable && (
          <>
            <span className={cx("flex flex-1 items-center gap-2 text-subhead", ok ? "text-ok" : "text-fg-2")}>
              {uploading ? `Wysyłanie zdjęć… (${uploading})` : ok ? "Gotowe do wysłania" : needsPhoto ? "Dodaj co najmniej 1 zdjęcie" : "Dodaj komentarz lub zdjęcie"}
            </span>
            <Button size="lg" icon={Send} disabled={!ok || busy || uploading > 0} onClick={send}>
              Wyślij do oceny
            </Button>
          </>
        )
      }
    >
      {t.revision.submission_requirements && (
        <section className="flex gap-3 rounded-card border border-dashed border-brand-soft/50 p-4">
          <ClipboardList size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden />
          <p className="max-w-[65ch] text-subhead text-fg-2">{t.revision.submission_requirements}</p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between px-1">
          <h3 className="text-headline">Zdjęcia</h3>
          <span className="text-footnote tabular-nums text-fg-2">
            {photos.length} / {MAX_PHOTOS}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {photos.map((p, i) => (
            <ApiPhotoTile
              key={p.id}
              path={`/submissions/${s.id}/photos/${p.id}`}
              label={`Zdjęcie ${i + 1}`}
              onRemove={editable ? () => void remove(p.id) : undefined}
            />
          ))}
          {editable && photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading > 0}
              className="focus-ring flex aspect-square flex-col items-center justify-center gap-1 rounded-[14px] border-2 border-dashed border-accent/40 text-accent transition hover:bg-accent/6"
            >
              <Camera size={26} aria-hidden />
              <span className="text-footnote font-semibold">Dodaj</span>
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          id="draft-photos"
          type="file"
          accept={PHOTO_TYPES.join(",")}
          multiple
          hidden
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = "";
          }}
        />
        {error && (
          <p className="px-1 text-footnote text-bad" role="alert">
            {error}
          </p>
        )}
        <p className="flex gap-2 px-1 text-footnote text-fg-3">
          <Info size={15} className="mt-px shrink-0" aria-hidden />
          Zdjęcia są zmniejszane do 2560 px: detale zostają czytelne, a plik zajmuje mało miejsca.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor="draft-comment" className="flex items-center gap-2 px-1 text-headline">
          <MessageSquareText size={18} className="text-accent" aria-hidden /> Komentarz dla instruktora
        </label>
        <textarea
          id="draft-comment"
          rows={4}
          value={text}
          disabled={!editable}
          onChange={(e) => setComment(e.target.value)}
          onBlur={() => void saveComment().catch((e) => setError(errorText(e)))}
          placeholder="Np. jakiego materiału użyłeś, co sprawiło trudność"
          className={inputClass + " bg-bg-2"}
        />
      </section>

      {editable && (
        <div className="flex flex-col items-start gap-2">
          {confirmDiscard ? (
            <div className="flex w-full flex-wrap items-center gap-3 rounded-card bg-bad/8 p-4">
              <span className="flex-1 text-subhead">Porzucić szkic? Zostanie w historii jako wycofany.</span>
              <Button variant="plain" onClick={() => setConfirmDiscard(false)}>
                Anuluj
              </Button>
              <Button variant="destructive" icon={Trash2} disabled={busy} onClick={discard}>
                Porzuć
              </Button>
            </div>
          ) : (
            <Button variant="plain" className="text-bad hover:bg-bad/8" onClick={() => setConfirmDiscard(true)}>
              Porzuć szkic
            </Button>
          )}
        </div>
      )}
    </Screen>
  );
}

export function HistoryScreen() {
  const { data, error, reload } = useApi(() => get<Page<MySubmission>>("/me/submissions?limit=200"), []);
  return (
    <Screen title="Zgłoszenia" subtitle="Wszystkie Twoje próby i wyniki kursów. Żadna nie jest usuwana.">
      {!data ? (
        <Loading error={error} onRetry={reload} />
      ) : data.items.length === 0 ? (
        <p className="rounded-card border border-dashed hairline p-6 text-center text-subhead text-fg-2">Nie masz jeszcze żadnych prób.</p>
      ) : (
        <Group footer={data.total > data.items.length ? `Pokazano ${data.items.length} najnowszych z ${data.total}.` : undefined}>
          {data.items.map((i) => (
            <AttemptRow key={i.submission.id} s={i.submission} taskType={i.task.task_type} taskName={i.task.label ? `${i.task.label} · ${i.task.name}` : i.task.name} />
          ))}
        </Group>
      )}
    </Screen>
  );
}

export function SubmissionScreen({ id }: { id: string }) {
  const { pop } = useStore();
  const { data: s, error, reload } = useApi(() => get<SubmissionDetail>(`/submissions/${id}`), [id]);
  if (!s)
    return (
      <Screen title="Próba" back="Wstecz" onBack={pop}>
        <Loading error={error} onRetry={reload} />
      </Screen>
    );
  const st = submissionStatus[s.status];
  const course = s.revision?.task_type === "COURSE";
  const name = s.revision?.name ?? "Szkic";
  return (
    <Screen
      title={course ? name : `Próba ${s.attempt_number}`}
      back="Wstecz"
      onBack={pop}
      subtitle={
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge tone={st.tone}>{st.label}</Badge>
          <span className="text-footnote text-fg-2">
            {course
              ? `Kurs · wynik wpisał(a) ${personName(s.assessment?.instructor ?? null)} · ${formatDateTime(s.assessed_at)}`
              : s.submitted_at
                ? `${name} · wysłano ${formatDateTime(s.submitted_at)} · treść zadania w wersji ${s.revision?.revision_number}`
                : `utworzono ${formatDateTime(s.created_at)}`}
          </span>
        </div>
      }
    >
      <FeedbackCard s={s} />
      {s.photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {s.photos.map((p, i) => (
            <ApiPhotoTile key={p.id} path={`/submissions/${s.id}/photos/${p.id}`} label={`Zdjęcie ${i + 1}`} />
          ))}
        </div>
      )}
      {s.comment && <Prose title="Twój komentarz">{s.comment}</Prose>}
    </Screen>
  );
}
