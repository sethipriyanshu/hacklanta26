"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Persona, SimRun } from "@/lib/sim";
import { usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Term } from "@/components/shell/Term";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const pts = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x * 100))} pts`;
/** Above or below the pre-news price, with a 2-point neutral band so noise isn't painted as a view. */
const side = (b: number, p0: number) => (b < p0 - 0.02 ? "lower" : b > p0 + 0.02 ? "higher" : "same");
const SIDE_COLOR = { lower: "var(--tmb-no)", higher: "var(--tmb-yes)", same: "var(--tmb-fg-3)" } as const;

interface Group {
  persona: Persona;
  agents: number;
  heard: number;
  mean: number;
  bet: number;
  minutes: number | null;
  reason: string | null;
  confidence: number | null;
}

export function summarize(run: SimRun, p0: number) {
  const h = run.headlineAt;
  const end = run.ticks[run.ticks.length - 1]?.price ?? p0;
  const heard = run.agents.filter((a) => a.seenAt != null);
  const lower = heard.filter((a) => side(a.belief, p0) === "lower").length;
  const higher = heard.filter((a) => side(a.belief, p0) === "higher").length;
  const traded = run.ticks.filter((t) => t.t >= h).reduce((s, t) => s + (t.volume ?? 0), 0);
  // Settled: the first tick after which the price stays within 2 points of where it ends.
  const after = run.ticks.filter((t) => t.t >= h);
  let settleAt: number | null = null;
  for (let k = after.length - 1; k >= 0; k--) {
    if (Math.abs(after[k].price - end) > 0.02) break;
    settleAt = after[k].t;
  }
  const groups: Group[] = run.personas
    .map((persona) => {
      const mine = run.agents.filter((a) => a.personaId === persona.id);
      const heardMine = mine.filter((a) => a.seenAt != null);
      const r = run.reactions.find((x) => x.personaId === persona.id);
      const mean = heardMine.length ? heardMine.reduce((s, a) => s + a.belief, 0) / heardMine.length : p0;
      const delays = heardMine.map((a) => ((a.seenAt ?? h) - h) / 60);
      return {
        persona,
        agents: mine.length,
        heard: heardMine.length,
        mean,
        bet: mine.reduce((s, a) => s + a.spent, 0),
        minutes: delays.length ? delays.reduce((s, d) => s + d, 0) / delays.length : null,
        reason: r?.reason ?? null,
        confidence: r?.confidence ?? null,
      };
    })
    .filter((g) => g.agents > 0)
    .sort((a, b) => a.mean - b.mean);
  // Zoom to where beliefs actually are (plus the old and final price), in 2-point buckets.
  const vals = [...heard.map((a) => a.belief), p0, end];
  const lo = Math.max(0, Math.floor((Math.min(...vals) - 0.04) * 50) / 50);
  const hi = Math.min(1, Math.ceil((Math.max(...vals) + 0.04) * 50) / 50);
  const count = Math.max(1, Math.round((hi - lo) / 0.02));
  const bins = Array.from({ length: count }, (_, i) => ({ lo: lo + i * 0.02, hi: lo + (i + 1) * 0.02, n: 0 }));
  for (const a of heard) bins[Math.min(count - 1, Math.max(0, Math.floor((a.belief - lo) / 0.02)))].n += 1;
  const domain = [lo, hi] as const;
  return {
    domain, end, heardN: heard.length, lower, higher, traded, settleMin: settleAt != null ? Math.max(0, Math.round((settleAt - h) / 60)) : null, groups, bins };
}

export function SwarmStats({ run, p0, open, onOpenChange }: { run: SimRun; p0: number; open: boolean; onOpenChange: (v: boolean) => void }) {
  const s = useMemo(() => summarize(run, p0), [run, p0]);
  const [picked, setPicked] = useState<string | null>(null);
  const group = s.groups.find((g) => g.persona.id === picked) ?? null;
  const n = run.agents.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[92dvh] w-[min(1100px,96vw)] max-w-none flex-col gap-0 overflow-hidden rounded-xl border-line bg-panel p-0 sm:max-w-none">
        <header className="flex items-center gap-4 border-b border-line px-5 py-3">
          <div className="min-w-0 flex-1">
            <DialogTitle className="font-display text-[17px] font-medium text-fg">Swarm stats</DialogTitle>
            <DialogDescription className="truncate type-small text-fg-2">{run.headline}</DialogDescription>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} className="grid size-8 place-items-center rounded-md text-fg-2 hover:bg-raised hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {/* Headline numbers */}
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label={<Term term="implied probability">Price</Term>} value={`${pct(p0)} → ${pct(s.end)}`} sub={pts(s.end - p0)} subColor={SIDE_COLOR[side(s.end, p0)]} />
            <Tile label="Settled after" value={s.settleMin != null ? `${s.settleMin} min` : "—"} sub="within 2 pts of the final price" />
            <Tile label="Traded after the news" value={usd(s.traded)} sub={`by ${n.toLocaleString()} agents`} />
            {s.higher > s.lower ? (
              <Tile label="Expect" value={`${pct(s.higher / n)} higher`} sub={`${pct(s.lower / n)} lower · ${pct((n - s.heardN) / n)} haven’t heard`} valueColor="var(--tmb-yes)" />
            ) : (
              <Tile label="Expect" value={`${pct(s.lower / n)} lower`} sub={`${pct(s.higher / n)} higher · ${pct((n - s.heardN) / n)} haven’t heard`} valueColor={s.lower > 0 ? "var(--tmb-no)" : undefined} />
            )}
          </dl>

          {/* Belief distribution */}
          <section className="mt-6" aria-labelledby="dist-h">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="dist-h" className="type-title text-fg">Where beliefs landed after the news</h3>
              <span className="flex items-center gap-4 type-small text-fg-2">
                <Key color="var(--tmb-no)" label="below the old price" />
                <Key color="var(--tmb-yes)" label="above" />
                <Key line label={`old price ${pct(p0)}`} />
                <Key line dashed label={`final ${pct(s.end)}`} />
              </span>
            </div>
            <Histogram bins={s.bins} domain={s.domain} p0={p0} end={s.end} total={Math.max(1, s.heardN)} />
          </section>

          {/* Groups */}
          <section className="mt-6" aria-labelledby="groups-h">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 id="groups-h" className="type-title text-fg">{group ? group.persona.label : "By group"}</h3>
              {group ? (
                <button type="button" onClick={() => setPicked(null)} className="inline-flex items-center gap-1 type-meta text-fg-2 hover:text-fg">
                  <ChevronLeft className="size-4" /> All groups
                </button>
              ) : (
                <span className="type-small text-fg-2">Most bearish first. Click a group for its persona.</span>
              )}
            </div>
            {group ? <GroupDetail g={group} p0={p0} /> : <GroupTable groups={s.groups} p0={p0} onPick={setPicked} />}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Tile({ label, value, sub, valueColor, subColor }: { label: React.ReactNode; value: string; sub?: string; valueColor?: string; subColor?: string }) {
  return (
    <div className="rounded-md border border-line bg-bg/40 px-4 py-3">
      <dt className="type-small text-fg-2">{label}</dt>
      <dd className="num mt-1 text-[24px] leading-tight font-medium text-fg" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </dd>
      {sub && (
        <dd className="mt-0.5 type-small text-fg-3" style={subColor ? { color: subColor } : undefined}>
          {sub}
        </dd>
      )}
    </div>
  );
}

function Key({ color, label, line, dashed }: { color?: string; label: string; line?: boolean; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {line ? (
        <span aria-hidden className={cn("h-3 w-0 border-l-2", dashed ? "border-dashed border-fg" : "border-fg-3")} />
      ) : (
        <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: color }} />
      )}
      {label}
    </span>
  );
}

/** Post-news beliefs in 2-point buckets over the range they span. Thin bars, 2px gaps, rounded data-ends, markers for the old and final price. */
function Histogram({ bins, domain, p0, end, total }: { bins: { lo: number; hi: number; n: number }[]; domain: readonly [number, number]; p0: number; end: number; total: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = 180;
  const pad = { l: 8, r: 8, t: 10, b: 24 };
  const max = Math.max(...bins.map((b) => b.n), 1);
  const bw = (W - pad.l - pad.r) / bins.length;
  const [d0, d1] = domain;
  const x = (v: number) => pad.l + ((v - d0) / Math.max(0.0001, d1 - d0)) * (W - pad.l - pad.r);
  const ticks = Array.from({ length: 5 }, (_, k) => d0 + ((d1 - d0) * k) / 4);
  const y = (n: number) => pad.t + (1 - n / max) * (H - pad.t - pad.b);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-[180px] w-full" preserveAspectRatio="none" role="img" aria-label="Histogram of agent beliefs after the news">
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--tmb-line)" strokeWidth={1} />
        {bins.map((b, i) => {
          const mid = (b.lo + b.hi) / 2;
          const color = SIDE_COLOR[side(mid, p0)];
          const top = y(b.n);
          const h = H - pad.b - top;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x(b.lo)} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              {b.n > 0 && <rect x={x(b.lo) + 1} y={top} width={bw - 2} height={Math.max(2, h)} rx={3} fill={color} opacity={hover == null || hover === i ? 0.95 : 0.45} />}
            </g>
          );
        })}
        <line x1={x(p0)} x2={x(p0)} y1={pad.t - 4} y2={H - pad.b} stroke="var(--tmb-fg-3)" strokeWidth={2} />
        <line x1={x(end)} x2={x(end)} y1={pad.t - 4} y2={H - pad.b} stroke="var(--tmb-fg)" strokeWidth={2} strokeDasharray="5 4" />
        {ticks.map((v, k) => (
          <text key={k} x={x(v)} y={H - 6} textAnchor={k === 0 ? "start" : k === ticks.length - 1 ? "end" : "middle"} className="fill-[var(--tmb-fg-3)]" style={{ fontSize: 12 }}>
            {Math.round(v * 100)}%
          </text>
        ))}
      </svg>
      {hover != null && bins[hover].n > 0 && (
        <div className="pointer-events-none absolute top-0 rounded-md border border-line bg-raised px-2.5 py-1.5 type-small text-fg shadow-lg" style={{ left: `calc(${((hover + 0.5) / bins.length) * 100}% - 60px)` }}>
          <span className="num">{Math.round(bins[hover].lo * 100)}–{Math.round(bins[hover].hi * 100)}%</span>
          <span className="text-fg-2"> · {bins[hover].n} agents ({pct(bins[hover].n / total)})</span>
        </div>
      )}
    </div>
  );
}

/** One row per persona: average belief drawn as a shift from the old price, plus how fast and how much it traded. */
function GroupTable({ groups, p0, onPick }: { groups: Group[]; p0: number; onPick: (id: string) => void }) {
  const maxShift = Math.max(...groups.map((g) => Math.abs(g.mean - p0)), 0.05);
  const maxBet = Math.max(...groups.map((g) => g.bet), 1);
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line type-small text-fg-2">
            <th className="px-3 py-2 font-medium">Group</th>
            <th className="px-3 py-2 text-right font-medium">Agents</th>
            <th className="w-[34%] px-3 py-2 font-medium">Average belief vs old price</th>
            <th className="px-3 py-2 text-right font-medium">Reacted after</th>
            <th className="w-[18%] px-3 py-2 font-medium">Money bet</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const shift = g.mean - p0;
            const color = SIDE_COLOR[side(g.mean, p0)];
            const w = (Math.abs(shift) / maxShift) * 50;
            return (
              <tr key={g.persona.id} onClick={() => onPick(g.persona.id)} className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-raised/60" title={`${g.persona.label}: ${pct(g.mean)} average belief, ${pts(shift)} vs the old price`}>
                <td className="px-3 py-2">
                  <span className="type-body text-fg">{g.persona.label}</span>
                </td>
                <td className="num px-3 py-2 text-right type-meta text-fg-2">{g.agents}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <div className="relative h-2.5 flex-1">
                      <span aria-hidden className="absolute inset-y-[-3px] left-1/2 w-px bg-fg-3" />
                      <span aria-hidden className="absolute inset-y-0 rounded-[3px]" style={{ background: color, width: `${w}%`, left: shift < 0 ? `${50 - w}%` : "50%" }} />
                    </div>
                    <span className="num w-[86px] shrink-0 text-right type-meta text-fg">
                      {pct(g.mean)} <span className="text-fg-2">{pts(shift)}</span>
                    </span>
                  </div>
                </td>
                <td className="num px-3 py-2 text-right type-meta text-fg-2">{g.minutes != null ? `${Math.round(g.minutes)} min` : "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 flex-1">
                      <span aria-hidden className="block h-full rounded-[3px] bg-fg-3" style={{ width: `${(g.bet / maxBet) * 100}%` }} />
                    </div>
                    <span className="num w-14 shrink-0 text-right type-meta text-fg-2">{usd(g.bet)}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GroupDetail({ g, p0 }: { g: Group; p0: number }) {
  const p = g.persona;
  const shift = g.mean - p0;
  return (
    <div className="grid gap-5 rounded-md border border-line p-4 md:grid-cols-[1fr_1fr]">
      <div className="flex flex-col gap-3">
        <p className="type-meta text-fg-2">{p.job}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 type-meta">
          <Field k="Age" v={p.ageBand} />
          <Field k="Income" v={p.incomeBand} />
          <Field k="Leans" v={p.lean} />
          <Field k="Hears news" v={p.infoSpeed > 0.66 ? "fast" : p.infoSpeed < 0.34 ? "slowly" : "in time"} />
          <Field k="Risk appetite" v={`${Math.round(p.riskAppetite * 100)} / 100`} />
          <Field k="Typical stake" v={usd(p.bankroll)} />
        </dl>
        <p className="type-small text-fg-2">Media diet: {p.mediaDiet}</p>
      </div>
      <div className="flex flex-col gap-3">
        {g.reason && <blockquote className="rounded-md bg-raised px-3 py-2 type-body text-fg italic">“{g.reason}”</blockquote>}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 type-meta">
          <Field k="Agents in the swarm" v={g.agents.toLocaleString()} />
          <Field k="Heard the news" v={`${g.heard} of ${g.agents}`} />
          <Field k="Average belief" v={`${pct(g.mean)} (${pts(shift)})`} />
          <Field k="Reacted after" v={g.minutes != null ? `${Math.round(g.minutes)} min` : "—"} />
          <Field k="Money bet" v={usd(g.bet)} />
          <Field k="Confidence" v={g.confidence != null ? `${Math.round(g.confidence * 100)}%` : "—"} />
        </dl>
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="type-small text-fg-3">{k}</dt>
      <dd className="text-fg capitalize">{v}</dd>
    </div>
  );
}
