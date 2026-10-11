"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowDown, ArrowRight, ArrowUp, Loader2, Minus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MoveRound } from "@/lib/learn";
import { runSim } from "@/lib/sim";
import { cn } from "@/lib/utils";

type Dir = "up" | "down" | "flat";
type Size = "small" | "medium" | "big";
const SIZES: { id: Size; label: string; range: string }[] = [
  { id: "small", label: "Small", range: "under 5 pts" },
  { id: "medium", label: "Medium", range: "5–15 pts" },
  { id: "big", label: "Big", range: "over 15 pts" },
];
const FLAT = 2; // a move under 2 points counts as "about the same"

const classify = (pts: number): { dir: Dir; size: Size | null } => {
  const a = Math.abs(pts);
  if (a < FLAT) return { dir: "flat", size: null };
  return { dir: pts > 0 ? "up" : "down", size: a < 5 ? "small" : a <= 15 ? "medium" : "big" };
};
const pts = (r: MoveRound) => Math.round((r.after - r.before) * 1000) / 10;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const signed = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(1)} pts`;

/** Score: 2 for direction and size, 1 for direction only. A correct "about the same" is worth 2. */
function scoreOf(guess: { dir: Dir; size: Size | null }, actual: { dir: Dir; size: Size | null }) {
  if (guess.dir !== actual.dir) return 0;
  return guess.dir === "flat" || guess.size === actual.size ? 2 : 1;
}

export function CallTheMove({ rounds, onExit }: { rounds: MoveRound[]; onExit: () => void }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<Dir | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [locked, setLocked] = useState(false);
  const [score, setScore] = useState(0);
  const [swarm, setSwarm] = useState<Record<number, { status: "running" | "done" | "failed"; end?: number }>>({});
  const max = rounds.length * 2;

  if (i >= rounds.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="type-title text-fg-2">Call the move · done</p>
        <p className="num text-[56px] leading-none text-fg">
          {score}
          <span className="text-fg-3">/{max}</span>
        </p>
        <p className="max-w-md type-body text-fg-2">
          {score >= max * 0.75 ? "Sharp reads. You priced the news about as well as the market did." : score >= max * 0.4 ? "Decent. Size is the hard part: most people get the direction and misjudge how far." : "Markets are hard to call. That's why a price that already moved is worth more than a hunch."}
        </p>
        <div className="mt-2 flex gap-2">
          <Button variant="outline" onClick={() => { setI(0); setScore(0); setDir(null); setSize(null); setLocked(false); }}>
            <RotateCcw /> Play again
          </Button>
          <Button onClick={onExit}>Back to Learn</Button>
        </div>
      </div>
    );
  }

  const r = rounds[i];
  const actualPts = pts(r);
  const actual = classify(actualPts);
  const guess = dir ? { dir, size: dir === "flat" ? null : size } : null;
  const ready = dir === "flat" || (dir != null && size != null);
  const got = locked && guess ? scoreOf(guess, actual) : 0;
  const sw = swarm[i];

  const lock = () => {
    if (!guess || !ready) return;
    setLocked(true);
    setScore((s) => s + scoreOf(guess, actual));
    if (r.kind === "headline" && r.headline && !swarm[i]) {
      const at = i;
      setSwarm((m) => ({ ...m, [at]: { status: "running" } }));
      runSim({ marketId: r.marketId, headline: r.headline, headlineAt: r.headlineAt, backtest: true, swarm: { ageMix: 0.5, income: 0.5, lean: 0.5, risk: 0.5, infoSpeed: 0.5, size: 600 } })
        .then((run) => {
          const target = (r.headlineAt ?? 0) + 7200;
          const tk = run.ticks.find((t) => t.t >= target) ?? run.ticks[run.ticks.length - 1];
          setSwarm((m) => ({ ...m, [at]: { status: "done", end: tk?.price } }));
        })
        .catch(() => setSwarm((m) => ({ ...m, [at]: { status: "failed" } })));
    }
  };
  const next = () => {
    setI((x) => x + 1);
    setDir(null);
    setSize(null);
    setLocked(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="type-meta text-fg-2">
            Call the move · round {i + 1} of {rounds.length} · {r.kind === "headline" ? "headline round" : "chart round"}
          </p>
          <p className="truncate type-title text-fg">{r.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="num type-meta text-fg-2">
            Score <span className="text-fg">{score}</span>
            <span className="text-fg-3">/{max}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={onExit}>
            <X /> Quit
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-h-0 flex-col rounded-md border border-line bg-panel p-4">
          {r.headline && (
            <blockquote className="mb-4 border-l-2 border-mispricing pl-3">
              <p className="type-small text-fg-3">The headline</p>
              <p className="type-lead font-medium text-fg">{r.headline}</p>
            </blockquote>
          )}
          <div className="mb-2 flex items-baseline justify-between type-meta text-fg-2">
            <span>
              {r.kind === "headline" ? "Last 3 hours before the headline" : "Last 48 hours"} · now <span className="num text-fg">{pct(r.before)}</span>
            </span>
            <span>Call it for {r.horizon}</span>
          </div>
          <div className="min-h-[200px] flex-1">
            <MoveChart lead={r.lead} reveal={locked ? r.reveal ?? [r.after] : null} before={r.before} after={r.after} />
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-md border border-line bg-panel p-4">
          {!locked ? (
            <>
              <fieldset>
                <legend className="mb-2 type-body font-medium text-fg">Which way will it go?</legend>
                <div className="grid grid-cols-3 gap-2">
                  {([["up", "Up", ArrowUp], ["down", "Down", ArrowDown], ["flat", "About the same", Minus]] as const).map(([id, label, Icon]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={dir === id}
                      onClick={() => setDir(id)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-md border px-2 py-3 font-display text-[14px] transition-colors",
                        dir === id ? (id === "up" ? "border-yes bg-yes/12 text-fg" : id === "down" ? "border-no bg-no/12 text-fg" : "border-fg-2 bg-raised text-fg") : "border-line text-fg-2 hover:border-fg-3 hover:text-fg",
                      )}
                    >
                      <Icon className={cn("size-5", id === "up" ? "text-yes" : id === "down" ? "text-no" : "text-fg-2")} />
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 type-small text-fg-3">&ldquo;About the same&rdquo; means within {FLAT} points.</p>
              </fieldset>
              <fieldset disabled={dir == null || dir === "flat"} className="disabled:opacity-40">
                <legend className="mb-2 type-body font-medium text-fg">How far?</legend>
                <div className="grid grid-cols-3 gap-2">
                  {SIZES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={size === s.id}
                      onClick={() => setSize(s.id)}
                      className={cn("rounded-md border px-2 py-2 text-center transition-colors", size === s.id && dir !== "flat" ? "border-fg-2 bg-raised text-fg" : "border-line text-fg-2 hover:border-fg-3 hover:text-fg")}
                    >
                      <span className="block font-display text-[14px]">{s.label}</span>
                      <span className="block type-small text-fg-3">{s.range}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <Button onClick={lock} disabled={!ready} className="mt-auto bg-mispricing text-bg hover:bg-mispricing/90">
                Lock it in
              </Button>
            </>
          ) : (
            <motion.div initial={{ y: 8 }} animate={{ y: 0 }} className="flex h-full flex-col gap-4">
              <div>
                <p className={cn("type-title", got === 2 ? "text-yes" : got === 1 ? "text-anomaly" : "text-no")}>
                  {got === 2 ? "Nailed it · +2" : got === 1 ? "Right way, wrong size · +1" : "Missed · +0"}
                </p>
                <p className="mt-1 type-meta text-fg-2">
                  You said {guess?.dir === "flat" ? "about the same" : `${guess?.dir}, ${guess?.size}`}. It went {actual.dir === "flat" ? "nowhere much" : `${actual.dir}, ${actual.size}`}.
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-3 border-y border-line py-3">
                <div>
                  <dt className="type-small text-fg-3">Before</dt>
                  <dd className="num text-[20px] font-medium text-fg">{pct(r.before)}</dd>
                </div>
                <div>
                  <dt className="type-small text-fg-3">After</dt>
                  <dd className="num text-[20px] font-medium text-fg">{pct(r.after)}</dd>
                </div>
                <div>
                  <dt className="type-small text-fg-3">Move</dt>
                  <dd className={cn("num text-[20px] font-medium", actualPts > 0 ? "text-yes" : actualPts < 0 ? "text-no" : "text-fg")}>{signed(actualPts)}</dd>
                </div>
              </dl>
              {r.kind === "headline" && (
                <div className="rounded-md bg-raised px-3 py-2.5">
                  <p className="type-small text-fg-3">What the swarm called (600 simulated traders)</p>
                  {!sw || sw.status === "running" ? (
                    <p className="mt-1 flex items-center gap-2 type-meta text-fg-2">
                      <Loader2 className="size-3.5 animate-spin" /> Running the swarm on this headline…
                    </p>
                  ) : sw.status === "failed" || sw.end == null ? (
                    <p className="mt-1 type-meta text-fg-2">The swarm couldn&apos;t run on this one.</p>
                  ) : (
                    <p className="mt-1 type-meta text-fg-2">
                      Swarm ended at <span className="num font-medium text-fg">{pct(sw.end)}</span> vs real <span className="num font-medium text-fg">{pct(r.after)}</span>
                      {" · "}
                      {Math.abs(sw.end - r.after) < 0.05 ? "close call" : `off by ${Math.round(Math.abs(sw.end - r.after) * 100)} pts`}
                      {classify((sw.end - r.before) * 100).dir === actual.dir ? ", right direction." : ", wrong direction."}
                    </p>
                  )}
                </div>
              )}
              <Button onClick={next} className="mt-auto">
                {i + 1 < rounds.length ? "Next round" : "See your score"} <ArrowRight />
              </Button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Lead-in prices, then (after locking in) the hidden stretch in the outcome's colour. Fixed 0-100% scale so small moves look small.
 *  Headline rounds only know the price 2 hours later, so their reveal is a straight line to it. */
function MoveChart({ lead, reveal, before, after }: { lead: number[]; reveal: number[] | null; before: number; after: number }) {
  const w = 600;
  const h = 240;
  const padY = 12;
  const total = lead.length + Math.max(8, Math.round(lead.length * 0.4));
  const x = (k: number) => (k / Math.max(1, total - 1)) * w;
  const y = (p: number) => padY + (1 - p) * (h - padY * 2);
  const path = (pts: number[], start: number) => pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(start + k).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  const nowX = x(lead.length - 1);
  const revealPts = reveal ? [before, ...(reveal.length > 1 ? reveal : [(before + after) / 2, after])] : null;
  const color = after > before + 0.02 ? "var(--tmb-yes)" : after < before - 0.02 ? "var(--tmb-no)" : "var(--tmb-fg-2)";
  const revealStep = revealPts ? (total - lead.length) / Math.max(1, revealPts.length - 1) : 0;
  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Price history">
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={w} y1={y(g)} y2={y(g)} stroke="var(--tmb-grid)" vectorEffect="non-scaling-stroke" />
        ))}
        <rect x={nowX} y="0" width={w - nowX} height={h} fill="var(--tmb-raised)" opacity={reveal ? 0.25 : 0.6} />
        <line x1={nowX} x2={nowX} y1="0" y2={h} stroke="var(--tmb-fg-3)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={path(lead, 0)} fill="none" stroke="var(--tmb-fg)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {revealPts && (
          <>
            <clipPath id="ctm-wipe">
              <rect x={nowX} y="0" height={h} width={w - nowX}>
                <animate attributeName="width" from="0" to={w - nowX} dur="0.8s" calcMode="spline" keySplines="0.22 1 0.36 1" keyTimes="0;1" fill="freeze" />
              </rect>
            </clipPath>
            <path
              d={revealPts.map((p, k) => `${k === 0 ? "M" : "L"}${(nowX + k * revealStep * (w / Math.max(1, total - 1))).toFixed(1)},${y(p).toFixed(1)}`).join(" ")}
              clipPath="url(#ctm-wipe)"
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
      {[0.25, 0.5, 0.75].map((g) => (
        <span key={g} className="num pointer-events-none absolute left-1 -translate-y-full type-small text-fg-3" style={{ top: `${(y(g) / h) * 100}%` }}>
          {g * 100}%
        </span>
      ))}
      {!reveal && (
        <span className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-[28px] text-fg-3" style={{ left: `${((nowX + (w - nowX) / 2) / w) * 100}%` }}>
          ?
        </span>
      )}
    </div>
  );
}
