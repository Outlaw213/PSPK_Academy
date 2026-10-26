import { useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { Screen } from "../components/screen";
import { Button, cx } from "../components/ui";
import { allTasks, useStore } from "../store";
import type { QuizQuestion } from "../mock/data";

type Answers = Record<string, string[]>;

// Mockup only: in the app the backend grades the attempt (BR-32) and the key never reaches the browser.
const isRight = (q: QuizQuestion, picked: string[] = []) => {
  const key = q.options.filter((o) => o.correct).map((o) => o.id);
  return key.length === picked.length && key.every((k) => picked.includes(k));
};

export function QuizScreen({ taskId, preview }: { taskId: string; preview?: boolean }) {
  const { stages, setStages, setHistory, pop, toast } = useStore();
  const t = allTasks(stages).find((x) => x.id === taskId)!;
  const quiz = t.quiz!;
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<{ score: number; right: number } | null>(null);

  const answered = quiz.questions.filter((q) => (answers[q.id] ?? []).length > 0).length;
  const total = quiz.questions.length;
  const need = Math.ceil((quiz.threshold / 100) * total);

  const toggle = (q: QuizQuestion, id: string) => {
    if (result) return;
    const cur = answers[q.id] ?? [];
    const next = q.kind === "SINGLE" ? [id] : cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setAnswers({ ...answers, [q.id]: next });
  };

  const check = () => {
    const right = quiz.questions.filter((q) => isRight(q, answers[q.id])).length;
    const score = Math.round((right / total) * 100);
    setResult({ score, right });
    window.scrollTo({ top: 0 });
    if (preview) return;
    const passed = score >= quiz.threshold;
    setHistory((h) => [
      {
        id: `sub-${Date.now()}`,
        taskId,
        taskName: t.name,
        taskCode: t.code,
        participant: "Jan Kowalski",
        attempt: h.filter((x) => x.taskId === taskId).length + 1,
        status: passed ? "PASSED" : "NEEDS_IMPROVEMENT",
        comment: "",
        photos: [{ id: `qz-${Date.now()}`, tone: passed ? 120 : 30, motif: "fire" }],
        submittedAt: "teraz",
        revision: t.revision,
        stageName: t.stage.name,
        assessment: { result: passed ? "PASSED" : "NEEDS_IMPROVEMENT", comment: `Wynik ${right} z ${total} (${score}%). Próg ${quiz.threshold}%.`, instructor: "Ocena automatyczna", at: "teraz" },
      },
      ...h,
    ]);
    setStages((ss) => ss.map((s) => ({ ...s, tasks: s.tasks.map((x) => (x.id === taskId ? { ...x, status: passed ? "PASSED" : "NEEDS_IMPROVEMENT" } : x)) })));
  };

  const passed = !!result && result.score >= quiz.threshold;
  const reveal = passed || preview;

  return (
    <Screen
      title={t.name}
      back={preview ? "Edycja" : "Zadanie"}
      onBack={pop}
      subtitle={`${t.code} · ${total} pytań · zaliczenie od ${quiz.threshold}% (${need} z ${total})${preview ? " · podgląd admina, wynik nie jest zapisywany" : ""}`}
      footer={
        result ? (
          passed || preview ? (
            <Button size="lg" onClick={() => (preview ? (setResult(null), setAnswers({})) : pop())} className="flex-1 sm:flex-none">
              {preview ? "Od nowa" : "Wróć do ścieżki"}
            </Button>
          ) : (
            <Button
              size="lg"
              icon={RotateCcw}
              onClick={() => {
                setResult(null);
                setAnswers({});
                toast("Nowa próba");
              }}
              className="flex-1 sm:flex-none"
            >
              Spróbuj ponownie
            </Button>
          )
        ) : (
          <>
            <span className="flex-1 text-subhead tabular-nums text-fg-2">
              Odpowiedziano {answered} z {total}
            </span>
            <Button size="lg" disabled={answered < total} onClick={check}>
              Sprawdź
            </Button>
          </>
        )
      }
    >
      {result && (
        <section className={cx("flex items-center gap-4 rounded-card p-5", passed ? "bg-ok/12" : "bg-warn/14")} aria-live="polite">
          <span className={cx("grid size-16 shrink-0 place-items-center rounded-full font-display text-title3 tabular-nums", passed ? "bg-ok text-bg-2" : "bg-warn/20 text-warn")}>
            {result.score}%
          </span>
          <div>
            <h2 className="text-title3">{passed ? "Zaliczone" : "Jeszcze nie tym razem"}</h2>
            <p className="text-subhead text-fg-2">
              {result.right} z {total} poprawnych.{" "}
              {passed ? (preview ? "Uczestnik od razu dostałby zaliczenie." : "Następne zadanie jest odblokowane.") : `Potrzeba ${need}. Poprawnych odpowiedzi nie pokazujemy — przeczytaj materiał i spróbuj ponownie.`}
            </p>
          </div>
        </section>
      )}

      {quiz.questions.map((q, n) => {
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
                const mark = result && reveal ? (o.correct ? "right" : on ? "wrong" : null) : null;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role={q.kind === "SINGLE" ? "radio" : "checkbox"}
                    aria-checked={on}
                    onClick={() => toggle(q, o.id)}
                    className={cx(
                      "focus-ring flex min-h-12 items-center gap-3 rounded-ctl border px-4 py-2 text-left text-body transition",
                      on ? "border-accent bg-accent/8" : "hairline hover:bg-fg/[0.03]",
                      mark === "right" && "border-ok bg-ok/10",
                      mark === "wrong" && "border-bad bg-bad/8",
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
                    {mark === "right" && <Check size={18} className="text-ok" aria-label="Poprawna odpowiedź" />}
                    {mark === "wrong" && <X size={18} className="text-bad" aria-label="Błędna odpowiedź" />}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </Screen>
  );
}
