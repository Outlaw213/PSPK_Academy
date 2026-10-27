import { useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { Screen } from "../components/screen";
import { Button, cx } from "../components/ui";
import { useStore, type QuizDraft } from "../store";
import { get, post } from "../api/client";
import type { QuizResult, TaskDetail } from "../api/types";
import { errorText } from "../lib/errors";
import { useApi } from "../lib/useApi";
import { Loading } from "./participant";

type Answers = Record<string, string[]>;

interface Question {
  id: string;
  text: string;
  kind: "SINGLE" | "MULTI";
  options: { id: string; text: string }[];
}

/** Questions with selectable answers; `mark` decides how an option looks once a result is shown. */
function Questions({
  questions,
  answers,
  onToggle,
  mark,
}: {
  questions: Question[];
  answers: Answers;
  onToggle: (q: Question, optionId: string) => void;
  mark: (q: Question, optionId: string, picked: boolean) => "right" | "wrong" | null;
}) {
  return questions.map((q, n) => {
    const picked = answers[q.id] ?? [];
    return (
      <fieldset key={q.id} className="flex flex-col gap-3 rounded-card bg-bg-2 p-5">
        <legend className="sr-only">Pytanie {n + 1}</legend>
        <div className="flex gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft/14 text-footnote font-semibold tabular-nums text-brand">{n + 1}</span>
          <div>
            <p className="text-headline">{q.text}</p>
            <p className="text-footnote text-fg-3">{q.kind === "SINGLE" ? "Jedna odpowiedź" : "Kilka odpowiedzi"}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {q.options.map((o) => {
            const on = picked.includes(o.id);
            const m = mark(q, o.id, on);
            return (
              <button
                key={o.id}
                type="button"
                role={q.kind === "SINGLE" ? "radio" : "checkbox"}
                aria-checked={on}
                onClick={() => onToggle(q, o.id)}
                className={cx(
                  "focus-ring flex min-h-12 items-center gap-3 rounded-ctl border px-4 py-2 text-left text-body transition",
                  on ? "border-accent bg-accent/8" : "hairline hover:bg-fg/[0.03]",
                  m === "right" && "border-ok bg-ok/10",
                  m === "wrong" && "border-bad bg-bad/8",
                )}
              >
                <span
                  className={cx(
                    "grid size-6 shrink-0 place-items-center border-2 transition",
                    q.kind === "SINGLE" ? "rounded-full" : "rounded-[7px]",
                    on ? "border-accent bg-accent text-accent-fg" : "border-fg/25",
                  )}
                  aria-hidden
                >
                  {on && <Check size={14} strokeWidth={3} />}
                </span>
                <span className="flex-1">{o.text}</span>
                {m === "right" && <Check size={18} className="text-ok" aria-label="Poprawna odpowiedź" />}
                {m === "wrong" && <X size={18} className="text-bad" aria-label="Błędna odpowiedź" />}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  });
}

function ResultCard({ score, right, total, need, passed, passedText }: { score: number; right: number; total: number; need: number; passed: boolean; passedText: string }) {
  return (
    <section className={cx("flex items-center gap-4 rounded-card p-5", passed ? "bg-ok/12" : "bg-warn/14")} aria-live="polite">
      <span className={cx("grid size-16 shrink-0 place-items-center rounded-full font-display text-title3 tabular-nums", passed ? "bg-ok text-bg-2" : "bg-warn/20 text-warn")}>
        {score}%
      </span>
      <div>
        <h2 className="text-title3">{passed ? "Zaliczone" : "Jeszcze nie tym razem"}</h2>
        <p className="text-subhead text-fg-2">
          {right} z {total} poprawnych. {passed ? passedText : `Potrzeba ${need}. Poprawnych odpowiedzi nie pokazujemy — przeczytaj materiał i spróbuj ponownie.`}
        </p>
      </div>
    </section>
  );
}

const toggled = (answers: Answers, q: Question, id: string): Answers => {
  const cur = answers[q.id] ?? [];
  const next = q.kind === "SINGLE" ? [id] : cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  return { ...answers, [q.id]: next };
};

/** The participant's quiz: graded by the backend against the admin's key (BR-32); the key is shown only after a pass. */
export function QuizScreen({ taskId }: { taskId: string }) {
  const { pop, toast } = useStore();
  const { data: t, error, reload } = useApi(() => get<TaskDetail>(`/tasks/${taskId}`), [taskId]);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  if (!t)
    return (
      <Screen title="Quiz" back="Zadanie" onBack={pop}>
        <Loading error={error} onRetry={reload} />
      </Screen>
    );

  const questions = t.revision.questions;
  const total = questions.length;
  const threshold = t.revision.pass_threshold ?? 0;
  const need = Math.ceil((threshold / 100) * total);
  const answered = questions.filter((q) => (answers[q.id] ?? []).length > 0).length;
  const key = new Map(result?.review?.map((r) => [r.question_id, r.correct_option_ids]) ?? []);

  const check = async () => {
    setBusy(true);
    try {
      const r = await post<QuizResult>(`/tasks/${taskId}/quiz-attempts`, {
        answers: questions.map((q) => ({ question_id: q.id, option_ids: answers[q.id] ?? [] })),
      });
      setResult(r);
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title={t.revision.name}
      back="Zadanie"
      onBack={pop}
      subtitle={`${t.label} · ${total} pytań · zaliczenie od ${threshold}% (${need} z ${total})`}
      footer={
        result ? (
          result.passed ? (
            <Button size="lg" onClick={pop} className="flex-1 sm:flex-none">
              Wróć do zadania
            </Button>
          ) : (
            <Button size="lg" icon={RotateCcw} onClick={() => (setResult(null), setAnswers({}))} className="flex-1 sm:flex-none">
              Spróbuj ponownie
            </Button>
          )
        ) : (
          <>
            <span className="flex-1 text-subhead tabular-nums text-fg-2">
              Odpowiedziano {answered} z {total}
            </span>
            <Button size="lg" disabled={answered < total || busy} onClick={check}>
              Sprawdź
            </Button>
          </>
        )
      }
    >
      {result && <ResultCard score={result.score} right={result.correct} total={result.total} need={need} passed={result.passed} passedText="Następne zadanie jest odblokowane." />}
      <Questions
        questions={questions}
        answers={answers}
        onToggle={(q, id) => !result && setAnswers(toggled(answers, q, id))}
        mark={(q, id, on) => {
          const right = key.get(q.id);
          return right ? (right.includes(id) ? "right" : on ? "wrong" : null) : null;
        }}
      />
    </Screen>
  );
}

/** Admin's preview of a quiz being edited in the builder: graded here, on unsaved questions; nothing is saved.
 * Participants are always graded by the backend (BR-32). */
export function QuizPreviewScreen({ quiz, onBack }: { quiz: QuizDraft; onBack: () => void }) {
  const questions: Question[] = quiz.questions.map((q, n) => ({
    id: `q${n}`,
    text: q.text,
    kind: q.kind,
    options: q.options.map((o, m) => ({ id: `q${n}o${m}`, text: o.text })),
  }));
  const key = new Map(quiz.questions.map((q, n) => [`q${n}`, q.options.flatMap((o, m) => (o.is_correct ? [`q${n}o${m}`] : []))]));
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<{ score: number; right: number } | null>(null);
  const total = questions.length;
  const need = Math.ceil((quiz.threshold / 100) * total);
  const answered = questions.filter((q) => (answers[q.id] ?? []).length > 0).length;
  const isRight = (q: Question) => {
    const k = key.get(q.id)!;
    const picked = answers[q.id] ?? [];
    return k.length === picked.length && k.every((x) => picked.includes(x));
  };

  return (
    <Screen
      title={quiz.name || "Quiz"}
      back="Edycja"
      onBack={onBack}
      subtitle={`${total} pytań · zaliczenie od ${quiz.threshold}% (${need} z ${total}) · podgląd admina, wynik nie jest zapisywany`}
      footer={
        result ? (
          <Button size="lg" onClick={() => (setResult(null), setAnswers({}))} className="flex-1 sm:flex-none">
            Od nowa
          </Button>
        ) : (
          <>
            <span className="flex-1 text-subhead tabular-nums text-fg-2">
              Odpowiedziano {answered} z {total}
            </span>
            <Button
              size="lg"
              disabled={answered < total}
              onClick={() => {
                const right = questions.filter(isRight).length;
                setResult({ right, score: Math.floor((right * 100) / total) });
              }}
            >
              Sprawdź
            </Button>
          </>
        )
      }
    >
      {result && (
        <ResultCard score={result.score} right={result.right} total={total} need={need} passed={result.right * 100 >= quiz.threshold * total} passedText="Uczestnik od razu dostałby zaliczenie." />
      )}
      <Questions
        questions={questions}
        answers={answers}
        onToggle={(q, id) => !result && setAnswers(toggled(answers, q, id))}
        mark={(q, id, on) => (!result ? null : key.get(q.id)!.includes(id) ? "right" : on ? "wrong" : null)}
      />
    </Screen>
  );
}
