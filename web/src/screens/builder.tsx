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
  ImagePlus,
  ListChecks,
  MoreHorizontal,
  MoveRight,
  Pencil,
  PlayCircle,
  Plus,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Screen } from "../components/screen";
import { Markdown } from "../components/markdown";
import { ApiPhotoTile } from "../components/files";
import { Button, Field, Group, inputClass, Row, Segmented, Sheet, cx } from "../components/ui";
import { useStore } from "../store";
import { get, post, put, upload } from "../api/client";
import type { AdminStage, AdminTask, TaskContentIn, TaskType, Version, VersionDetail } from "../api/types";
import { errorText } from "../lib/errors";
import { fileSize, plural } from "../lib/format";
import { durationLabel, taskTypeLabel } from "../lib/status";
import { openProtected, useApi } from "../lib/useApi";
import { Loading } from "./participant";
import { QuizPreviewScreen } from "./quiz";

// Admin path builder (FR-ADM-02, Q-63). Every content save creates a new task revision (BR-19) and
// passes never get revoked (BR-16) — the backend enforces both; labels E1.x come from the API (BR-34).

const typeInfo: Record<TaskType, { icon: LucideIcon; hint: string }> = {
  PRACTICAL: { icon: Hammer, hint: "Wyrób wykonany samodzielnie. Uczestnik wysyła zdjęcia, ocenia instruktor." },
  COURSE: { icon: GraduationCap, hint: "Zajęcia z instruktorem. Wynik wpisuje instruktor, poza kolejnością w etapie." },
  THEORY: { icon: BookOpenText, hint: "Materiał do przeczytania i polecenie. Odpowiedź ocenia instruktor." },
  QUIZ: { icon: ListChecks, hint: "Pytania zamknięte z kluczem. Zaliczenie automatyczne od progu." },
};

const defaultDays: Record<TaskType, number> = { PRACTICAL: 14, COURSE: 1, THEORY: 7, QUIZ: 7 };

/** Swap two neighbours in a list of ids (for the …/order endpoints, which take the whole list). */
const swapped = <T,>(list: T[], i: number, dir: -1 | 1) => {
  const next = [...list];
  [next[i], next[i + dir]] = [next[i + dir], next[i]];
  return next;
};

function useAct() {
  const { toast } = useStore();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
      return true;
    } catch (e) {
      toast(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

export function VersionScreen({ versionId }: { versionId: string }) {
  const { push, pop, toast } = useStore();
  const { data: v, error, reload } = useApi(() => get<VersionDetail>(`/admin/path-versions/${versionId}`), [versionId]);
  const act = useAct();
  const [menu, setMenu] = useState<{ task: AdminTask; stage: AdminStage } | null>(null);
  const [adding, setAdding] = useState<AdminStage | null>(null);
  const [newType, setNewType] = useState<TaskType>("PRACTICAL");
  const [newName, setNewName] = useState("");
  const [stageSheet, setStageSheet] = useState<{ stage: AdminStage | null } | null>(null);
  const [stageName, setStageName] = useState("");

  if (!v)
    return (
      <Screen title="Wersja ścieżki" back="Ścieżki" onBack={pop}>
        <Loading error={error} onRetry={reload} />
      </Screen>
    );

  const change = async (fn: () => Promise<unknown>, done?: string) => {
    await act.run(fn, done);
    await reload(); // the backend renumbers labels and positions
  };
  const moveTask = (stage: AdminStage, i: number, dir: -1 | 1) =>
    change(() => put(`/admin/stages/${stage.id}/tasks/order`, { ids: swapped(stage.tasks.map((t) => t.id), i, dir) }));
  const moveStage = (i: number, dir: -1 | 1) =>
    change(() => put(`/admin/path-versions/${v.id}/stages/order`, { ids: swapped(v.stages.map((s) => s.id), i, dir) }));
  const copy = async () => {
    try {
      const c = await post<Version>(`/admin/paths/${v.learning_path_id}/versions`, { description: "", copy_from_version_id: v.id });
      toast(`Utworzono wersję ${c.version_number} (kopia, nie przyjmuje jeszcze zapisów)`);
      push({ name: "version", versionId: c.id });
    } catch (e) {
      toast(errorText(e));
    }
  };
  const saveStage = async () => {
    if (!stageSheet || !stageName.trim()) return;
    const s = stageSheet.stage;
    const ok = await act.run(
      () => (s ? put(`/admin/stages/${s.id}`, { name: stageName.trim() }) : post("/admin/stages", { path_version_id: v.id, name: stageName.trim() })),
      s ? "Zmieniono nazwę etapu" : "Dodano etap",
    );
    if (ok) {
      setStageSheet(null);
      setStageName("");
    }
    await reload();
  };
  const taskCount = v.stages.reduce((n, s) => n + s.tasks.filter((t) => t.is_active).length, 0);

  return (
    <Screen
      title={`${v.path_name} · v${v.version_number}`}
      back="Ścieżki"
      onBack={pop}
      subtitle={`${plural(v.stages.length, "etap", "etapy", "etapów")} · ${plural(taskCount, "zadanie", "zadania", "zadań")}. Układasz kolejność, treść i typy zadań. Zaliczeń uczestników nic nie cofa.`}
      actions={
        <Button variant="plain" icon={Copy} disabled={act.busy} onClick={copy}>
          Kopia
        </Button>
      }
    >
      <Group>
        <Row
          chevron={false}
          onClick={() => change(() => put(`/admin/path-versions/${v.id}`, { is_active: !v.is_active }), v.is_active ? "Wersja nie przyjmuje zapisów" : "Wersja przyjmuje zapisy")}
          trailing={
            <span role="switch" aria-checked={v.is_active} aria-label="Przyjmuje nowe zapisy" className={cx("relative h-[31px] w-[51px] shrink-0 rounded-full transition", v.is_active ? "bg-ok" : "bg-fg/15")}>
              <span className={cx("absolute top-[2px] size-[27px] rounded-full bg-white shadow transition-all", v.is_active ? "left-[22px]" : "left-[2px]")} />
            </span>
          }
        >
          <div className="text-body">Przyjmuje nowe zapisy</div>
          <div className="text-footnote text-fg-2">Wyłączenie nie wpływa na osoby już zapisane</div>
        </Row>
      </Group>

      {v.stages.map((s, si) => (
        <section key={s.id} className="flex flex-col gap-2" aria-label={`Etap ${s.position}`}>
          <div className="flex items-center gap-1 px-1">
            <div className="min-w-0 flex-1">
              <div className="text-footnote font-bold uppercase tracking-[0.08em] text-brand">Etap {s.position}</div>
              <h2 className="truncate font-display text-title3">{s.name}</h2>
            </div>
            <Button variant="plain" className="w-11 px-0" aria-label={`Zmień nazwę etapu ${s.position}`} icon={Pencil} onClick={() => (setStageSheet({ stage: s }), setStageName(s.name))} />
            <Button variant="plain" className="w-11 px-0" aria-label={`Etap ${s.position} wyżej`} icon={ArrowUp} disabled={si === 0 || act.busy} onClick={() => moveStage(si, -1)} />
            <Button variant="plain" className="w-11 px-0" aria-label={`Etap ${s.position} niżej`} icon={ArrowDown} disabled={si === v.stages.length - 1 || act.busy} onClick={() => moveStage(si, 1)} />
          </div>
          <div className="overflow-hidden rounded-card bg-bg-2">
            {s.tasks.map((t) => {
              const r = t.revision;
              const off = !t.is_active;
              const Icon = typeInfo[r.task_type].icon;
              return (
                <div key={t.id} className="flex min-h-11 items-center gap-1 border-t pl-4 pr-1 hairline first:border-t-0" data-task={r.name}>
                  <Icon size={18} className={cx("shrink-0", off ? "text-fg-3" : "text-brand")} aria-hidden />
                  <button type="button" onClick={() => push({ name: "task-edit", taskId: t.id })} className="focus-ring min-w-0 flex-1 rounded-ctl py-3 pl-2 text-left">
                    <div className={cx("truncate text-body", off && "text-fg-3 line-through")}>{t.label ? `${t.label} · ${r.name}` : r.name}</div>
                    <div className="truncate text-footnote text-fg-2">
                      {taskTypeLabel[r.task_type]}
                      {r.expected_duration_days ? ` · ${durationLabel(r.expected_duration_days)}` : ""} · wersja treści {r.revision_number}
                      {off && " · wyłączone"}
                    </div>
                  </button>
                  <Button variant="plain" className="w-11 shrink-0 px-0" aria-label={`Działania: ${r.name}`} icon={MoreHorizontal} onClick={() => setMenu({ task: t, stage: s })} />
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setAdding(s);
                setNewType("PRACTICAL");
                setNewName("");
              }}
              className="focus-ring flex min-h-11 w-full items-center gap-3 border-t px-4 py-3 text-left text-body text-accent hairline first:border-t-0 hover:bg-accent/6"
            >
              <Plus size={20} aria-hidden /> Dodaj zadanie
            </button>
          </div>
        </section>
      ))}

      <Button variant="bordered" icon={Plus} size="lg" onClick={() => (setStageSheet({ stage: null }), setStageName(""))}>
        Dodaj etap
      </Button>

      <Sheet open={!!menu} title={menu?.task.revision.name ?? ""} onClose={() => setMenu(null)}>
        {menu &&
          (() => {
            const { task, stage } = menu;
            const i = stage.tasks.findIndex((x) => x.id === task.id);
            const close = (p: Promise<unknown>) => void p.then(() => setMenu(null));
            return (
              <div className="flex flex-col gap-4">
                <Group>
                  <Row chevron={false} disabled={i === 0} leading={<ArrowUp size={20} className="text-accent" aria-hidden />} onClick={() => close(moveTask(stage, i, -1))}>
                    <span className="text-body">Przesuń wyżej</span>
                  </Row>
                  <Row chevron={false} disabled={i === stage.tasks.length - 1} leading={<ArrowDown size={20} className="text-accent" aria-hidden />} onClick={() => close(moveTask(stage, i, 1))}>
                    <span className="text-body">Przesuń niżej</span>
                  </Row>
                  <Row
                    chevron={false}
                    leading={task.is_active ? <EyeOff size={20} className="text-accent" aria-hidden /> : <Eye size={20} className="text-accent" aria-hidden />}
                    onClick={() =>
                      close(change(() => post(`/admin/tasks/${task.id}/${task.is_active ? "deactivate" : "activate"}`), task.is_active ? "Zadanie wyłączone" : "Zadanie włączone"))
                    }
                  >
                    <span className="text-body">{task.is_active ? "Wyłącz zadanie" : "Włącz zadanie"}</span>
                    <div className="text-footnote text-fg-2">Historia prób zostaje. Niedozwolone, gdy zadanie ma zgłoszenia w ocenie.</div>
                  </Row>
                </Group>
                {v.stages.length > 1 && (
                  <Group title="Przenieś do etapu">
                    {v.stages
                      .filter((s) => s.id !== stage.id)
                      .map((s) => (
                        <Row
                          key={s.id}
                          chevron={false}
                          leading={<MoveRight size={20} className="text-accent" aria-hidden />}
                          onClick={() => close(change(() => put(`/admin/tasks/${task.id}/stage`, { stage_id: s.id }), "Przeniesiono na koniec etapu"))}
                        >
                          <span className="text-body">
                            Etap {s.position} · {s.name}
                          </span>
                        </Row>
                      ))}
                  </Group>
                )}
              </div>
            );
          })()}
      </Sheet>

      <Sheet open={!!adding} title={adding ? `Nowe zadanie · Etap ${adding.position}` : ""} onClose={() => setAdding(null)}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!adding || !newName.trim()) return;
            push({ name: "task-new", stageId: adding.id, type: newType, title: newName.trim() });
            setAdding(null);
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
          <Field label="Tytuł">{(id) => <input id={id} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Np. Gatunki stali" className={inputClass} />}</Field>
          <Button type="submit" size="lg" disabled={!newName.trim()}>
            Utwórz i edytuj
          </Button>
          <p className="text-center text-footnote text-fg-3">Zadanie zapisze się przy pierwszym „Zapisz” w edytorze.</p>
        </form>
      </Sheet>

      <Sheet open={!!stageSheet} title={stageSheet?.stage ? "Nazwa etapu" : "Nowy etap"} onClose={() => setStageSheet(null)}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void saveStage();
          }}
        >
          <Field label="Nazwa etapu">{(id) => <input id={id} value={stageName} onChange={(e) => setStageName(e.target.value)} placeholder="Np. Kowalstwo artystyczne" className={inputClass} />}</Field>
          <Button type="submit" size="lg" disabled={!stageName.trim() || act.busy}>
            {stageSheet?.stage ? "Zapisz" : "Dodaj etap"}
          </Button>
        </form>
      </Sheet>
    </Screen>
  );
}

// --- task editor ---------------------------------------------------------------------------------

let seq = 0;
const uid = () => `k${++seq}`; // React keys for rows being edited; never sent to the API

interface QOption {
  key: string;
  text: string;
  is_correct: boolean;
}
interface QQuestion {
  key: string;
  text: string;
  kind: "SINGLE" | "MULTI";
  options: QOption[];
}
interface QuizState {
  threshold: number;
  questions: QQuestion[];
}

function QuizEditor({ value, onChange }: { value: QuizState; onChange: (v: QuizState) => void }) {
  const qs = value.questions;
  const setQ = (key: string, f: (q: QQuestion) => QQuestion) => onChange({ ...value, questions: qs.map((q) => (q.key === key ? f(q) : q)) });
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
        <div key={q.key} className="flex flex-col gap-3 rounded-card bg-bg-2 p-5">
          <div className="flex items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft/14 text-footnote font-semibold tabular-nums text-brand">{n + 1}</span>
            <span className="flex-1 text-headline">Pytanie</span>
            <Button variant="plain" className="w-11 px-0" icon={ArrowUp} aria-label="Pytanie wyżej" disabled={n === 0} onClick={() => onChange({ ...value, questions: swapped(qs, n, -1) })} />
            <Button variant="plain" className="w-11 px-0 text-bad" icon={Trash2} aria-label="Usuń pytanie" onClick={() => onChange({ ...value, questions: qs.filter((x) => x.key !== q.key) })} />
          </div>
          <textarea rows={2} aria-label={`Treść pytania ${n + 1}`} value={q.text} onChange={(e) => setQ(q.key, (x) => ({ ...x, text: e.target.value }))} className={inputClass} placeholder="Treść pytania" />
          <Segmented
            label={`Rodzaj pytania ${n + 1}`}
            value={q.kind}
            onChange={(kind) =>
              setQ(q.key, (x) => ({
                ...x,
                kind,
                options: kind === "SINGLE" ? x.options.map((o, i) => ({ ...o, is_correct: i === Math.max(0, x.options.findIndex((y) => y.is_correct)) })) : x.options,
              }))
            }
            options={[
              { value: "SINGLE", label: "Jedna odpowiedź" },
              { value: "MULTI", label: "Kilka odpowiedzi" },
            ]}
          />
          <div className="flex flex-col gap-2">
            {q.options.map((o, m) => (
              <div key={o.key} className="flex items-center gap-2">
                <button
                  type="button"
                  role={q.kind === "SINGLE" ? "radio" : "checkbox"}
                  aria-checked={o.is_correct}
                  aria-label={`Poprawna: pytanie ${n + 1}, odpowiedź ${m + 1}`}
                  onClick={() =>
                    setQ(q.key, (x) => ({
                      ...x,
                      options: x.options.map((y) => (x.kind === "SINGLE" ? { ...y, is_correct: y.key === o.key } : y.key === o.key ? { ...y, is_correct: !y.is_correct } : y)),
                    }))
                  }
                  className="focus-ring grid size-11 shrink-0 place-items-center"
                >
                  <span className={cx("grid size-6 place-items-center border-2", q.kind === "SINGLE" ? "rounded-full" : "rounded-[7px]", o.is_correct ? "border-ok bg-ok text-bg-2" : "border-fg/25")}>
                    {o.is_correct && <span className="size-2 rounded-full bg-current" />}
                  </span>
                </button>
                <input
                  aria-label={`Pytanie ${n + 1}, odpowiedź ${m + 1}`}
                  value={o.text}
                  onChange={(e) => setQ(q.key, (x) => ({ ...x, options: x.options.map((y) => (y.key === o.key ? { ...y, text: e.target.value } : y)) }))}
                  className={inputClass + " py-2"}
                  placeholder="Odpowiedź"
                />
                <Button variant="plain" className="w-11 shrink-0 px-0 text-fg-3" icon={Trash2} aria-label="Usuń odpowiedź" onClick={() => setQ(q.key, (x) => ({ ...x, options: x.options.filter((y) => y.key !== o.key) }))} />
              </div>
            ))}
            <Button variant="plain" icon={Plus} className="self-start" onClick={() => setQ(q.key, (x) => ({ ...x, options: [...x.options, { key: uid(), text: "", is_correct: false }] }))}>
              Dodaj odpowiedź
            </Button>
            {!q.options.some((o) => o.is_correct) && <p className="text-footnote text-bad">Zaznacz co najmniej jedną poprawną odpowiedź (kółko po lewej).</p>}
          </div>
        </div>
      ))}

      <Button
        variant="bordered"
        icon={Plus}
        onClick={() =>
          onChange({
            ...value,
            questions: [
              ...qs,
              {
                key: uid(),
                text: "",
                kind: "SINGLE",
                options: [
                  { key: uid(), text: "", is_correct: true },
                  { key: uid(), text: "", is_correct: false },
                ],
              },
            ],
          })
        }
      >
        Dodaj pytanie
      </Button>
    </section>
  );
}

interface FileRow {
  id: string;
  label: string; // caption of a photo / title of a PDF
  meta: string;
}

/** Reference photos or PDFs of a saved task: order, captions and removal go into the next save;
 * an upload is a save of its own (a new revision with the file), so it waits until the form is saved. */
function FilesEditor({
  kind,
  taskId,
  rows,
  onChange,
  canUpload,
  onUploaded,
}: {
  kind: "photo" | "pdf";
  taskId: string | null;
  rows: FileRow[];
  onChange: (r: FileRow[]) => void;
  canUpload: boolean;
  onUploaded: (t: AdminTask) => void;
}) {
  const { toast } = useStore();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const photo = kind === "photo";
  const send = async (file: File) => {
    if (!taskId) return;
    setBusy(true);
    try {
      const t = await upload<AdminTask>(`/admin/tasks/${taskId}/${photo ? "materials" : "attachments"}`, file);
      toast(`Dodano ${photo ? "zdjęcie wzorcowe" : "PDF"} · wersja treści ${t.revision.revision_number}`);
      onUploaded(t);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const hint = !taskId ? "Pliki dodasz po pierwszym zapisaniu zadania." : !canUpload ? "Najpierw zapisz zmiany — dodanie pliku tworzy nową wersję treści." : undefined;
  return (
    <Group
      title={photo ? "Zdjęcia wzorcowe" : "Pliki PDF"}
      footer={hint ?? (photo ? "Zdjęcie jest zmniejszane do 2560 px. Podpis widzi uczestnik pod zdjęciem." : "PDF do 20 MB, przechowywany na serwerze PSPK.")}
    >
      {rows.map((r, i) => (
        <div key={r.id} className="flex items-center gap-2 border-t px-3 py-2 hairline first:border-t-0">
          {photo ? (
            <ApiPhotoTile path={`/tasks/${taskId}/materials/${r.id}`} className="size-14 shrink-0 rounded-[12px]" label={r.label || "Zdjęcie wzorcowe"} />
          ) : (
            <button type="button" aria-label={`Otwórz ${r.label}`} className="focus-ring grid size-11 shrink-0 place-items-center" onClick={() => openProtected(`/tasks/${taskId}/attachments/${r.id}`).catch((e) => toast(errorText(e)))}>
              <FileText size={22} className="text-bad" aria-hidden />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <input
              aria-label={photo ? `Podpis zdjęcia ${i + 1}` : `Tytuł PDF ${i + 1}`}
              value={r.label}
              onChange={(e) => onChange(rows.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)))}
              placeholder={photo ? "Podpis, np. Wymagane: 2 podobne egzemplarze" : "Tytuł"}
              className={inputClass + " py-2"}
            />
            <div className="px-1 pt-1 text-caption text-fg-3">{r.meta}</div>
          </div>
          <Button variant="plain" className="w-11 shrink-0 px-0" icon={ArrowUp} aria-label="Wyżej" disabled={i === 0} onClick={() => onChange(swapped(rows, i, -1))} />
          <Button variant="plain" className="w-11 shrink-0 px-0 text-fg-3" icon={Trash2} aria-label={`Usuń ${r.label || (photo ? "zdjęcie" : "PDF")}`} onClick={() => onChange(rows.filter((x) => x.id !== r.id))} />
        </div>
      ))}
      <div className="border-t p-3 hairline first:border-t-0">
        <Button variant="bordered" icon={photo ? ImagePlus : FileText} disabled={!taskId || !canUpload || busy} onClick={() => ref.current?.click()}>
          {busy ? "Wysyłanie…" : photo ? "Dodaj zdjęcie wzorcowe" : "Dodaj PDF"}
        </Button>
        <input
          ref={ref}
          id={photo ? "material-file" : "attachment-pdf"}
          type="file"
          accept={photo ? "image/jpeg,image/png,image/webp" : "application/pdf"}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void send(f);
            e.target.value = "";
          }}
        />
      </div>
    </Group>
  );
}

function VideosEditor({ items, onChange }: { items: { key: string; title: string; url: string }[]; onChange: (v: { key: string; title: string; url: string }[]) => void }) {
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const linkOk = /^https:\/\/\S+$/.test(link.trim());
  return (
    <Group title="Filmy" footer="Linki https (np. YouTube), otwierane u uczestnika w nowej karcie.">
      {items.map((a) => (
        <Row
          key={a.key}
          chevron={false}
          leading={<PlayCircle size={22} className="shrink-0 text-info" aria-hidden />}
          trailing={<Button variant="plain" className="w-11 shrink-0 px-0 text-fg-3" icon={Trash2} aria-label={`Usuń ${a.title}`} onClick={() => onChange(items.filter((x) => x.key !== a.key))} />}
        >
          <div className="truncate text-body">{a.title}</div>
          <div className="truncate text-footnote text-fg-2">{a.url}</div>
        </Row>
      ))}
      <div className="flex flex-col gap-2 border-t p-3 hairline first:border-t-0">
        <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
          <input aria-label="Tytuł filmu" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tytuł filmu" className={inputClass + " py-2"} />
          <input aria-label="Link do filmu" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" inputMode="url" className={inputClass + " py-2"} aria-invalid={!!link && !linkOk} />
          <Button
            variant="bordered"
            icon={PlayCircle}
            disabled={!linkOk}
            onClick={() => {
              onChange([...items, { key: uid(), title: title.trim() || "Film", url: link.trim() }]);
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

const text = (v: string) => (v.trim() ? v : null);

interface Form {
  name: string;
  type: TaskType;
  days: string;
  quantity: string;
  material: string;
  description: string;
  content: string;
  instructions: string;
  assignment: string;
  criteria: string;
  requirements: string;
}

function formOf(t: AdminTask | null, type: TaskType, title: string): Form {
  const r = t?.revision;
  return {
    name: r?.name ?? title,
    type: (r?.task_type as TaskType) ?? type,
    days: String(r?.expected_duration_days ?? defaultDays[type]),
    quantity: r?.quantity_description ?? "",
    material: r?.material ?? "",
    description: r?.description ?? "",
    content: r?.content_md ?? "",
    instructions: r?.instructions ?? "",
    assignment: r?.assignment ?? "",
    criteria: r?.evaluation_criteria ?? "",
    requirements: r?.submission_requirements ?? "",
  };
}

export function TaskEditScreen(props: { taskId: string } | { stageId: string; type: TaskType; title: string }) {
  const { pop } = useStore();
  const taskId = "taskId" in props ? props.taskId : null;
  const loaded = useApi(() => (taskId ? get<AdminTask>(`/admin/tasks/${taskId}`) : Promise.resolve(null)), [taskId]);
  const [fresh, setFresh] = useState<AdminTask | null>(null); // after an upload: the new revision
  if (taskId && !loaded.data)
    return (
      <Screen title="Zadanie" back="Wersja" onBack={pop}>
        <Loading error={loaded.error} onRetry={loaded.reload} />
      </Screen>
    );
  const task = fresh ?? loaded.data;
  // Remount the editor on every new revision, so the form always starts from what is saved.
  return (
    <TaskEditor
      key={task?.revision.id ?? "new"}
      task={task}
      stageId={"stageId" in props ? props.stageId : task!.stage_id}
      type={"type" in props ? props.type : (task!.revision.task_type as TaskType)}
      title={"title" in props ? props.title : ""}
      onUploaded={setFresh}
    />
  );
}

function TaskEditor({ task, stageId, type, title, onUploaded }: { task: AdminTask | null; stageId: string; type: TaskType; title: string; onUploaded: (t: AdminTask) => void }) {
  const { pop, toast } = useStore();
  const r = task?.revision;
  const [f, setF] = useState<Form>(() => formOf(task, type, title));
  const [quiz, setQuiz] = useState<QuizState>(() => ({
    threshold: r?.pass_threshold ?? 80,
    questions: (r?.questions ?? []).map((q) => ({ key: uid(), text: q.text, kind: q.kind, options: q.options.map((o) => ({ key: uid(), text: o.text, is_correct: o.is_correct })) })),
  }));
  const [videos, setVideos] = useState(() => (r?.video_links ?? []).map((v) => ({ key: uid(), title: v.title, url: v.url })));
  const [photos, setPhotos] = useState<FileRow[]>(() => (r?.materials ?? []).map((m) => ({ id: m.id, label: m.caption ?? "", meta: `${m.width}×${m.height} · ${fileSize(m.file_size)}` })));
  const [pdfs, setPdfs] = useState<FileRow[]>(() => (r?.attachments ?? []).map((a) => ({ id: a.id, label: a.title, meta: `PDF · ${fileSize(a.file_size)}` })));
  const [mdPreview, setMdPreview] = useState(false);
  const [quizPreview, setQuizPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isQuiz = f.type === "QUIZ";
  const payload = (): TaskContentIn => ({
    name: f.name.trim(),
    task_type: f.type,
    description: text(f.description),
    instructions: text(f.instructions),
    content_md: text(f.content),
    assignment: text(f.assignment),
    evaluation_criteria: text(f.criteria),
    submission_requirements: text(f.requirements),
    material: text(f.material),
    quantity_description: text(f.quantity),
    expected_duration_days: Math.max(1, Number(f.days) || 1),
    pass_threshold: isQuiz ? quiz.threshold : null,
    questions: isQuiz ? quiz.questions.map((q) => ({ text: q.text.trim(), kind: q.kind, options: q.options.map((o) => ({ text: o.text.trim(), is_correct: o.is_correct })) })) : [],
    video_links: videos.map((v) => ({ title: v.title, url: v.url })),
    ...(task
      ? {
          materials: photos.map((p) => ({ id: p.id, caption: text(p.label) })),
          attachments: pdfs.map((p) => ({ id: p.id, title: p.label.trim() || "Załącznik" })),
        }
      : {}),
  });
  const [initial] = useState(() => JSON.stringify(payload()));
  const dirty = !task || JSON.stringify(payload()) !== initial;

  const quizProblem = !isQuiz
    ? null
    : quiz.questions.length === 0
      ? "Quiz musi mieć co najmniej jedno pytanie."
      : quiz.questions.some((q) => !q.text.trim() || q.options.length < 2 || q.options.some((o) => !o.text.trim()) || !q.options.some((o) => o.is_correct))
        ? "Każde pytanie potrzebuje treści, co najmniej dwóch odpowiedzi i poprawnej odpowiedzi."
        : null;
  const problem = !f.name.trim() ? "Podaj tytuł zadania." : quizProblem;

  const save = async () => {
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      if (!task) {
        await post<AdminTask>("/admin/tasks", { stage_id: stageId, ...payload() });
        toast("Utworzono zadanie · wersja treści 1");
      } else {
        const t = await put<AdminTask>(`/admin/tasks/${task.id}`, payload());
        toast(t.revision.revision_number === task.revision.revision_number ? "Bez zmian" : `Zapisano wersję treści ${t.revision.revision_number}`);
      }
      pop();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const area = (k: keyof Form, label: string, rows = 3, hint?: string) => (
    <Field label={label} hint={hint}>
      {(id) => <textarea id={id} rows={rows} value={f[k]} onChange={set(k)} className={inputClass} />}
    </Field>
  );
  const line = (k: keyof Form, label: string, extra?: { inputMode?: "numeric" }) => (
    <Field label={label}>{(id) => <input id={id} value={f[k]} onChange={set(k)} className={inputClass} {...extra} />}</Field>
  );
  const next = (task?.revision.revision_number ?? 0) + 1;

  // Shown in place of the form, so nothing typed is lost while previewing.
  if (quizPreview) return <QuizPreviewScreen quiz={{ name: f.name, threshold: quiz.threshold, questions: payload().questions }} onBack={() => setQuizPreview(false)} />;

  return (
    <Screen
      title={f.name || "Nowe zadanie"}
      back="Wersja"
      onBack={pop}
      subtitle={task ? `${task.label ?? "wyłączone"} · obecnie wersja treści ${task.revision.revision_number} · oznaczenie zmienia się z kolejnością` : "Nowe zadanie · zapisze się przy „Zapisz”"}
      actions={
        isQuiz && !quizProblem ? (
          <Button variant="plain" icon={Eye} onClick={() => setQuizPreview(true)}>
            Podgląd
          </Button>
        ) : undefined
      }
      footer={
        <>
          <span className={cx("flex-1 text-subhead", problem || error ? "text-bad" : "text-fg-2")} role={error ? "alert" : undefined}>
            {error || problem || (task ? (dirty ? `Zapis utworzy wersję treści ${next}. Wcześniejsze zgłoszenia zachowują swoją.` : "Brak zmian do zapisania.") : "Zapis utworzy zadanie z wersją treści 1.")}
          </span>
          <Button size="lg" onClick={save} disabled={!!problem || busy || (!!task && !dirty)}>
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
          {area("description", "Cel ćwiczenia")}
          {area("instructions", "Kolejność operacji", 6, "Każdy krok w osobnej linii")}
          {area("assignment", "Zadanie")}
          {area("criteria", "Na co zwrócić uwagę", 4, "Kryteria oceny — widzi je też instruktor")}
          {area("requirements", "Materiał do zaliczenia w aplikacji", 2)}
        </div>
      )}

      {f.type === "COURSE" && <div className="flex flex-col gap-4 rounded-card bg-bg-2 p-5">{area("description", "Opis kursu", 3, "Termin i miejsce ustala instruktor prowadzący.")}</div>}

      {(f.type === "THEORY" || isQuiz) && (
        <div className="flex flex-col gap-3 rounded-card bg-bg-2 p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-footnote font-semibold text-fg-2">{isQuiz ? "Wstęp do testu" : "Materiał"} (Markdown)</span>
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
          {f.type === "THEORY" && area("assignment", "Polecenie dla uczestnika", 3)}
          {f.type === "THEORY" && area("criteria", "Na co zwrócić uwagę", 3, "Kryteria oceny — widzi je też instruktor")}
          {f.type === "THEORY" && area("requirements", "Forma odpowiedzi", 2, "Np. odpowiedź w komentarzu albo zdjęcie notatki")}
        </div>
      )}

      {isQuiz && <QuizEditor value={quiz} onChange={setQuiz} />}

      <FilesEditor kind="photo" taskId={task?.id ?? null} rows={photos} onChange={setPhotos} canUpload={!dirty} onUploaded={onUploaded} />
      <FilesEditor kind="pdf" taskId={task?.id ?? null} rows={pdfs} onChange={setPdfs} canUpload={!dirty} onUploaded={onUploaded} />
      <VideosEditor items={videos} onChange={setVideos} />
    </Screen>
  );
}
