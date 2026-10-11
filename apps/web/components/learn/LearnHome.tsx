"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Crosshair, Gamepad2 } from "lucide-react";
import { CallTheMove } from "@/components/learn/CallTheMove";
import { SpotGame } from "@/components/learn/SpotGame";
import { Button } from "@/components/ui/button";
import { TRACKS, type Concept, type GameRound, type MoveRound } from "@/lib/learn";
import { isDone, resetProgress, useProgress, type ModuleProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";

export function LearnHome({ concepts, rounds, moves }: { concepts: Concept[]; rounds: GameRound[]; moves: MoveRound[] }) {
  const [playing, setPlaying] = useState<"spot" | "move" | null>(null);
  const progress = useProgress();

  if (playing) {
    return (
      <div className="h-[calc(100dvh-15rem)] min-h-[460px]">
        {playing === "spot" ? <SpotGame rounds={rounds} onExit={() => setPlaying(null)} /> : <CallTheMove rounds={moves} onExit={() => setPlaying(null)} />}
      </div>
    );
  }

  const ordered = TRACKS.flatMap((t) => concepts.filter((c) => c.track === t.id));
  const doneAll = ordered.filter((c) => isDone(progress[c.id])).length;
  const nextUp = ordered.find((c) => !isDone(progress[c.id]));

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr]">
        <section aria-label="Your progress" className="flex flex-col gap-4 rounded-md border border-line bg-panel p-5 md:col-span-2 xl:col-span-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="type-title text-fg">Your progress</h2>
            <span className="num type-meta text-fg-2">
              <span className="text-fg">{doneAll}</span> of {ordered.length} modules
            </span>
          </div>
          <div className="flex gap-1" aria-hidden>
            {ordered.map((c) => (
              <span key={c.id} className={cn("h-1.5 flex-1 rounded-full", isDone(progress[c.id]) ? "bg-yes" : progress[c.id]?.read ? "bg-fg-3" : "bg-raised")} />
            ))}
          </div>
          {nextUp ? (
            <Link href={`/learn/${nextUp.id}`} className="group mt-auto flex items-center justify-between gap-3 rounded-md bg-raised px-4 py-3 hover:bg-raised/70">
              <span className="min-w-0">
                <span className="block type-small text-fg-3">
                  {doneAll === 0 ? "Start here" : "Up next"} · {TRACKS.find((t) => t.id === nextUp.track)?.label}
                </span>
                <span className="block truncate type-body font-medium text-fg">{nextUp.title}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-fg-2 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <p className="mt-auto type-body text-yes">All {ordered.length} modules done.</p>
          )}
        </section>
        <GameCard
          icon={<Crosshair className="size-5" />}
          tone="mispricing"
          title="Call the move"
          lead="Real market, real moment. Up, down or flat, and how far? Headline rounds show how the swarm called it."
          cta={`Play · ${moves.length} rounds`}
          disabled={moves.length === 0}
          onPlay={() => setPlaying("move")}
        />
        <GameCard
          icon={<Gamepad2 className="size-5" />}
          tone="anomaly"
          title="Spot the manipulation"
          lead="Four charts, one rigged. Find the wash trades, pre-news moves and pumps."
          cta={`Play · ${rounds.length} rounds`}
          disabled={rounds.length === 0}
          onPlay={() => setPlaying("spot")}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {TRACKS.map((t, ti) => {
          const mods = concepts.filter((c) => c.track === t.id);
          const done = mods.filter((c) => isDone(progress[c.id])).length;
          return (
            <section key={t.id} aria-labelledby={`track-${t.id}`} className="rounded-md border border-line bg-panel">
              <header className="border-b border-line px-5 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id={`track-${t.id}`} className="type-title text-fg">
                    <span className="num mr-2 text-fg-3">{ti + 1}</span>
                    {t.label}
                  </h2>
                  <span className="num type-small text-fg-2">
                    {done}/{mods.length}
                  </span>
                </div>
                <p className="mt-0.5 type-meta text-fg-2">{t.blurb}</p>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={mods.length} aria-valuenow={done} aria-label={`${t.label} progress`}>
                  <div className="h-full rounded-full bg-yes transition-[width]" style={{ width: `${(done / Math.max(1, mods.length)) * 100}%` }} />
                </div>
              </header>
              <ol className="divide-y divide-line/60">
                {mods.map((c, i) => (
                  <ModuleRow key={c.id} c={c} n={i + 1} p={progress[c.id]} />
                ))}
              </ol>
            </section>
          );
        })}
      </div>

      {doneAll > 0 && (
        <button type="button" onClick={resetProgress} className="self-start type-small text-fg-3 underline-offset-2 hover:text-fg-2 hover:underline">
          Reset my progress
        </button>
      )}
    </div>
  );
}

function ModuleRow({ c, n, p }: { c: Concept; n: number; p?: ModuleProgress }) {
  const d = isDone(p);
  const extras = [c.live && "Live example", c.widget && "Calculator"].filter(Boolean).join(" · ");
  return (
    <li>
      <Link href={`/learn/${c.id}`} className="group flex gap-3 px-5 py-3.5 transition-colors hover:bg-raised/50">
        <span aria-hidden className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border num text-[11px]", d ? "border-yes bg-yes text-bg" : "border-line text-fg-3")}>
          {d ? <Check className="size-3" strokeWidth={3} /> : n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="type-body font-medium text-fg">{c.title}</span>
            {!d && p?.quiz && (
              <span className="num shrink-0 type-small text-anomaly">
                {p.quiz.right}/{p.quiz.of}
              </span>
            )}
            {d && <span className="sr-only">(done)</span>}
          </span>
          <span className="mt-0.5 block type-meta leading-snug text-fg-2">{c.blurb}</span>
          {extras && <span className="mt-1 block type-small text-fg-3">{extras}</span>}
        </span>
      </Link>
    </li>
  );
}

function GameCard({ icon, tone, title, lead, cta, disabled, onPlay }: { icon: React.ReactNode; tone: "anomaly" | "mispricing"; title: string; lead: string; cta: string; disabled: boolean; onPlay: () => void }) {
  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-panel p-5">
      <div className="flex items-center gap-3">
        <span className={cn("grid size-9 place-items-center rounded-md", tone === "anomaly" ? "bg-anomaly/15 text-anomaly" : "bg-mispricing/15 text-mispricing")}>{icon}</span>
        <h2 className="type-title text-fg">{title}</h2>
      </div>
      <p className="type-meta text-fg-2">{lead}</p>
      <Button onClick={onPlay} disabled={disabled} className={cn("mt-auto", tone === "anomaly" ? "bg-anomaly text-bg hover:bg-anomaly/90" : "bg-mispricing text-bg hover:bg-mispricing/90")}>
        {cta}
      </Button>
    </section>
  );
}
