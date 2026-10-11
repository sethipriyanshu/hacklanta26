"use client";

import { useEffect, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import type { QuizItem } from "@/lib/learn";
import { markRead, saveQuiz, useProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";

/** A 2-3 question check at the end of a module. Answers reveal the why; the result is saved to this browser. */
export function Quiz({ moduleId, items }: { moduleId: string; items: QuizItem[] }) {
  const progress = useProgress();
  const [picks, setPicks] = useState<(number | null)[]>(() => items.map(() => null));
  const answered = picks.filter((p) => p != null).length;
  const right = picks.filter((p, i) => p === items[i].answer).length;
  const past = progress[moduleId]?.quiz;

  // Opening a module counts as reading it.
  useEffect(() => markRead(moduleId), [moduleId]);

  const choose = (qi: number, oi: number) => {
    if (picks[qi] != null) return;
    const next = picks.map((p, i) => (i === qi ? oi : p));
    setPicks(next);
    if (next.every((p) => p != null)) saveQuiz(moduleId, next.filter((p, i) => p === items[i].answer).length, items.length);
  };

  return (
    <section aria-labelledby="quiz-h" className="rounded-md border border-line bg-panel p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="quiz-h" className="type-title text-fg">Quick check</h3>
        {answered === items.length ? (
          <span className="flex items-center gap-3 type-meta">
            <span className={cn("font-medium", right * 2 >= items.length ? "text-yes" : "text-anomaly")}>
              {right} of {items.length} right{right * 2 >= items.length ? " · module done" : ""}
            </span>
            <button type="button" onClick={() => setPicks(items.map(() => null))} className="inline-flex items-center gap-1 text-fg-2 hover:text-fg">
              <RotateCcw className="size-3.5" /> Try again
            </button>
          </span>
        ) : past ? (
          <span className="type-small text-fg-3">Last time: {past.right} of {past.of}</span>
        ) : (
          <span className="type-small text-fg-3">{items.length} questions</span>
        )}
      </div>
      <ol className="flex flex-col gap-5">
        {items.map((it, qi) => {
          const pick = picks[qi];
          return (
            <li key={qi}>
              <p className="mb-2 type-body font-medium text-fg">
                {qi + 1}. {it.q}
              </p>
              <div className="flex flex-col gap-1.5">
                {it.options.map((o, oi) => {
                  const chosen = pick === oi;
                  const correct = oi === it.answer;
                  const show = pick != null;
                  return (
                    <button
                      key={oi}
                      type="button"
                      onClick={() => choose(qi, oi)}
                      disabled={show}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md border px-3 py-2 text-left type-body transition-colors",
                        !show && "border-line text-fg hover:border-fg-3 hover:bg-raised",
                        show && correct && "border-yes/60 bg-yes/10 text-fg",
                        show && chosen && !correct && "border-no/60 bg-no/10 text-fg",
                        show && !chosen && !correct && "border-line text-fg-3",
                      )}
                    >
                      <span aria-hidden className="grid size-5 shrink-0 place-items-center">
                        {show && correct ? <Check className="size-4 text-yes" /> : show && chosen ? <X className="size-4 text-no" /> : <span className="size-2.5 rounded-full border border-fg-3" />}
                      </span>
                      {o}
                    </button>
                  );
                })}
              </div>
              {pick != null && <p className="mt-2 type-meta text-fg-2">{it.why}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
