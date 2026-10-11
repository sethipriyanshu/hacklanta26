"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Check, RotateCcw, X } from "lucide-react";
import { MiniChart } from "@/components/learn/MiniChart";
import { Button } from "@/components/ui/button";
import type { GameRound } from "@/lib/learn";
import { cn } from "@/lib/utils";

export function SpotGame({ rounds, onExit }: { rounds: GameRound[]; onExit: () => void }) {
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const round = rounds[i];
  const finished = i >= rounds.length;

  if (finished) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="eyebrow">Round complete</p>
        <p className="num text-[56px] leading-none text-fg">
          {score}
          <span className="text-fg-3">/{rounds.length}</span>
        </p>
        <p className="max-w-md type-body text-fg-2">{score === rounds.length ? "Flawless. You read volume, timing and wallet concentration like a desk analyst." : score >= rounds.length / 2 ? "Solid. The ones you missed are the ones that fool real traders too." : "Those charts are designed to fool you; now you know the tells."}</p>
        <div className="mt-2 flex gap-2">
          <Button onClick={() => { setI(0); setPick(null); setScore(0); }} variant="outline">
            <RotateCcw /> Play again
          </Button>
          <Button onClick={onExit}>Back to Learn</Button>
        </div>
      </div>
    );
  }

  const revealed = pick !== null;
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="eyebrow">Spot the Manipulation · round {i + 1} of {rounds.length}</p>
          <p className="text-[15px] text-fg">Four anonymized charts. One of them is not an honest market. Which?</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="num type-meta text-fg-3">
            score <span className="text-fg">{score}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={onExit}>
            <X /> Quit
          </Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        {round.charts.map((c, idx) => {
          const isAnswer = idx === round.answer;
          const state = !revealed ? null : isAnswer ? "bad" : "good";
          return (
            <motion.button
              key={`${round.index}-${idx}`}
              type="button"
              disabled={revealed}
              onClick={() => { setPick(idx); if (idx === round.answer) setScore((s) => s + 1); }}
              whileHover={!revealed ? { scale: 1.01 } : undefined}
              className={cn("relative flex min-h-0 flex-col overflow-hidden rounded-md border bg-panel text-left transition-colors", !revealed && "border-line hover:border-fg-3", revealed && isAnswer && "border-anomaly", revealed && !isAnswer && pick === idx && "border-no", revealed && !isAnswer && pick !== idx && "border-line opacity-60")}
            >
              <div className="flex items-center justify-between px-3 pt-2.5">
                <span className="num type-small text-fg-3">CHART {String.fromCharCode(65 + idx)}</span>
                {revealed && (
                  <span className={cn("num flex items-center gap-1 type-small", isAnswer ? "text-anomaly" : "text-fg-3")}>
                    {isAnswer ? <><Check className="size-3" /> {c.label.toUpperCase()}</> : c.label.toUpperCase()}
                    {c.kind === "synthetic" && <span className="rounded-sm border border-line px-1 text-fg-3">SYNTHETIC</span>}
                  </span>
                )}
              </div>
              <div className="min-h-0 flex-1 px-2 pb-1">
                <MiniChart price={c.series.price} volume={c.series.volume} headlineIndex={c.headlineIndex} highlight={state} />
              </div>
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence>
        {revealed && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("mt-3 flex items-start gap-3 rounded-md border p-3", pick === round.answer ? "border-yes/40 bg-yes/10" : "border-no/40 bg-no/10")}>
            <span className={cn("num shrink-0 rounded-full px-2 py-0.5 type-small text-bg", pick === round.answer ? "bg-yes" : "bg-no")}>{pick === round.answer ? "Correct" : `It was ${String.fromCharCode(65 + round.answer)}`}</span>
            <p className="flex-1 type-body leading-relaxed text-fg">{round.explanation}</p>
            <Link href={`/learn/${round.concept}`} className="shrink-0 type-meta text-mispricing hover:underline">
              Read the concept →
            </Link>
            <Button size="sm" onClick={() => { setI((x) => x + 1); setPick(null); }}>
              {i + 1 < rounds.length ? "Next" : "Finish"} <ArrowRight />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
