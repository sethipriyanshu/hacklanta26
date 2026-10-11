"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Orbit, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { AgentCard } from "@/components/sim/AgentCard";
import { PriceStrip } from "@/components/sim/PriceStrip";
import { SwarmCanvas } from "@/components/sim/SwarmCanvas";
import { SwarmStats, summarize } from "@/components/sim/SwarmStats";
import { EmptyState, Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import type { Market } from "@/lib/api";
import { getRunSummary, runSim, type RunSummary, type SimRun } from "@/lib/sim";
import { cents } from "@/lib/format";
import { cn } from "@/lib/utils";

const SLIDERS: { key: keyof Sliders; label: string; lo: string; hi: string }[] = [
  { key: "ageMix", label: "Age mix", lo: "young", hi: "old" },
  { key: "income", label: "Income", lo: "low", hi: "high" },
  { key: "lean", label: "Political lean", lo: "left", hi: "right" },
  { key: "risk", label: "Risk appetite", lo: "cautious", hi: "degen" },
  { key: "infoSpeed", label: "Information speed", lo: "slow", hi: "instant" },
];
interface Sliders {
  ageMix: number;
  income: number;
  lean: number;
  risk: number;
  infoSpeed: number;
}
const DEFAULT: Sliders = { ageMix: 0.5, income: 0.5, lean: 0.5, risk: 0.5, infoSpeed: 0.6 };

export function Simulator({ market }: { market: Market }) {
  const [headline, setHeadline] = useState("");
  const [sliders, setSliders] = useState<Sliders>(DEFAULT);
  const [size, setSize] = useState(1000);
  const [runState, setRun] = useState<SimRun | null>(null);
  // Switching markets keeps the headline and sliders but never shows one market's swarm under another's name.
  const run = runState && runState.marketId === market.id ? runState : null;
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [pickedAt, setPickedAt] = useState<{ x: number; y: number } | null>(null);
  const [graphOpen, setGraphOpen] = useState(false);
  // A written read of the finished run, keyed by run id so a new run never shows the last one's summary.
  const [summary, setSummary] = useState<{ runId: string; data: RunSummary | null } | null>(null);
  const [reveal, setReveal] = useState(false);
  const raf = useRef<number | null>(null);

  const requestSummary = useCallback(
    async (r: SimRun) => {
      const start = typeof r.meta?.p0 === "number" ? r.meta.p0 : market.yesPrice;
      const s = summarize(r, start);
      const n = Math.max(1, r.agents.length);
      setSummary({ runId: r.id, data: null });
      const data = await getRunSummary({
        marketTitle: market.subtitle && market.subtitle !== market.eventTitle ? `${market.eventTitle} · ${market.subtitle}` : market.title,
        headline: r.headline,
        startPrice: start,
        endPrice: s.end,
        settleMinutes: s.settleMin,
        tradedUsd: s.traded,
        lowerShare: s.lower / n,
        higherShare: s.higher / n,
        unheardShare: (n - s.heardN) / n,
        groups: s.groups.map((g) => ({ label: g.persona.label, agents: g.agents, meanBelief: g.mean, bet: g.bet, minutes: g.minutes })),
      });
      setSummary((cur) => (cur?.runId === r.id ? { runId: r.id, data } : cur));
    },
    [market],
  );

  const start = useCallback(async () => {
    if (!headline.trim()) {
      setError("Write a headline for the crowd to react to.");
      return;
    }
    setBusy(true);
    setError(null);
    setPicked(null);
    setReveal(false);
    setPlaying(false);
    try {
      // Live run on the market's current price, with the headline landing now. A fresh seed each time, so
      // "Run again" draws a new crowd from the same settings.
      const seed = Math.floor(Math.random() * 1_000_000);
      const r = await runSim({ marketId: market.id, headline: headline.trim(), headlineAt: null, swarm: { ageMix: sliders.ageMix, income: sliders.income, lean: sliders.lean, risk: sliders.risk, infoSpeed: sliders.infoSpeed, size }, seed, backtest: false });
      setRun(r);
      void requestSummary(r);
      setFrame(0);
      setPlaying(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "run failed");
    } finally {
      setBusy(false);
    }
  }, [market, headline, sliders, size, requestSummary]);

  useEffect(() => {
    if (!playing || !run) return;
    const total = run.ticks.length;
    let last = performance.now();
    const tick = (now: number) => {
      if (now - last > 28) {
        last = now;
        setFrame((f) => {
          if (f + 1 >= total) {
            setPlaying(false);
            setReveal(true);
            return total - 1;
          }
          return f + 1;
        });
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, run]);

  const cur = run?.ticks[Math.min(frame, (run?.ticks.length ?? 1) - 1)];
  // Dots show what each agent believes right now, against the price before the news: red expects lower, green
  // expects higher, muted heard but unchanged, grey hasn't heard yet. (Last trade side stays in the agent card.)
  const p0 = typeof run?.meta?.p0 === "number" ? run.meta.p0 : null;
  const view = useMemo(() => {
    if (!run || !cur || p0 == null) return null;
    let lower = 0;
    let higher = 0;
    let heard = 0;
    const seen: boolean[] = [];
    let moods = "";
    for (const a of run.agents) {
      const has = a.seenAt != null && cur.t >= a.seenAt;
      seen.push(has);
      if (!has) {
        moods += "-";
        continue;
      }
      heard += 1;
      const d = a.belief - p0;
      if (d < -0.02) {
        lower += 1;
        moods += "n";
      } else if (d > 0.02) {
        higher += 1;
        moods += "y";
      } else moods += "h";
    }
    const pct = (x: number) => Math.round((x / Math.max(1, run.agents.length)) * 100);
    return { moods, seen, lowerPct: pct(lower), higherPct: pct(higher), unheardPct: pct(run.agents.length - heard) };
  }, [run, cur, p0]);

  return (
    <div className="grid min-h-[calc(100dvh-13.5rem)] grid-cols-[300px_1fr] grid-rows-[auto_minmax(340px,1fr)_220px] gap-3">
      <Panel title="Swarm controls" className="row-span-3 row-start-1">
        <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
          <div>
            <p className="eyebrow mb-1.5">Contract</p>
            <p className="line-clamp-2 type-meta text-fg">{market.subtitle && market.subtitle !== market.eventTitle ? `${market.eventTitle} · ${market.subtitle}` : market.title}</p>
            <p className="mt-0.5 type-small text-fg-2">{cents(market.yesPrice)} yes · {market.venue === "kalshi" ? "Kalshi" : "Polymarket"}</p>
          </div>
          <div>
            <p className="eyebrow mb-1.5">Headline</p>
            <textarea value={headline} onChange={(e) => setHeadline(e.target.value)} rows={3} placeholder="e.g. Fed signals another hike in December" className="w-full resize-none rounded-md border border-line bg-bg px-2.5 py-2 type-meta text-fg outline-none placeholder:text-fg-3 focus:border-fg-3" />
          </div>
          {SLIDERS.map((s) => (
            <label key={s.key} className="block">
              <span className="mb-1 flex justify-between type-meta text-fg-2">
                <span>{s.label}</span>
                <span className="num type-small text-fg-3">{sliders[s.key] < 0.34 ? s.lo : sliders[s.key] > 0.66 ? s.hi : "mixed"} · {Math.round(sliders[s.key] * 100)}</span>
              </span>
              <input type="range" min={0} max={1} step={0.05} value={sliders[s.key]} onChange={(e) => setSliders((v) => ({ ...v, [s.key]: Number(e.target.value) }))} className="h-1 w-full accent-[var(--tmb-contrarian)]" />
            </label>
          ))}
          <label className="block">
            <span className="mb-1 flex justify-between type-meta text-fg-2">
              <span>Swarm size</span>
              <span className="num type-small text-fg-3">{size.toLocaleString()} agents</span>
            </span>
            <input type="range" min={100} max={5000} step={100} value={size} onChange={(e) => setSize(Number(e.target.value))} className="h-1 w-full accent-[var(--tmb-contrarian)]" />
          </label>
          <Button onClick={start} disabled={busy} className="mt-auto w-full bg-contrarian text-bg hover:bg-contrarian/90">
            {busy ? <Sparkles className="animate-spin" /> : <Play />} {busy ? "Simulating…" : run ? "Run again" : "Run swarm"}
          </Button>
          {error && <p className="type-small text-no">{error}</p>}
        </div>
      </Panel>

      {/* The run's written read leads the results, once playback has finished so it never spoils the swarm. */}
      {run && summary?.runId === run.id && reveal ? (
        <section aria-labelledby="sum-h" aria-live="polite" className="col-start-2 row-start-1 flex items-start gap-4 rounded-md border border-contrarian/40 bg-contrarian/10 px-5 py-4">
          <Sparkles className="mt-1 size-5 shrink-0 text-contrarian" />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <h3 id="sum-h" className="font-display text-[15px] font-medium text-fg">What happened</h3>
              {summary?.data && <span className="rounded-sm bg-contrarian/20 px-1.5 type-small font-medium text-fg">{summary.data.source === "llm" ? "AI summary" : "Auto summary"}</span>}
            </div>
            {summary?.data ? (
              <>
                <p className="type-body leading-relaxed text-fg">{summary.data.summary}</p>
                <p className="mt-1.5 type-meta text-fg-2">{summary.data.takeaway}</p>
              </>
            ) : (
              <p className="type-body text-fg-2">Writing a summary of the run…</p>
            )}
          </div>
          {summary?.data && (
            <button type="button" onClick={() => setGraphOpen(true)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-line bg-panel px-3 font-display text-[14px] font-medium text-fg hover:border-fg-3 hover:bg-raised">
              <BarChart3 className="size-4" /> Full stats
            </button>
          )}
        </section>
      ) : null}

      <Panel className="col-start-2 row-start-2" title={run ? `Swarm · ${run.agents.length.toLocaleString()} agents` : "Swarm"} accent="var(--tmb-contrarian)" action={
          cur && view && p0 != null ? (
            <span className="num type-small text-fg-3">
              vs {Math.round(p0 * 100)}% before the news: <span className="text-no">{view.lowerPct}% expect lower</span> · <span className="text-yes">{view.higherPct}% higher</span> · {view.unheardPct}% haven’t heard
            </span>
          ) : undefined
        }>
        <div className="relative h-full">
          {run && cur ? (
            <>
              <SwarmCanvas stances={view?.moods ?? cur.stances} seenMask={view?.seen} onPick={(i, at) => {
                  setPicked(i);
                  setPickedAt(at);
                }} highlight={picked} />
              {picked != null && run.agents[picked] && <AgentCard run={run} agent={run.agents[picked]} at={pickedAt} onClose={() => setPicked(null)} />}
              <div className="absolute bottom-3 left-3 flex items-center gap-2">
                <Button size="icon-sm" variant="outline" onClick={() => { setFrame(0); setReveal(false); setPlaying(true); }} aria-label="Restart">
                  <RotateCcw />
                </Button>
                <Button size="icon-sm" variant="outline" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
                  {playing ? <Pause /> : <Play />}
                </Button>
                <span className="num type-small text-fg-3">
                  {cur.t >= run.headlineAt ? `+${Math.round((cur.t - run.headlineAt) / 60)} min after headline` : `${Math.round((run.headlineAt - cur.t) / 60)} min before headline`}
                </span>
              </div>
              {p0 != null && (
                <>
                  <button
                    type="button"
                    onClick={() => setGraphOpen(true)}
                    className="absolute right-3 bottom-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-panel px-3 font-display text-[14px] font-medium text-fg shadow-[0_6px_18px_-6px_rgb(0_0_0/0.6)] transition-colors hover:border-fg-3 hover:bg-raised"
                  >
                    <BarChart3 className="size-4" /> View swarm
                  </button>
                  <SwarmStats run={run} p0={p0} open={graphOpen} onOpenChange={setGraphOpen} />
                </>
              )}
            </>
          ) : (
            <div className="bg-dotgrid h-full">
              <EmptyState icon={Orbit} title={busy ? "Sampling the crowd…" : "No swarm running"} hint="Write a headline and press Run. Up to 5,000 agents will react, trade, and move the price." />
            </div>
          )}
        </div>
      </Panel>

      <Panel
        className="col-start-2 row-start-3"
        title={run?.realPoints ? "Simulated price · real curve overlay" : "Simulated price"}
        action={
          run ? (
            <span className="num flex items-center gap-3 type-small text-fg-3">
              {run.maeCents != null && reveal && (
                <span>
                  MAE <span className="text-fg">{run.maePostCents ?? run.maeCents}¢</span> after the headline
                </span>
              )}
              {run.realPoints > 0 && (
                <button type="button" onClick={() => setReveal((r) => !r)} className={cn("rounded-sm border px-1.5 py-px", reveal ? "border-fg-2 text-fg" : "border-line text-fg-3 hover:text-fg-2")}>
                  {reveal ? "real curve on" : "reveal real curve"}
                </button>
              )}
            </span>
          ) : null
        }
      >
        <div className="h-full p-1">
          {run ? (
            <PriceStrip ticks={run.ticks} upto={frame} headlineAt={run.headlineAt} showReal={reveal} />
          ) : (
            <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 40" aria-hidden="true">
              <path d="M0 30 C 20 28, 30 22, 45 20 S 70 14, 100 12" fill="none" stroke="var(--tmb-line)" strokeWidth="0.6" strokeDasharray="1.5 1.5" />
            </svg>
          )}
        </div>
      </Panel>
    </div>
  );
}
