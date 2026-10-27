import { useState } from "react";
import { Check, GraduationCap, Hand, Lock, Undo2 } from "lucide-react";
import { Screen } from "../components/screen";
import { ApiPhotoTile } from "../components/files";
import { Badge, Button, Field, Group, inputClass, Row, Segmented, Sheet, cx } from "../components/ui";
import { useStore } from "../store";
import { get, post } from "../api/client";
import { useSession } from "../api/session";
import type { CourseItem, CourseParticipant, Page, QueueItem, ReviewDetail } from "../api/types";
import { errorText } from "../lib/errors";
import { formatDateTime, personName } from "../lib/format";
import { submissionStatus } from "../lib/status";
import { useApi } from "../lib/useApi";
import { FeedbackCard, Loading } from "./participant";

type Result = "PASSED" | "NEEDS_IMPROVEMENT";

const taskLine = (i: QueueItem) => (i.task.label ? `${i.task.label} · ${i.task.name}` : i.task.name);

function Empty({ children }: { children: string }) {
  return <p className="rounded-card bg-bg-2 p-8 text-center text-body text-fg-2">{children}</p>;
}

export function QueueScreen() {
  const { push } = useStore();
  const { user } = useSession();
  const [tab, setTab] = useState<"open" | "mine">("open");
  const { data, error, reload } = useApi(() => get<QueueItem[]>("/instructor/submissions"), []);
  const open = (data ?? []).filter((q) => q.submission.status === "SUBMITTED");
  const mine = (data ?? []).filter((q) => q.submission.status === "UNDER_REVIEW" && q.instructor?.id === user?.id);
  const list = tab === "open" ? open : mine;
  return (
    <Screen title="Kolejka ocen" subtitle="Zgłoszenia z etapów, do których masz uprawnienia">
      <Segmented
        label="Filtr kolejki"
        value={tab}
        onChange={setTab}
        options={[
          { value: "open", label: `Do przejęcia (${open.length})` },
          { value: "mine", label: `Moje w ocenie (${mine.length})` },
        ]}
      />
      {!data ? (
        <Loading error={error} onRetry={reload} />
      ) : list.length === 0 ? (
        <Empty>{tab === "open" ? "Brak zgłoszeń do przejęcia. Nowe pojawią się tutaj." : "Nie oceniasz teraz żadnego zgłoszenia."}</Empty>
      ) : (
        <Group footer="Najstarsze zgłoszenia są na górze.">
          {list.map((q) => (
            <Row key={q.submission.id} onClick={() => push({ name: "review", id: q.submission.id })} leading={<ApiPhotoTile path={null} kind={q.task.task_type} className="size-14 shrink-0 rounded-[12px]" />}>
              <div className="text-body font-semibold">{personName(q.participant)}</div>
              <div className="truncate text-subhead text-fg-2">
                {taskLine(q)} · próba {q.submission.attempt_number}
              </div>
              <div className="text-footnote tabular-nums text-fg-3">
                {q.stage.name} · {formatDateTime(q.submission.submitted_at)} · {q.photo_count} zdj.
              </div>
            </Row>
          ))}
        </Group>
      )}
    </Screen>
  );
}

export function AssessedScreen() {
  const { data, error, reload } = useApi(() => get<Page<QueueItem>>("/instructor/assessed?limit=100"), []);
  return (
    <Screen title="Ocenione" subtitle="Twoje oceny i wpisane wyniki kursów, od najnowszych">
      {!data ? (
        <Loading error={error} onRetry={reload} />
      ) : data.items.length === 0 ? (
        <Empty>Nie masz jeszcze żadnych ocen.</Empty>
      ) : (
        <Group footer="Oceny są ostateczne i zostają w historii uczestnika.">
          {data.items.map((h) => {
            const passed = h.submission.status === "PASSED";
            const course = h.task.task_type === "COURSE";
            return (
              <Row key={h.submission.id} leading={<ApiPhotoTile path={null} kind={h.task.task_type} className="size-12 shrink-0 rounded-[10px]" />} chevron={false}>
                <div className="text-body">{personName(h.participant)}</div>
                <div className="text-footnote tabular-nums text-fg-2">
                  {taskLine(h)} · {course ? "wynik kursu" : `próba ${h.submission.attempt_number}`} · {formatDateTime(h.submission.assessed_at)}
                </div>
                <div className="mt-1.5">
                  <Badge tone={passed ? "ok" : "warn"}>{passed ? "Zaliczone" : course ? "Do powtórki" : "Do poprawy"}</Badge>
                </div>
              </Row>
            );
          })}
        </Group>
      )}
    </Screen>
  );
}

export function ReviewScreen({ id }: { id: string }) {
  const { pop, toast } = useStore();
  const { user } = useSession();
  const { data: d, error, reload } = useApi(() => get<ReviewDetail>(`/instructor/submissions/${id}`), [id]);
  const [result, setResult] = useState<Result>("PASSED");
  const [comment, setComment] = useState("");
  const [tried, setTried] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  if (!d)
    return (
      <Screen title="Zgłoszenie" back="Kolejka" onBack={pop}>
        <Loading error={error} onRetry={reload} />
      </Screen>
    );

  const s = d.submission;
  const st = submissionStatus[s.status];
  const mine = s.status === "UNDER_REVIEW" && d.instructor?.id === user?.id;
  const commentMissing = result === "NEEDS_IMPROVEMENT" && comment.trim() === "";
  const photo = s.photos[Math.min(active, s.photos.length - 1)];

  // Every action goes to the backend; afterwards the screen shows what the backend says (R11).
  const act = async (fn: () => Promise<unknown>, done: string, leave = false) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
      if (leave) return pop();
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
    await reload();
  };
  const claim = () => act(() => post(`/submissions/${s.id}/claim`), "Przejęto do oceny");
  const release = () => act(() => post(`/submissions/${s.id}/release`), "Zgłoszenie zwolnione");
  const assess = () => {
    setTried(true);
    if (commentMissing) return;
    return act(
      () => post(`/submissions/${s.id}/assessment`, { result, comment: comment.trim() || null }),
      result === "PASSED" ? "Zadanie zaliczone" : "Skierowano do poprawy",
      true,
    );
  };

  return (
    <Screen
      title={personName(d.participant)}
      back="Kolejka"
      onBack={pop}
      subtitle={
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge tone={st.tone}>{st.label}</Badge>
          <span className="text-footnote text-fg-2">
            {taskLine(d)} · próba {s.attempt_number} · wysłano {formatDateTime(s.submitted_at)}
          </span>
        </div>
      }
      footer={
        s.status === "SUBMITTED" ? (
          <>
            <span className="flex-1 text-subhead text-fg-2">Po przejęciu tylko Ty możesz ocenić to zgłoszenie.</span>
            <Button size="lg" icon={Hand} disabled={busy} onClick={claim}>
              Przejmij do oceny
            </Button>
          </>
        ) : undefined
      }
    >
      {photo ? (
        <section className="flex flex-col gap-2">
          <ApiPhotoTile key={photo.id} path={`/submissions/${s.id}/photos/${photo.id}`} className="aspect-[4/3] w-full" label={`Zdjęcie ${active + 1} z ${s.photos.length}`} />
          {s.photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Zdjęcia zgłoszenia">
              {s.photos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  aria-label={`Zdjęcie ${i + 1}`}
                  onClick={() => setActive(i)}
                  className={cx("focus-ring shrink-0 rounded-[12px] p-0.5 transition", i === active ? "ring-2 ring-accent" : "opacity-70 hover:opacity-100")}
                >
                  <ApiPhotoTile path={`/submissions/${s.id}/photos/${p.id}`} className="size-16 rounded-[10px]" />
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        <p className="rounded-card border border-dashed hairline p-5 text-center text-subhead text-fg-2">Zgłoszenie bez zdjęć.</p>
      )}

      {s.comment && (
        <section className="flex flex-col gap-1 rounded-card bg-bg-2 p-5">
          <h3 className="text-footnote font-semibold uppercase tracking-[0.06em] text-fg-3">Komentarz uczestnika</h3>
          <p className="max-w-[65ch] whitespace-pre-line text-body">{s.comment}</p>
        </section>
      )}

      <details className="group rounded-card bg-bg-2 p-5 [&_summary::-webkit-details-marker]:hidden" open={mine}>
        <summary className="focus-ring flex min-h-11 cursor-pointer items-center justify-between rounded-ctl text-headline">
          Kryteria oceny · wersja treści {d.revision.revision_number}
          <span className="text-subhead font-normal text-accent group-open:hidden">Pokaż</span>
          <span className="hidden text-subhead font-normal text-accent group-open:inline">Ukryj</span>
        </summary>
        {d.revision.assignment && <p className="mt-2 max-w-[65ch] text-body text-fg-2">Polecenie: {d.revision.assignment}</p>}
        <p className="mt-2 max-w-[65ch] text-body text-fg-2">{d.revision.evaluation_criteria ?? "Kryteria nie zostały opisane w karcie zadania."}</p>
        {d.revision.submission_requirements && <p className="mt-3 max-w-[65ch] text-footnote text-fg-3">Materiał do zaliczenia: {d.revision.submission_requirements}</p>}
      </details>

      {d.previous_attempts.length > 0 && (
        <Group title="Poprzednie próby">
          {d.previous_attempts.map((p) => (
            <Row key={p.id} chevron={false}>
              <div className="text-body">Próba {p.attempt_number}</div>
              <div className="text-footnote text-fg-2">
                {submissionStatus[p.status].label}
                {p.assessment && ` · ${personName(p.assessment.instructor)}`}
              </div>
              {p.assessment?.comment && <div className="mt-1 max-w-[65ch] text-footnote text-fg-3">„{p.assessment.comment}”</div>}
            </Row>
          ))}
        </Group>
      )}

      {s.assessment && <FeedbackCard s={s} />}

      {mine && (
        <section className="flex flex-col gap-4 rounded-card bg-bg-2 p-5">
          <h2 className="text-title3">Ocena</h2>
          <Segmented
            label="Wynik oceny"
            value={result}
            onChange={setResult}
            options={[
              { value: "PASSED", label: "Zalicz" },
              { value: "NEEDS_IMPROVEMENT", label: "Do poprawy" },
            ]}
          />
          <Field
            label={result === "NEEDS_IMPROVEMENT" ? "Komentarz (wymagany)" : "Komentarz (opcjonalny)"}
            error={tried && commentMissing ? "Napisz, co uczestnik ma poprawić." : undefined}
            hint={result === "PASSED" ? "Zaliczenie jest ostateczne — nie da się go cofnąć." : "Uczestnik zobaczy ten komentarz i wyśle kolejną próbę."}
          >
            {(fid) => (
              <textarea
                id={fid}
                rows={4}
                value={comment}
                aria-invalid={tried && commentMissing}
                onChange={(e) => setComment(e.target.value)}
                className={inputClass}
                placeholder={result === "PASSED" ? "Np. co wyszło szczególnie dobrze" : "Np. łuk haka załamany przy nasadzie"}
              />
            )}
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="plain" icon={Undo2} disabled={busy} onClick={release}>
              Zwolnij zgłoszenie
            </Button>
            <Button size="lg" variant={result === "PASSED" ? "prominent" : "bordered"} disabled={busy} onClick={assess}>
              {result === "PASSED" ? "Zalicz zadanie" : "Odeślij do poprawy"}
            </Button>
          </div>
        </section>
      )}
      {s.status === "UNDER_REVIEW" && !mine && (
        <p className="rounded-card bg-bg-2 p-5 text-body text-fg-2" role="status">
          Ocenia: {personName(d.instructor)}. Inni instruktorzy nie mogą równolegle oceniać tego zgłoszenia.
        </p>
      )}
    </Screen>
  );
}

export function CoursesScreen() {
  const { push } = useStore();
  const { data, error, reload } = useApi(() => get<CourseItem[]>("/instructor/courses"), []);
  const groups = new Map<string, CourseItem[]>();
  for (const c of data ?? []) {
    const k = `${c.path.name} · Etap ${c.stage.position} · ${c.stage.name}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  return (
    <Screen title="Kursy" subtitle="Po zajęciach wpisz wynik każdemu uczestnikowi. Uczestnik nic nie wysyła.">
      {!data ? (
        <Loading error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <Empty>Nie masz uprawnień do żadnego etapu z kursami.</Empty>
      ) : (
        [...groups].map(([title, courses]) => (
          <Group key={title} title={title}>
            {courses.map((c) => (
              <Row
                key={c.task.id}
                onClick={() => push({ name: "course", taskId: c.task.id })}
                leading={
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft/14 text-brand">
                    <GraduationCap size={18} aria-hidden />
                  </span>
                }
              >
                <div className="text-body">{c.task.name}</div>
                <div className="text-footnote tabular-nums text-fg-2">
                  {c.task.label} · zaliczyło {c.passed} z {c.enrolled}
                </div>
              </Row>
            ))}
          </Group>
        ))
      )}
    </Screen>
  );
}

const courseLabel = { PASSED: "Zaliczony", NEEDS_IMPROVEMENT: "Do powtórki" } as const;

export function CourseScreen({ taskId }: { taskId: string }) {
  const { pop, toast } = useStore();
  const courses = useApi(() => get<CourseItem[]>("/instructor/courses"), []);
  const people = useApi(() => get<CourseParticipant[]>(`/instructor/courses/${taskId}/participants`), [taskId]);
  const [edit, setEdit] = useState<CourseParticipant | null>(null);
  const [result, setResult] = useState<Result>("PASSED");
  const [comment, setComment] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const course = courses.data?.find((c) => c.task.id === taskId);
  const commentMissing = result === "NEEDS_IMPROVEMENT" && comment.trim() === "";

  const open = (p: CourseParticipant) => {
    setEdit(p);
    setResult("PASSED");
    setComment("");
    setTried(false);
  };
  const save = async () => {
    setTried(true);
    if (!edit || commentMissing) return;
    setBusy(true);
    try {
      await post(`/instructor/courses/${taskId}/results`, { user_id: edit.participant.id, result, comment: comment.trim() || null });
      toast(result === "PASSED" ? `Kurs zaliczony: ${personName(edit.participant)}` : `Do powtórki: ${personName(edit.participant)}`);
      setEdit(null);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
    await Promise.all([people.reload(), courses.reload()]);
  };

  return (
    <Screen title={course?.task.name ?? "Kurs"} back="Kursy" onBack={pop} subtitle={course ? `${course.task.label} · ${course.stage.name}` : undefined}>
      {!people.data ? (
        <Loading error={people.error} onRetry={people.reload} />
      ) : people.data.length === 0 ? (
        <Empty>Na tę ścieżkę nie jest jeszcze zapisany żaden uczestnik.</Empty>
      ) : (
        <Group title="Uczestnicy" footer="Zaliczenie jest ostateczne. Przy „Do powtórki” uczestnik może przyjść na kolejny termin.">
          {people.data.map((p) => {
            const locked = p.status === "LOCKED";
            const done = p.status === "PASSED";
            const known = p.status === "PASSED" || p.status === "NEEDS_IMPROVEMENT";
            return (
              <Row
                key={p.enrollment_id}
                chevron={false}
                onClick={done || locked ? undefined : () => open(p)}
                trailing={
                  locked ? (
                    <Badge tone="muted" icon={Lock}>
                      Etap niedostępny
                    </Badge>
                  ) : known ? (
                    <Badge tone={done ? "ok" : "warn"} icon={done ? Check : undefined}>
                      {courseLabel[p.status as keyof typeof courseLabel]}
                    </Badge>
                  ) : (
                    <span className="shrink-0 text-subhead font-semibold text-accent">Wpisz wynik</span>
                  )
                }
              >
                <div className={cx("text-body", locked && "text-fg-2")}>{personName(p.participant)}</div>
                {p.status === "NEEDS_IMPROVEMENT" && <div className="text-footnote text-fg-2">Można wpisać wynik z kolejnego terminu</div>}
              </Row>
            );
          })}
        </Group>
      )}

      <Sheet open={!!edit} title={edit ? `Wynik: ${personName(edit.participant)}` : ""} onClose={() => setEdit(null)}>
        <div className="flex flex-col gap-4">
          <Segmented
            label="Wynik kursu"
            value={result}
            onChange={setResult}
            options={[
              { value: "PASSED", label: "Zaliczony" },
              { value: "NEEDS_IMPROVEMENT", label: "Do powtórki" },
            ]}
          />
          <Field
            label={result === "NEEDS_IMPROVEMENT" ? "Komentarz (wymagany)" : "Komentarz (opcjonalny)"}
            error={tried && commentMissing ? "Napisz, nad czym uczestnik ma popracować." : undefined}
            hint={result === "PASSED" ? "Zaliczenie jest ostateczne — nie da się go cofnąć." : undefined}
          >
            {(fid) => <textarea id={fid} rows={3} value={comment} aria-invalid={tried && commentMissing} onChange={(e) => setComment(e.target.value)} className={inputClass} />}
          </Field>
          <Button size="lg" disabled={busy} onClick={save}>
            Zapisz wynik
          </Button>
        </div>
      </Sheet>
    </Screen>
  );
}
