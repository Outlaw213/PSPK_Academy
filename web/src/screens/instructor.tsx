import { useState } from "react";
import { Hand, Undo2 } from "lucide-react";
import { Screen } from "../components/screen";
import { Badge, Button, Field, Group, inputClass, PhotoTile, Row, Segmented, cx } from "../components/ui";
import { allTasks, useStore } from "../store";
import { submissionStatus } from "../lib/status";
import { assessedByMe } from "../mock/data";

const ME = "Jan Kowalski";

export function QueueScreen() {
  const { queue, push } = useStore();
  const [tab, setTab] = useState<"open" | "mine">("open");
  const open = queue.filter((q) => q.status === "SUBMITTED");
  const mine = queue.filter((q) => q.status === "UNDER_REVIEW" && q.instructor === ME);
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
      {list.length === 0 ? (
        <p className="rounded-card bg-bg-2 p-8 text-center text-body text-fg-2">
          {tab === "open" ? "Brak zgłoszeń do przejęcia. Nowe pojawią się tutaj." : "Nie oceniasz teraz żadnego zgłoszenia."}
        </p>
      ) : (
        <Group>
          {list.map((s) => (
            <Row key={s.id} onClick={() => push({ name: "review", id: s.id })} leading={<PhotoTile photo={s.photos[0]} className="size-14 shrink-0 rounded-[12px]" />}>
              <div className="text-body font-semibold">{s.participant}</div>
              <div className="truncate text-subhead text-fg-2">
                {s.taskName} · próba {s.attempt}
              </div>
              <div className="text-footnote tabular-nums text-fg-3">
                {s.stageName} · {s.submittedAt} · {s.photos.length} zdj.
              </div>
            </Row>
          ))}
        </Group>
      )}
    </Screen>
  );
}

export function AssessedScreen() {
  return (
    <Screen title="Ocenione" subtitle="Twoje ostatnie oceny">
      <Group footer="Oceny są ostateczne i zostają w historii uczestnika.">
        {assessedByMe.map((h) => (
          <Row key={h.id} leading={<PhotoTile photo={h.photo} className="size-12 shrink-0 rounded-[10px]" />} chevron={false}>
            <div className="text-body">{h.participant}</div>
            <div className="text-footnote tabular-nums text-fg-2">
              {h.task} · próba {h.attempt} · {h.at}
            </div>
            <div className="mt-1.5">
              <Badge tone={h.result === "PASSED" ? "ok" : "warn"}>{h.result === "PASSED" ? "Zaliczone" : "Do poprawy"}</Badge>
            </div>
          </Row>
        ))}
      </Group>
    </Screen>
  );
}

export function ReviewScreen({ id }: { id: string }) {
  const { queue, setQueue, stages, pop, toast } = useStore();
  const s = queue.find((q) => q.id === id);
  const [result, setResult] = useState<"PASSED" | "NEEDS_IMPROVEMENT">("PASSED");
  const [comment, setComment] = useState("");
  const [tried, setTried] = useState(false);
  const [active, setActive] = useState(0);
  if (!s) return null;
  const task = allTasks(stages).find((t) => t.id === s.taskId);
  const st = submissionStatus[s.status];
  const mine = s.status === "UNDER_REVIEW" && s.instructor === ME;
  const commentMissing = result === "NEEDS_IMPROVEMENT" && comment.trim() === "";

  const claim = () => {
    setQueue((q) => q.map((x) => (x.id === id ? { ...x, status: "UNDER_REVIEW", instructor: ME } : x)));
    toast("Przejęto do oceny");
  };
  const release = () => {
    setQueue((q) => q.map((x) => (x.id === id ? { ...x, status: "SUBMITTED", instructor: undefined } : x)));
    toast("Zgłoszenie zwolnione");
  };
  const submit = () => {
    setTried(true);
    if (commentMissing) return;
    setQueue((q) => q.filter((x) => x.id !== id));
    toast(result === "PASSED" ? "Zadanie zaliczone" : "Skierowano do poprawy");
    pop();
  };

  return (
    <Screen
      title={s.participant}
      back="Kolejka"
      onBack={pop}
      subtitle={
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge tone={st.tone}>{st.label}</Badge>
          <span className="text-footnote text-fg-2">
            {s.taskName} · próba {s.attempt} · wysłano {s.submittedAt}
          </span>
        </div>
      }
      footer={
        s.status === "SUBMITTED" ? (
          <>
            <span className="flex-1 text-subhead text-fg-2">Po przejęciu tylko Ty możesz ocenić to zgłoszenie.</span>
            <Button size="lg" icon={Hand} onClick={claim}>
              Przejmij do oceny
            </Button>
          </>
        ) : undefined
      }
    >
      <section className="flex flex-col gap-2">
        <PhotoTile photo={s.photos[active]} className="aspect-[4/3] w-full" label={`Zdjęcie ${active + 1} z ${s.photos.length}`} />
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
              <PhotoTile photo={p} className="size-16 rounded-[10px]" />
            </button>
          ))}
        </div>
      </section>

      {s.comment && (
        <section className="flex flex-col gap-1 rounded-card bg-bg-2 p-5">
          <h3 className="text-footnote font-semibold uppercase tracking-[0.06em] text-fg-3">Komentarz uczestnika</h3>
          <p className="max-w-[65ch] text-body">{s.comment}</p>
        </section>
      )}

      {task && (
        <details className="group rounded-card bg-bg-2 p-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="focus-ring flex min-h-11 cursor-pointer items-center justify-between rounded-ctl text-headline">
            Kryteria oceny · wersja treści {s.revision}
            <span className="text-subhead font-normal text-accent group-open:hidden">Pokaż</span>
            <span className="hidden text-subhead font-normal text-accent group-open:inline">Ukryj</span>
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-fg-2">
            {task.criteria.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="mt-3 text-footnote text-fg-3">Wymagany materiał: {task.requirements}</p>
        </details>
      )}

      {s.attempt > 1 && (
        <Group title="Poprzednie próby" footer="Przykładowe dane — w aplikacji pełna historia uczestnika dla tego zadania.">
          {Array.from({ length: s.attempt - 1 }, (_, i) => s.attempt - 1 - i).map((n) => (
            <Row key={n} chevron={false}>
              <div className="text-body">Próba {n}</div>
              <div className="text-footnote text-fg-2">Do poprawy · Marek Nowak</div>
            </Row>
          ))}
        </Group>
      )}

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
            <Button variant="plain" icon={Undo2} onClick={release}>
              Zwolnij zgłoszenie
            </Button>
            <Button size="lg" variant={result === "PASSED" ? "prominent" : "bordered"} onClick={submit}>
              {result === "PASSED" ? "Zalicz zadanie" : "Odeślij do poprawy"}
            </Button>
          </div>
        </section>
      )}
      {s.status === "UNDER_REVIEW" && !mine && (
        <p className="rounded-card bg-bg-2 p-5 text-body text-fg-2">Ocenia: {s.instructor}. Inni instruktorzy nie mogą równolegle oceniać tego zgłoszenia.</p>
      )}
    </Screen>
  );
}
