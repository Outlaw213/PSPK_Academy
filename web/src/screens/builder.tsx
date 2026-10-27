import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpenText,
  Copy,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  Hammer,
  ListChecks,
  MoreHorizontal,
  MoveRight,
  PlayCircle,
  Plus,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Screen } from "../components/screen";
import { Markdown } from "../components/markdown";
import { Button, Field, Group, inputClass, PhotoTile, Row, Segmented, Sheet, cx } from "../components/ui";
import { allTasks, taskLabel, useStore } from "../store";
import type { Attachment, QuizQuestion, Stage, Task, TaskType } from "../mock/data";
import { durationLabel, taskTypeLabel } from "../lib/status";

// Admin path builder (FR-ADM-02, Q-63). In the app every content save creates a new
// task revision (BR-19) and passes never get revoked (BR-16) — the backend enforces both.

const typeInfo: Record<TaskType, { icon: LucideIcon; hint: string }> = {
  PRACTICAL: { icon: Hammer, hint: "Wyrób wykonany samodzielnie. Uczestnik wysyła zdjęcia, ocenia instruktor." },
  COURSE: { icon: GraduationCap, hint: "Zajęcia z instruktorem. Wynik wpisuje instruktor, poza kolejnością w etapie." },
  THEORY: { icon: BookOpenText, hint: "Materiał do przeczytania i polecenie. Odpowiedź ocenia instruktor." },
  QUIZ: { icon: ListChecks, hint: "Pytania zamknięte z kluczem. Zaliczenie automatyczne od progu." },
};


const uid = () => Math.random().toString(36).slice(2, 9);

function renumber(stages: Stage[]): Stage[] {
  return stages.map((s, i) => ({ ...s, position: i + 1, tasks: s.tasks.map((t, j) => ({ ...t, position: j + 1 })) }));
}

export function VersionScreen() {
  const { stages, setStages, push, pop, toast } = useStore();
  const [accepting, setAccepting] = useState(true);
  const [off, setOff] = useState<string[]>([]);
  const [menu, setMenu] = useState<Task | null>(null);
  const [adding, setAdding] = useState<Stage | null>(null);
  const [newType, setNewType] = useState<TaskType>("PRACTICAL");
  const [newName, setNewName] = useState("");
  const [stageSheet, setStageSheet] = useState(false);
  const [stageName, setStageName] = useState("");

  const update = (f: (s: Stage[]) => Stage[]) => setStages((ss) => renumber(f(ss)));

  const moveTask = (task: Task, dir: -1 | 1) =>
    update((ss) =>
      ss.map((s) => {
        const i = s.tasks.findIndex((x) => x.id === task.id);
        if (i < 0 || i + dir < 0 || i + dir >= s.tasks.length) return s;
        const tasks = [...s.tasks];
        [tasks[i], tasks[i + dir]] = [tasks[i + dir], tasks[i]];
        return { ...s, tasks };
      }),
    );

  const moveToStage = (task: Task, stageId: string) => {
    update((ss) => ss.map((s) => (s.id === stageId ? { ...s, tasks: [...s.tasks.filter((x) => x.id !== task.id), task] } : { ...s, tasks: s.tasks.filter((x) => x.id !== task.id) })));
    toast("Przeniesiono na koniec etapu");
  };

  const moveStage = (i: number, dir: -1 | 1) =>
    update((ss) => {
      if (i + dir < 0 || i + dir >= ss.length) return ss;
      const next = [...ss];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });

  const createTask = () => {
    if (!adding || !newName.trim()) return;
    const task: Task = {
      id: `new-${uid()}`,
      position: 0,
      name: newName.trim(),
      type: newType,
      status: "LOCKED",
      revision: 1,
      expectedDays: newType === "COURSE" ? 1 : newType === "PRACTICAL" ? 14 : 7,
      ...(newType === "QUIZ" ? { content: "", quiz: { threshold: 80, questions: [] } } : {}),
      ...(newType === "THEORY" ? { content: "", assignment: "" } : {}),
    };
    update((ss) => ss.map((s) => (s.id === adding.id ? { ...s, tasks: [...s.tasks, task] } : s)));
    setAdding(null);
    setNewName("");
    push({ name: "task-edit", taskId: task.id });
  };

  const createStage = () => {
    if (!stageName.trim()) return;
    update((ss) => [...ss, { id: `st-${uid()}`, position: 0, name: stageName.trim(), tasks: [] }]);
    setStageSheet(false);
    setStageName("");
    toast("Dodano etap");
  };

  return (
    <Screen
      title="Podstawy kowalstwa · v1"
      back="Ścieżki"
      onBack={pop}
      subtitle="Układasz kolejność, treść i typy zadań. Zaliczeń uczestników nic nie cofa."
      actions={
        <Button variant="plain" icon={Copy} onClick={() => toast("Utworzono wersję 2 (kopia)")}>
          Kopia
        </Button>
      }
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

      {stages.map((s, si) => (
        <section key={s.id} className="flex flex-col gap-2">
          <div className="flex items-center gap-1 px-1">
            <div className="min-w-0 flex-1">
              <div className="text-footnote font-bold uppercase tracking-[0.08em] text-brand">Etap {s.position}</div>
              <h2 className="truncate font-display text-title3">{s.name}</h2>
            </div>
            <Button variant="plain" className="w-11 px-0" aria-label={`Etap ${s.position} wyżej`} icon={ArrowUp} disabled={si === 0} onClick={() => moveStage(si, -1)} />
            <Button variant="plain" className="w-11 px-0" aria-label={`Etap ${s.position} niżej`} icon={ArrowDown} disabled={si === stages.length - 1} onClick={() => moveStage(si, 1)} />
          </div>
          <div className="overflow-hidden rounded-card bg-bg-2">
            {s.tasks.map((t) => {
              const disabled = off.includes(t.id);
              const Icon = typeInfo[t.type].icon;
              return (
                <div key={t.id} className="flex min-h-11 items-center gap-1 border-t pl-4 pr-1 hairline first:border-t-0">
                  <Icon size={18} className={cx("shrink-0", disabled ? "text-fg-3" : "text-brand")} aria-hidden />
                  <button type="button" onClick={() => push({ name: "task-edit", taskId: t.id })} className="focus-ring min-w-0 flex-1 rounded-ctl py-3 pl-2 text-left">
                    <div className={cx("truncate text-body", disabled && "text-fg-3 line-through")}>
                      {taskLabel(s, t)} · {t.name}
                    </div>
                    <div className="truncate text-footnote text-fg-2">
                      {taskTypeLabel[t.type]} · {durationLabel(t.expectedDays)} · wersja treści {t.revision}
                      {disabled && " · wyłączone"}
                    </div>
                  </button>
                  <Button variant="plain" className="w-11 shrink-0 px-0" aria-label={`Działania: ${t.name}`} icon={MoreHorizontal} onClick={() => setMenu(t)} />
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setAdding(s);
                setNewType("PRACTICAL");
              }}
              className="focus-ring flex min-h-11 w-full items-center gap-3 border-t px-4 py-3 text-left text-body text-accent hairline first:border-t-0 hover:bg-accent/6"
            >
              <Plus size={20} aria-hidden /> Dodaj zadanie
            </button>
          </div>
        </section>
      ))}

      <Button variant="bordered" icon={Plus} size="lg" onClick={() => setStageSheet(true)}>
        Dodaj etap
      </Button>

      <Sheet open={!!menu} title={menu?.name ?? ""} onClose={() => setMenu(null)}>
        {menu && (
          <div className="flex flex-col gap-4">
            <Group>
              <Row chevron={false} leading={<ArrowUp size={20} className="text-accent" aria-hidden />} onClick={() => (moveTask(menu, -1), setMenu(null))}>
                <span className="text-body">Przesuń wyżej</span>
              </Row>
              <Row chevron={false} leading={<ArrowDown size={20} className="text-accent" aria-hidden />} onClick={() => (moveTask(menu, 1), setMenu(null))}>
                <span className="text-body">Przesuń niżej</span>
              </Row>
              <Row
                chevron={false}
                leading={off.includes(menu.id) ? <Eye size={20} className="text-accent" aria-hidden /> : <EyeOff size={20} className="text-accent" aria-hidden />}
                onClick={() => {
                  setOff(off.includes(menu.id) ? off.filter((x) => x !== menu.id) : [...off, menu.id]);
                  setMenu(null);
                }}
              >
                <span className="text-body">{off.includes(menu.id) ? "Włącz zadanie" : "Wyłącz zadanie"}</span>
                <div className="text-footnote text-fg-2">Historia prób zostaje. Niedozwolone, gdy zadanie ma zgłoszenia w ocenie.</div>
              </Row>
            </Group>
            <Group title="Przenieś do etapu">
              {stages
                .filter((s) => !s.tasks.some((x) => x.id === menu.id))
                .map((s) => (
                  <Row key={s.id} chevron={false} leading={<MoveRight size={20} className="text-accent" aria-hidden />} onClick={() => (moveToStage(menu, s.id), setMenu(null))}>
                    <span className="text-body">
                      Etap {s.position} · {s.name}
                    </span>
                  </Row>
                ))}
            </Group>
          </div>
        )}
      </Sheet>

      <Sheet open={!!adding} title={adding ? `Nowe zadanie · Etap ${adding.position}` : ""} onClose={() => setAdding(null)}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            createTask();
          }}
        >
          <div role="radiogroup" aria-label="Typ zadania" className="grid grid-cols-2 gap-2">
            {(Object.keys(typeInfo) as TaskType[]).map((k) => {
              const Icon = typeInfo[k].icon;
              const on = newType === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setNewType(k)}
                  className={cx("focus-ring flex flex-col items-start gap-1 rounded-[16px] border-2 p-3 text-left transition", on ? "border-accent bg-accent/8" : "border-transparent bg-bg-2")}
                >
                  <Icon size={22} className={on ? "text-accent" : "text-brand"} aria-hidden />
                  <span className="text-headline">{taskTypeLabel[k]}</span>
                  <span className="text-caption text-fg-2">{typeInfo[k].hint}</span>
                </button>
              );
            })}
          </div>
          <Field label="Tytuł">
            {(id) => <input id={id} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Np. Gatunki stali" className={inputClass} />}
          </Field>
          <Button type="submit" size="lg" disabled={!newName.trim()}>
            Utwórz i edytuj
          </Button>
        </form>
      </Sheet>

      <Sheet open={stageSheet} title="Nowy etap" onClose={() => setStageSheet(false)}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            createStage();
          }}
        >
          <Field label="Nazwa etapu">{(id) => <input id={id} value={stageName} onChange={(e) => setStageName(e.target.value)} placeholder="Np. Kowalstwo artystyczne" className={inputClass} />}</Field>
          <Button type="submit" size="lg" disabled={!stageName.trim()}>
            Dodaj etap
          </Button>
        </form>
      </Sheet>
    </Screen>
  );
}

function QuizEditor({ value, onChange }: { value: { threshold: number; questions: QuizQuestion[] }; onChange: (v: { threshold: number; questions: QuizQuestion[] }) => void }) {
  const qs = value.questions;
  const setQ = (id: string, f: (q: QuizQuestion) => QuizQuestion) => onChange({ ...value, questions: qs.map((q) => (q.id === id ? f(q) : q)) });
  const need = Math.ceil((value.threshold / 100) * Math.max(qs.length, 1));
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-card bg-bg-2 p-5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="quiz-threshold" className="text-headline">
            Próg zaliczenia
          </label>
          <span className="font-display text-title3 tabular-nums text-accent">{value.threshold}%</span>
        </div>
        <input id="quiz-threshold" type="range" min={50} max={100} step={5} value={value.threshold} onChange={(e) => onChange({ ...value, threshold: +e.target.value })} className="w-full accent-[rgb(var(--accent))]" />
        <p className="text-footnote text-fg-2">
          {qs.length ? `Uczestnik musi odpowiedzieć poprawnie na ${need} z ${qs.length} pytań.` : "Dodaj pytania."} Zaliczenie jest automatyczne, bez instruktora.
        </p>
      </div>

      {qs.map((q, n) => (
        <div key={q.id} className="flex flex-col gap-3 rounded-card bg-bg-2 p-5">
          <div className="flex items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft/14 text-footnote font-semibold tabular-nums text-brand">{n + 1}</span>
            <span className="flex-1 text-headline">Pytanie</span>
            <Button
              variant="plain"
              className="w-11 px-0"
              icon={ArrowUp}
              aria-label="Pytanie wyżej"
              disabled={n === 0}
              onClick={() => {
                const next = [...qs];
                [next[n - 1], next[n]] = [next[n], next[n - 1]];
                onChange({ ...value, questions: next });
              }}
            />
            <Button variant="plain" className="w-11 px-0 text-bad" icon={Trash2} aria-label="Usuń pytanie" onClick={() => onChange({ ...value, questions: qs.filter((x) => x.id !== q.id) })} />
          </div>
          <textarea rows={2} aria-label={`Treść pytania ${n + 1}`} value={q.text} onChange={(e) => setQ(q.id, (x) => ({ ...x, text: e.target.value }))} className={inputClass} placeholder="Treść pytania" />
          <Segmented
            label={`Rodzaj pytania ${n + 1}`}
            value={q.kind}
            onChange={(kind) => setQ(q.id, (x) => ({ ...x, kind, options: kind === "SINGLE" ? x.options.map((o, i) => ({ ...o, correct: i === Math.max(0, x.options.findIndex((y) => y.correct)) })) : x.options }))}
            options={[
              { value: "SINGLE", label: "Jedna odpowiedź" },
              { value: "MULTI", label: "Kilka odpowiedzi" },
            ]}
          />
          <div className="flex flex-col gap-2">
            {q.options.map((o) => (
              <div key={o.id} className="flex items-center gap-2">
                <button
                  type="button"
                  role={q.kind === "SINGLE" ? "radio" : "checkbox"}
                  aria-checked={o.correct}
                  aria-label={`Poprawna: ${o.text || "odpowiedź"}`}
                  onClick={() =>
                    setQ(q.id, (x) => ({
                      ...x,
                      options: x.options.map((y) => (x.kind === "SINGLE" ? { ...y, correct: y.id === o.id } : y.id === o.id ? { ...y, correct: !y.correct } : y)),
                    }))
                  }
                  className="focus-ring grid size-11 shrink-0 place-items-center"
                >
                  <span className={cx("grid size-6 place-items-center border-2", q.kind === "SINGLE" ? "rounded-full" : "rounded-[7px]", o.correct ? "border-ok bg-ok text-bg-2" : "border-fg/25")}>
                    {o.correct && <span className="size-2 rounded-full bg-current" />}
                  </span>
                </button>
                <input aria-label="Treść odpowiedzi" value={o.text} onChange={(e) => setQ(q.id, (x) => ({ ...x, options: x.options.map((y) => (y.id === o.id ? { ...y, text: e.target.value } : y)) }))} className={inputClass + " py-2"} placeholder="Odpowiedź" />
                <Button variant="plain" className="w-11 shrink-0 px-0 text-fg-3" icon={Trash2} aria-label="Usuń odpowiedź" onClick={() => setQ(q.id, (x) => ({ ...x, options: x.options.filter((y) => y.id !== o.id) }))} />
              </div>
            ))}
            <Button variant="plain" icon={Plus} className="self-start" onClick={() => setQ(q.id, (x) => ({ ...x, options: [...x.options, { id: uid(), text: "", correct: false }] }))}>
              Dodaj odpowiedź
            </Button>
            {!q.options.some((o) => o.correct) && <p className="text-footnote text-bad">Zaznacz co najmniej jedną poprawną odpowiedź (kółko po lewej).</p>}
          </div>
        </div>
      ))}

      <Button
        variant="bordered"
        icon={Plus}
        onClick={() =>
          onChange({
            ...value,
            questions: [...qs, { id: uid(), text: "", kind: "SINGLE", options: [{ id: uid(), text: "", correct: true }, { id: uid(), text: "", correct: false }] }],
          })
        }
      >
        Dodaj pytanie
      </Button>
    </section>
  );
}

function AttachmentsEditor({ items, onChange }: { items: Attachment[]; onChange: (a: Attachment[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const linkOk = /^https:\/\/\S+$/.test(link.trim());
  return (
    <Group title="Materiały" footer="PDF do 20 MB, przechowywany na serwerze PSPK. Filmy jako linki https (np. YouTube), otwierane w nowej karcie.">
      {items.map((a) => (
        <Row
          key={a.id}
          chevron={false}
          leading={a.kind === "PDF" ? <FileText size={22} className="shrink-0 text-bad" aria-hidden /> : <PlayCircle size={22} className="shrink-0 text-info" aria-hidden />}
          trailing={<Button variant="plain" className="w-11 shrink-0 px-0 text-fg-3" icon={Trash2} aria-label={`Usuń ${a.title}`} onClick={() => onChange(items.filter((x) => x.id !== a.id))} />}
        >
          <div className="truncate text-body">{a.title}</div>
          <div className="truncate text-footnote text-fg-2">{a.kind === "PDF" ? `PDF · ${a.size}` : a.url}</div>
        </Row>
      ))}
      <div className="flex flex-col gap-2 border-t p-3 hairline">
        <div className="flex flex-wrap gap-2">
          <Button variant="bordered" icon={FileText} onClick={() => fileRef.current?.click()}>
            Dodaj PDF
          </Button>
        </div>
        <input
          ref={fileRef}
          id="attachment-pdf"
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onChange([...items, { id: uid(), kind: "PDF", title: f.name.replace(/\.pdf$/i, ""), size: `${(f.size / 1048576).toFixed(1).replace(".", ",")} MB` }]);
            e.target.value = "";
          }}
        />
        <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
          <input aria-label="Tytuł filmu" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tytuł filmu" className={inputClass + " py-2"} />
          <input aria-label="Link do filmu" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" inputMode="url" className={inputClass + " py-2"} aria-invalid={!!link && !linkOk} />
          <Button
            variant="bordered"
            icon={PlayCircle}
            disabled={!linkOk}
            onClick={() => {
              onChange([...items, { id: uid(), kind: "VIDEO_LINK", title: title.trim() || "Film", url: link.trim() }]);
              setLink("");
              setTitle("");
            }}
          >
            Dodaj film
          </Button>
        </div>
        {!!link && !linkOk && <p className="px-1 text-footnote text-bad">Link musi zaczynać się od https://</p>}
      </div>
    </Group>
  );
}

export function TaskEditScreen({ taskId }: { taskId: string }) {
  const { stages, setStages, pop, push, toast } = useStore();
  const t = allTasks(stages).find((x) => x.id === taskId)!;
  const [f, setF] = useState({
    name: t.name,
    type: t.type,
    days: String(t.expectedDays),
    quantity: t.quantity ?? "",
    material: t.material ?? "",
    description: t.description ?? "",
    content: t.content ?? "",
    instructions: (t.instructions ?? []).join("\n"),
    assignment: t.assignment ?? "",
    criteria: t.criteria ?? "",
    requirements: t.requirements ?? "",
  });
  const [attachments, setAttachments] = useState<Attachment[]>(t.attachments ?? []);
  const [quiz, setQuiz] = useState(t.quiz ?? { threshold: 80, questions: [] });
  const [mdPreview, setMdPreview] = useState(false);

  const quizProblem =
    f.type === "QUIZ" &&
    (quiz.questions.length === 0
      ? "Quiz musi mieć co najmniej jedno pytanie."
      : quiz.questions.some((q) => !q.text.trim() || q.options.length < 2 || !q.options.some((o) => o.correct))
        ? "Każde pytanie potrzebuje treści, co najmniej dwóch odpowiedzi i poprawnej odpowiedzi."
        : null);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const apply = () =>
    setStages((ss) =>
      ss.map((s) => ({
        ...s,
        tasks: s.tasks.map((x) =>
          x.id === taskId
            ? {
                ...x,
                name: f.name,
                type: f.type,
                expectedDays: Math.max(1, Number(f.days) || 1),
                quantity: f.quantity || undefined,
                material: f.material || undefined,
                description: f.description || undefined,
                content: f.content || undefined,
                instructions: f.instructions.split("\n").filter(Boolean),
                assignment: f.assignment || undefined,
                criteria: f.criteria || undefined,
                requirements: f.requirements || undefined,
                attachments,
                quiz: f.type === "QUIZ" ? quiz : undefined,
                revision: x.revision + 1,
              }
            : x,
        ),
      })),
    );

  const save = () => {
    if (quizProblem) return;
    apply();
    toast(`Zapisano wersję treści ${t.revision + 1}`);
    pop();
  };

  const text = (k: keyof typeof f, label: string, rows = 3, hint?: string) => (
    <Field label={label} hint={hint}>
      {(id) => <textarea id={id} rows={rows} value={f[k]} onChange={set(k)} className={inputClass} />}
    </Field>
  );
  const line = (k: keyof typeof f, label: string, extra?: { inputMode?: "numeric" }) => (
    <Field label={label}>{(id) => <input id={id} value={f[k]} onChange={set(k)} className={inputClass} {...extra} />}</Field>
  );

  return (
    <Screen
      title={f.name || "Nowe zadanie"}
      back="Wersja 1"
      onBack={pop}
      subtitle={`${t.label} · ${t.stage.name} · obecnie wersja treści ${t.revision} · oznaczenie zmienia się z kolejnością`}
      actions={
        f.type === "QUIZ" && !quizProblem ? (
          <Button
            variant="plain"
            icon={Eye}
            onClick={() => {
              apply();
              push({ name: "quiz", taskId, preview: true });
            }}
          >
            Podgląd
          </Button>
        ) : undefined
      }
      footer={
        <>
          <span className={cx("flex-1 text-subhead", quizProblem ? "text-bad" : "text-fg-2")}>
            {quizProblem || `Zapis utworzy wersję treści ${t.revision + 1}. Wcześniejsze zgłoszenia zachowują swoją.`}
          </span>
          <Button size="lg" onClick={save} disabled={!!quizProblem}>
            Zapisz
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 rounded-card bg-bg-2 p-5">
        {line("name", "Tytuł")}
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-footnote font-semibold text-fg-2">Typ zadania</span>
          <Segmented label="Typ zadania" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={(Object.keys(typeInfo) as TaskType[]).map((k) => ({ value: k, label: taskTypeLabel[k] }))} />
          <p className="px-1 text-footnote text-fg-3">{typeInfo[f.type].hint}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {line("days", "Czas (dni)", { inputMode: "numeric" })}
          {f.type === "PRACTICAL" && line("quantity", "Do wykonania")}
          {f.type === "PRACTICAL" && line("material", "Materiał")}
        </div>
      </div>

      {f.type === "PRACTICAL" && (
        <div className="flex flex-col gap-4 rounded-card bg-bg-2 p-5">
          {text("description", "Cel ćwiczenia")}
          {text("instructions", "Kolejność operacji", 6, "Każdy krok w osobnej linii")}
          {text("assignment", "Zadanie")}
          {text("criteria", "Na co zwrócić uwagę", 4)}
          {text("requirements", "Materiał do zaliczenia w aplikacji", 2)}
        </div>
      )}

      {f.type === "COURSE" && <div className="flex flex-col gap-4 rounded-card bg-bg-2 p-5">{text("description", "Opis kursu", 3, "Termin i miejsce ustala instruktor prowadzący.")}</div>}

      {(f.type === "THEORY" || f.type === "QUIZ") && (
        <div className="flex flex-col gap-3 rounded-card bg-bg-2 p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-footnote font-semibold text-fg-2">{f.type === "QUIZ" ? "Wstęp do testu" : "Materiał"} (Markdown)</span>
            <Segmented
              label="Tryb edytora"
              value={mdPreview ? "preview" : "edit"}
              onChange={(v) => setMdPreview(v === "preview")}
              options={[
                { value: "edit", label: "Edycja" },
                { value: "preview", label: "Podgląd" },
              ]}
            />
          </div>
          {mdPreview ? (
            <div className="min-h-32 rounded-ctl bg-bg-3/40 p-4">{f.content ? <Markdown source={f.content} /> : <p className="text-fg-3">Brak treści.</p>}</div>
          ) : (
            <textarea aria-label="Treść w Markdown" rows={10} value={f.content} onChange={set("content")} className={inputClass + " font-mono text-callout"} placeholder={"## Nagłówek\n- punkt listy\n**pogrubienie**"} />
          )}
          {f.type === "THEORY" && text("assignment", "Polecenie dla uczestnika", 3)}
          {f.type === "THEORY" && text("requirements", "Forma odpowiedzi", 2, "Np. odpowiedź w komentarzu albo zdjęcie notatki")}
        </div>
      )}

      {f.type === "QUIZ" && <QuizEditor value={quiz} onChange={setQuiz} />}

      <AttachmentsEditor items={attachments} onChange={setAttachments} />

      {t.reference && f.type === "PRACTICAL" && (
        <Group title="Zdjęcia wzorcowe">
          {t.reference.map((r) => (
            <Row key={r.photo.id} chevron={false} leading={<PhotoTile photo={r.photo} className="size-14 shrink-0 rounded-[12px]" />}>
              <span className="text-body">{r.caption}</span>
            </Row>
          ))}
          <Row onClick={() => toast("Dodawanie zdjęć wzorcowych — w M4")} chevron={false} leading={<Plus size={20} className="text-accent" aria-hidden />}>
            <span className="text-body text-accent">Dodaj zdjęcie wzorcowe</span>
          </Row>
        </Group>
      )}
    </Screen>
  );
}
