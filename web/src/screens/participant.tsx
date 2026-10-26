import { useRef, useState, type ReactNode } from "react";
import { ArrowRight, Camera, ClipboardList, ExternalLink, FileText, GraduationCap, Hourglass, Info, ListChecks, Lock, MessageSquareText, Package, PenLine, PlayCircle, Ruler, Send, Target, Trash2 } from "lucide-react";
import { Markdown } from "../components/markdown";
import { Screen } from "../components/screen";
import { Badge, Button, Group, inputClass, PhotoTile, ProgressBar, Row, StatusBadge, StatusDot, cx } from "../components/ui";
import { allTasks, useStore } from "../store";
import type { Attachment, Stage, Submission, Task } from "../mock/data";
import { durationLabel, durationLong, submissionStatus, taskLabel, taskTypeLabel } from "../lib/status";

const MAX_PHOTOS = 10;

function useProgress() {
  const { stages } = useStore();
  const tasks = allTasks(stages);
  const done = tasks.filter((t) => t.status === "PASSED").length;
  const current = tasks.find((t) => t.type !== "COURSE" && t.status !== "PASSED" && t.status !== "LOCKED");
  return { tasks, done, total: tasks.length, current };
}

/** Eyebrow in PSPK bronze, as on the paper task cards: "ETAP 1 · KOWALSTWO PODSTAWOWE". */
function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-footnote font-bold uppercase tracking-[0.08em] text-brand">{children}</span>;
}

export function PathsScreen() {
  const { push } = useStore();
  const { done, total, current } = useProgress();
  return (
    <Screen title="Moje ścieżki" subtitle="Polskie Stowarzyszenie Pasjonatów Kowalstwa">
      <button
        type="button"
        onClick={() => push({ name: "path" })}
        className="focus-ring group flex flex-col gap-5 overflow-hidden rounded-card bg-bg-2 p-5 text-left transition hover:shadow-[0_8px_30px_rgb(0_0_0/0.06)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Eyebrow>Wersja 1 · w trakcie</Eyebrow>
            <h2 className="font-display text-title2">Podstawy kowalstwa</h2>
            <p className="text-subhead text-fg-2">2 etapy · 24 prace własne · 9 kursów · teoria i quiz</p>
          </div>
          <span className="grid size-14 shrink-0 place-items-center rounded-[16px] bg-brand-soft/14 font-display text-title3 tabular-nums text-brand">
            {Math.round((done / total) * 100)}%
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
    </Screen>
  );
}

function TaskRow({ t, stage }: { t: Task; stage: Stage }) {
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
        <span>{taskLabel(stage, t)}</span>
        <span aria-hidden>·</span>
        <span>{taskTypeLabel[t.type]}</span>
        <span aria-hidden>·</span>
        <span>{durationLabel(t.expectedDays)}</span>
      </div>
      <div className="mt-1.5 sm:hidden">
        <StatusBadge status={t.status} />
      </div>
    </Row>
  );
}

function StageBlock({ s, locked }: { s: Stage; locked: boolean }) {
  const works = s.tasks.filter((t) => t.type !== "COURSE");
  const courses = s.tasks.filter((t) => t.type === "COURSE");
  const passed = s.tasks.filter((t) => t.status === "PASSED").length;
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
            <Lock size={15} aria-hidden /> Odblokuje się po zaliczeniu wszystkich zadań etapu {s.position - 1}, także kursów.
          </p>
        )}
      </div>
      <Group title="Zadania po kolei" footer={locked ? undefined : "Odblokowują się po kolei: następne po zaliczeniu poprzedniego."}>
        {works.map((t) => (
          <TaskRow key={t.id} t={t} stage={s} />
        ))}
      </Group>
      <Group title="Kursy" footer={locked ? undefined : "Kursy możesz zaliczać w dowolnej kolejności. Wynik wpisuje instruktor po zajęciach."}>
        {courses.map((t) => (
          <TaskRow key={t.id} t={t} stage={s} />
        ))}
      </Group>
    </section>
  );
}

export function PathScreen() {
  const { stages, push, pop } = useStore();
  const { done, total, current } = useProgress();
  return (
    <Screen
      title="Podstawy kowalstwa"
      back="Ścieżki"
      onBack={pop}
      subtitle={
        <span className="tabular-nums">
          Wersja 1 · zaliczone {done} z {total}
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
              {current.status === "NEEDS_IMPROVEMENT" ? "Instruktor skierował do poprawy. Zobacz uwagi i wyślij kolejną próbę." : "Praca czeka na Ciebie."}
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

      {stages.map((s, i) => (
        <StageBlock key={s.id} s={s} locked={i > 0 && stages[i - 1].tasks.some((t) => t.status !== "PASSED")} />
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

export function FeedbackCard({ s }: { s: Submission }) {
  if (!s.assessment) return null;
  const passed = s.assessment.result === "PASSED";
  return (
    <section className={cx("flex flex-col gap-2 rounded-card p-5", passed ? "bg-ok/10" : "bg-warn/12")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={passed ? "ok" : "warn"}>{passed ? "Zaliczone" : "Do poprawy"}</Badge>
        <span className="text-footnote text-fg-2">
          {s.assessment.instructor} · {s.assessment.at}
        </span>
      </div>
      <p className="max-w-[65ch] text-body">{s.assessment.comment}</p>
    </section>
  );
}

export function TaskScreen({ taskId }: { taskId: string }) {
  const { stages, history, push, pop, draft, setDraft, setStages, toast } = useStore();
  const list = allTasks(stages);
  const t = list.find((x) => x.id === taskId)!;
  const isCourse = t.type === "COURSE";
  const attempts = history.filter((h) => h.taskId === taskId);
  const last = attempts[0];
  const stageWorks = t.stage.tasks.filter((x) => x.type !== "COURSE");
  const prev = isCourse ? undefined : stageWorks[stageWorks.findIndex((x) => x.id === taskId) - 1];
  const gateClosed = t.stage.position > 1 && stages[t.stage.position - 2].tasks.some((x) => x.status !== "PASSED");
  const nextAttempt = (attempts[0]?.attempt ?? 0) + 1;

  const setStatus = (status: Task["status"]) =>
    setStages((ss) => ss.map((s) => ({ ...s, tasks: s.tasks.map((x) => (x.id === taskId ? { ...x, status } : x)) })));

  const start = () => {
    if (!draft || draft.taskId !== taskId) setDraft({ taskId, attempt: nextAttempt, comment: "", photos: [] });
    setStatus("IN_PROGRESS");
    push({ name: "draft", taskId });
  };

  const withdraw = () => {
    setStatus(last?.assessment ? "NEEDS_IMPROVEMENT" : "AVAILABLE");
    toast("Zgłoszenie wycofane");
  };

  let footer: ReactNode;
  if (t.status === "LOCKED") {
    footer = (
      <span className="flex items-center gap-2 text-subhead text-fg-2">
        <Lock size={18} className="shrink-0" aria-hidden />
        {gateClosed ? `Odblokuje się po zaliczeniu całego etapu ${t.stage.position - 1}` : `Odblokuje się po zaliczeniu: ${prev?.name}`}
      </span>
    );
  } else if (isCourse && t.status !== "PASSED") {
    footer = (
      <span className="flex items-center gap-2 text-subhead text-fg-2">
        <GraduationCap size={18} className="shrink-0" aria-hidden /> Zaliczenie potwierdza instruktor po zajęciach. Nic nie musisz wysyłać.
      </span>
    );
  } else if (t.type === "QUIZ" && (t.status === "AVAILABLE" || t.status === "NEEDS_IMPROVEMENT")) {
    footer = (
      <Button size="lg" icon={ListChecks} onClick={() => push({ name: "quiz", taskId })} className="flex-1 sm:flex-none">
        {t.status === "NEEDS_IMPROVEMENT" ? "Rozwiąż ponownie" : "Rozpocznij quiz"}
      </Button>
    );
  } else if (t.status === "AVAILABLE" || t.status === "NEEDS_IMPROVEMENT") {
    footer = (
      <Button size="lg" icon={Camera} onClick={start} className="flex-1 sm:flex-none">
        {t.type === "THEORY" ? `Napisz odpowiedź` : `Rozpocznij próbę ${nextAttempt}`}
      </Button>
    );
  } else if (t.status === "IN_PROGRESS") {
    footer = (
      <Button size="lg" icon={Camera} onClick={() => push({ name: "draft", taskId })} className="flex-1 sm:flex-none">
        Kontynuuj szkic
      </Button>
    );
  } else if (t.status === "SUBMITTED") {
    footer = (
      <>
        <span className="flex flex-1 items-center gap-2 text-subhead text-fg-2">
          <Hourglass size={18} aria-hidden /> Czeka na instruktora
        </span>
        <Button variant="bordered" onClick={withdraw}>
          Wycofaj
        </Button>
      </>
    );
  }

  const hasCard = !!t.description && t.type === "PRACTICAL";
  const hasContent = !!t.content && (t.type === "THEORY" || t.type === "QUIZ");

  return (
    <Screen
      title={t.name}
      back={`Etap ${t.stage.position}`}
      onBack={pop}
      subtitle={
        <div className="mt-1 flex flex-col gap-2">
          <span className="text-footnote font-bold uppercase tracking-[0.06em] text-fg-2">
            {t.label} · {taskTypeLabel[t.type]}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={t.status} />
            {hasCard && <span className="text-footnote text-fg-3">wersja treści {t.revision}</span>}
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

      {t.status === "NEEDS_IMPROVEMENT" && last && <FeedbackCard s={last} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Meta icon={Hourglass} label="Czas" value={durationLong(t.expectedDays)} />
        {t.quantity && <Meta icon={Package} label="Do wykonania" value={t.quantity} />}
        {t.material && (
          <div className="col-span-2 sm:col-span-1">
            <Meta icon={Ruler} label="Materiał" value={t.material} />
          </div>
        )}
        {isCourse && <Meta icon={GraduationCap} label="Forma" value="Zajęcia z instruktorem" />}
      </div>

      {t.reference && (
        <section className="flex flex-col gap-2">
          <h3 className="px-1 text-footnote font-bold uppercase tracking-[0.06em] text-fg-3">
            {t.reference.length > 1 ? "Grafiki wzorcowych prac" : "Grafika wzorcowej pracy"}
          </h3>
          <div className={cx("grid gap-3", t.reference.length > 1 ? "grid-cols-2" : "grid-cols-1 sm:max-w-sm")}>
            {t.reference.map((r) => (
              <figure key={r.photo.id} className="flex flex-col gap-1.5">
                <PhotoTile photo={r.photo} label={r.caption} />
                {t.reference!.length > 1 && <figcaption className="px-1 text-footnote text-fg-2">{r.caption}</figcaption>}
              </figure>
            ))}
          </div>
          {t.referenceNote && <p className="px-1 text-subhead font-semibold text-brand">{t.referenceNote}</p>}
        </section>
      )}

      {isCourse && <Prose title="Kurs">{t.description} Po zajęciach instruktor wpisuje wynik: zaliczony albo do powtórki z uwagami.</Prose>}

      {hasCard && (
        <>
          <Prose title="Cel ćwiczenia">{t.description}</Prose>
          <Prose title="Kolejność operacji">
            <ol className="flex flex-col gap-2">
              {t.instructions!.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft/14 text-footnote font-semibold tabular-nums text-brand">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </Prose>
          <Prose title="Zadanie">{t.assignment}</Prose>
          <Prose title="Na co zwrócić uwagę">{t.criteria}</Prose>
          <section className="flex gap-3 rounded-card border border-dashed border-brand-soft/50 p-5">
            <ClipboardList size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden />
            <div className="flex flex-col gap-1">
              <h3 className="text-footnote font-bold uppercase tracking-[0.06em]">Materiał do zaliczenia w aplikacji</h3>
              <p className="max-w-[65ch] text-body text-fg-2">{t.requirements}</p>
            </div>
          </section>
        </>
      )}

      {hasContent && (
        <section className="flex flex-col gap-2 rounded-card bg-bg-2 p-5">
          <h3 className="text-footnote font-bold uppercase tracking-[0.06em] text-fg">{t.type === "QUIZ" ? "O teście" : "Materiał"}</h3>
          <Markdown source={t.content!} />
        </section>
      )}

      {t.attachments && t.attachments.length > 0 && <Attachments items={t.attachments} />}

      {t.type === "QUIZ" && t.quiz && (
        <section className="grid grid-cols-2 gap-3">
          <Meta icon={ListChecks} label="Pytania" value={`${t.quiz.questions.length} pytań zamkniętych`} />
          <Meta icon={Target} label="Zaliczenie" value={`od ${t.quiz.threshold}% · wynik od razu`} />
        </section>
      )}

      {t.type === "THEORY" && t.assignment && (
        <section className="flex gap-3 rounded-card border border-dashed border-brand-soft/50 p-5">
          <PenLine size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden />
          <div className="flex flex-col gap-1">
            <h3 className="text-footnote font-bold uppercase tracking-[0.06em]">Polecenie</h3>
            <p className="max-w-[65ch] text-body text-fg-2">{t.assignment}</p>
            {t.requirements && <p className="max-w-[65ch] text-footnote text-fg-3">{t.requirements} Odpowiedź ocenia instruktor.</p>}
          </div>
        </section>
      )}

      {!hasCard && !hasContent && !isCourse && (
        <p className="rounded-card border border-dashed hairline p-6 text-center text-subhead text-fg-2">
          Karta tego zadania jest w przygotowaniu. W makiecie pełne karty mają „Haczyk / zawieszka” i „Serce [dwa sposoby]”.
        </p>
      )}

      {attempts.length > 0 && (
        <Group title="Historia prób">
          {attempts.map((a) => (
            <AttemptRow key={a.id} s={a} />
          ))}
        </Group>
      )}
    </Screen>
  );
}

function Attachments({ items }: { items: Attachment[] }) {
  const { toast } = useStore();
  return (
    <Group title="Materiały">
      {items.map((a) =>
        a.kind === "PDF" ? (
          <Row key={a.id} onClick={() => toast("W aplikacji PDF otworzy się w przeglądarce")} leading={<FileText size={22} className="shrink-0 text-bad" aria-hidden />}>
            <div className="text-body">{a.title}</div>
            <div className="text-footnote text-fg-2">PDF · {a.size}</div>
          </Row>
        ) : (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring flex min-h-11 w-full items-center gap-3 px-4 text-left border-t transition hairline first:border-t-0 hover:bg-fg/[0.03]"
          >
            <PlayCircle size={22} className="shrink-0 text-info" aria-hidden />
            <div className="min-w-0 flex-1 py-3">
              <div className="text-body">{a.title}</div>
              <div className="truncate text-footnote text-fg-2">Film · otwiera się w nowej karcie</div>
            </div>
            <ExternalLink size={16} className="shrink-0 text-fg-3" aria-hidden />
          </a>
        ),
      )}
    </Group>
  );
}

export function AttemptRow({ s, showTask }: { s: Submission; showTask?: boolean }) {
  const { push } = useStore();
  const st = submissionStatus[s.status];
  return (
    <Row onClick={() => push({ name: "submission", id: s.id })} leading={<PhotoTile photo={s.photos[0]} className="size-12 shrink-0 rounded-[10px]" />}>
      <div className="text-body">{showTask ? s.taskName : s.recordedBy ? "Wynik kursu" : `Próba ${s.attempt}`}</div>
      <div className="text-footnote tabular-nums text-fg-2">
        {s.recordedBy ? `wpisał(a) ${s.recordedBy} · ${s.submittedAt}` : `${showTask ? `Próba ${s.attempt} · ` : ""}${s.submittedAt} · ${s.photos.length} zdj.`}
      </div>
      <div className="mt-1.5">
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
    </Row>
  );
}

export function DraftScreen({ taskId }: { taskId: string }) {
  const { stages, draft, setDraft, pop, setStages, setHistory, toast } = useStore();
  const t = allTasks(stages).find((x) => x.id === taskId)!;
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  if (!draft) return null;

  const photos = draft.photos;
  const needsPhoto = t.type === "PRACTICAL";
  const ok = needsPhoto ? photos.length >= 1 : photos.length >= 1 || draft.comment.trim().length > 0;

  const add = (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const accepted = Array.from(files).filter((f) => ["image/jpeg", "image/png", "image/webp"].includes(f.type));
    if (accepted.length < files.length) setError("Dozwolone są tylko zdjęcia JPEG, PNG lub WebP.");
    else if (accepted.length > room) setError(`Limit to ${MAX_PHOTOS} zdjęć. Dodano ${room}, resztę pominięto.`);
    else setError(null);
    const next = accepted.slice(0, room).map((f) => ({ id: crypto.randomUUID(), url: URL.createObjectURL(f), name: f.name }));
    setDraft({ ...draft, photos: [...photos, ...next] });
  };

  const setStatus = (status: Task["status"]) =>
    setStages((ss) => ss.map((s) => ({ ...s, tasks: s.tasks.map((x) => (x.id === taskId ? { ...x, status } : x)) })));

  const send = () => {
    setHistory((h) => [
      {
        id: `sub-${Date.now()}`,
        taskId,
        taskName: t.name,
        participant: "Jan Kowalski",
        attempt: draft.attempt,
        status: "SUBMITTED",
        comment: draft.comment,
        photos: photos.map((p, i) => ({ id: p.id, url: p.url, tone: 20 + i * 4, motif: "hook" as const })),
        submittedAt: "teraz",
        revision: t.revision,
        stageName: t.stage.name,
      },
      ...h,
    ]);
    setStatus("SUBMITTED");
    setDraft(null);
    toast("Wysłano do oceny");
    pop();
  };

  const discard = () => {
    setDraft(null);
    setStatus(draft.attempt > 1 ? "NEEDS_IMPROVEMENT" : "AVAILABLE");
    toast("Szkic porzucony");
    pop();
  };

  return (
    <Screen
      title={`Próba ${draft.attempt}`}
      back="Zadanie"
      onBack={pop}
      subtitle={`${t.name} · szkic zapisuje się automatycznie`}
      footer={
        <>
          <span className={cx("flex flex-1 items-center gap-2 text-subhead", ok ? "text-ok" : "text-fg-2")}>
            {ok ? "Gotowe do wysłania" : needsPhoto ? "Dodaj co najmniej 1 zdjęcie" : "Dodaj komentarz lub zdjęcie"}
          </span>
          <Button size="lg" icon={Send} disabled={!ok} onClick={send}>
            Wyślij do oceny
          </Button>
        </>
      }
    >
      {t.requirements && (
        <section className="flex gap-3 rounded-card border border-dashed border-brand-soft/50 p-4">
          <ClipboardList size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden />
          <p className="max-w-[65ch] text-subhead text-fg-2">{t.requirements}</p>
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
            <PhotoTile
              key={p.id}
              photo={{ id: p.id, url: p.url, tone: 0, motif: "hook" }}
              label={`Zdjęcie ${i + 1}: ${p.name}`}
              onRemove={() => setDraft({ ...draft, photos: photos.filter((x) => x.id !== p.id) })}
            />
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
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
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        {error && <p className="px-1 text-footnote text-bad">{error}</p>}
        <p className="flex gap-2 px-1 text-footnote text-fg-3">
          <Info size={15} className="mt-px shrink-0" aria-hidden />
          Zdjęcia zostaną zmniejszone do 2560 px: detale zostają czytelne, a plik zajmuje mało miejsca.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor="draft-comment" className="flex items-center gap-2 px-1 text-headline">
          <MessageSquareText size={18} className="text-accent" aria-hidden /> Komentarz dla instruktora
        </label>
        <textarea
          id="draft-comment"
          rows={4}
          value={draft.comment}
          onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
          placeholder="Np. jakiego materiału użyłeś, co sprawiło trudność"
          className={inputClass + " bg-bg-2"}
        />
      </section>

      <div className="flex flex-col items-start gap-2">
        {confirmDiscard ? (
          <div className="flex w-full flex-wrap items-center gap-3 rounded-card bg-bad/8 p-4">
            <span className="flex-1 text-subhead">Porzucić szkic? Zostanie w historii jako wycofany.</span>
            <Button variant="plain" onClick={() => setConfirmDiscard(false)}>
              Anuluj
            </Button>
            <Button variant="destructive" icon={Trash2} onClick={discard}>
              Porzuć
            </Button>
          </div>
        ) : (
          <Button variant="plain" className="text-bad hover:bg-bad/8" onClick={() => setConfirmDiscard(true)}>
            Porzuć szkic
          </Button>
        )}
      </div>
    </Screen>
  );
}

export function HistoryScreen() {
  const { history } = useStore();
  return (
    <Screen title="Zgłoszenia" subtitle="Wszystkie Twoje próby i wyniki kursów. Żadna nie jest usuwana.">
      <Group>
        {history.map((s) => (
          <AttemptRow key={s.id} s={s} showTask />
        ))}
      </Group>
    </Screen>
  );
}

export function SubmissionScreen({ id }: { id: string }) {
  const { history, pop } = useStore();
  const s = history.find((h) => h.id === id);
  if (!s) return null;
  const st = submissionStatus[s.status];
  return (
    <Screen
      title={s.recordedBy ? s.taskName : `Próba ${s.attempt}`}
      back="Wstecz"
      onBack={pop}
      subtitle={
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge tone={st.tone}>{st.label}</Badge>
          <span className="text-footnote text-fg-2">
            {s.recordedBy
              ? `Kurs · wynik wpisał(a) ${s.recordedBy} · ${s.submittedAt}`
              : `${s.taskName} · wysłano ${s.submittedAt} · treść zadania w wersji ${s.revision}`}
          </span>
        </div>
      }
    >
      <FeedbackCard s={s} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {s.photos.map((p, i) => (
          <PhotoTile key={p.id} photo={p} label={`Zdjęcie ${i + 1}`} />
        ))}
      </div>
      {s.comment && <Prose title="Twój komentarz">{s.comment}</Prose>}
    </Screen>
  );
}
