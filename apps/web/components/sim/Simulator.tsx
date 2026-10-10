"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Orbit, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { AgentCard } from "@/components/sim/AgentCard";
import { PriceStrip } from "@/components/sim/PriceStrip";
import { SwarmCanvas } from "@/components/sim/SwarmCanvas";
import { EmptyState, Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import type { Market } from "@/lib/api";
import { getStoredRun, runSim, type SimPreset, type SimRun } from "@/lib/sim";
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
const fmtT = (t: number) => new Date(t * 1000).toISOString().slice(5, 16).replace("T", " ") + "Z";

export function Simulator({ presets, market, scenarioId }: { presets: SimPreset[]; market: Market | null; scenarioId: number | null }) {
  const router = useRouter();
  const sp = useSearchParams();
  const preset = useMemo(() => presets.find((p) => p.scenario === scenarioId) ?? null, [presets, scenarioId]);
  const [headline, setHeadline] = useState(preset?.headline ?? "");
  const [sliders, setSliders] = useState<Sliders>({ ...DEFAULT, infoSpeed: preset?.swarm.infoSpeed ?? DEFAULT.infoSpeed });
  const [size, setSize] = useState(preset?.swarm.size ?? 1000);
  const [seed, setSeed] = useState(42);
  const [run, setRun] = useState<SimRun | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [reveal, setReveal] = useState(false);
  const raf = useRef<number | null>(null);
  const autoRan = useRef<string | null>(null);

  const matchesPreset = Boolean(preset && preset.precomputed && headline === preset.headline && Math.abs(sliders.infoSpeed - preset.swarm.infoSpeed) < 0.01 && size === preset.swarm.size && seed === 42 && sliders.ageMix === 0.5 && sliders.income === 0.5 && sliders.lean === 0.5 && sliders.risk === 0.5);

  const start = useCallback(async () => {
    if (!market) return;
    setBusy(true);
    setError(null);
    setPicked(null);
    setReveal(false);
    setPlaying(false);
    try {
      let r: SimRun | null = null;
      if (matchesPreset && preset) r = await getStoredRun(`scenario-${preset.scenario}`);
      if (!r) {
        r = await runSim({ marketId: market.id, headline: headline || "No news. Quiet session.", headlineAt: preset?.headlineAt ?? null, swarm: { ageMix: sliders.ageMix, income: sliders.income, lean: sliders.lean, risk: sliders.risk, infoSpeed: sliders.infoSpeed, size }, seed, backtest: Boolean(preset?.backtest) });
      }
      setRun(r);
      setFrame(0);
      setPlaying(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "run failed");
    } finally {
      setBusy(false);
    }
  }, [market, matchesPreset, preset, headline, sliders, size, seed]);

  // Auto-run a preset once when arriving from the command line.
  useEffect(() => {
    const key = `${scenarioId}-${market?.id}`;
    if (preset && market && autoRan.current !== key) {
      autoRan.current = key;
      void start();
    }
  }, [preset, market, scenarioId, start]);

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
  const seenMask = useMemo(() => {
    if (!run || !cur) return undefined;
    // Agents are "seen" once stance can change; approximate with the run's final seen flags scaled by progress.
    const frac = cur.seen / Math.max(1, run.agents.length);
    return run.agents.map((a, i) => (a.seen ? i / run.agents.length <= frac : false));
  }, [run, cur]);
  const yesPct = cur ? Math.round((cur.yes / Math.max(1, cur.stances.length)) * 100) : 0;
  const noPct = cur ? Math.round((cur.no / Math.max(1, cur.stances.length)) * 100) : 0;

  const loadPreset = (p: SimPreset) => {
    router.push(`/sim?market=${encodeURIComponent(p.marketId)}&scenario=${p.scenario}`);
  };

  return (
    <div className="grid h-[calc(100dvh-13.5rem)] grid-cols-[300px_1fr] grid-rows-[1fr_200px] gap-3">
      <Panel title="Swarm controls" className="row-span-2">
        <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
          <div>
            <p className="eyebrow mb-1.5">Scenario presets</p>
            <div className="flex flex-col gap-1">
              {presets.map((p) => (
                <button key={p.scenario} type="button" onClick={() => loadPreset(p)} className={cn("rounded-md border px-2.5 py-1.5 text-left transition-colors", p.scenario === scenarioId ? "border-contrarian/50 bg-contrarian/10" : "border-line hover:bg-raised")}>
                  <span className="num block text-[10px] tracking-wider text-contrarian">{p.code}</span>
                  <span className="block text-[12px] text-fg">{p.title}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="eyebrow mb-1.5">Contract</p>
            <p className="line-clamp-2 text-[12px] text-fg">{market ? market.title : "Pick a contract from the Scanner, or load a preset."}</p>
            {market && <p className="num mt-0.5 text-[10.5px] text-fg-3">YES {cents(market.yesPrice)} · {market.venue}</p>}
          </div>
          <div>
            <p className="eyebrow mb-1.5">Headline</p>
            <textarea value={headline} onChange={(e) => setHeadline(e.target.value)} rows={3} placeholder="Type a headline the swarm will react to" className="w-full resize-none rounded-md border border-line bg-bg px-2.5 py-2 text-[12px] text-fg outline-none placeholder:text-fg-3 focus:border-fg-3" />
          </div>
          {SLIDERS.map((s) => (
            <label key={s.key} className="block">
              <span className="mb-1 flex justify-between text-[12px] text-fg-2">
                <span>{s.label}</span>
                <span className="num text-[10.5px] text-fg-3">{sliders[s.key] < 0.34 ? s.lo : sliders[s.key] > 0.66 ? s.hi : "mixed"} · {Math.round(sliders[s.key] * 100)}</span>
              </span>
              <input type="range" min={0} max={1} step={0.05} value={sliders[s.key]} onChange={(e) => setSliders((v) => ({ ...v, [s.key]: Number(e.target.value) }))} className="h-1 w-full accent-[var(--tmb-contrarian)]" />
            </label>
          ))}
          <label className="block">
            <span className="mb-1 flex justify-between text-[12px] text-fg-2">
              <span>Swarm size</span>
              <span className="num text-[10.5px] text-fg-3">{size.toLocaleString()} agents</span>
            </span>
            <input type="range" min={100} max={5000} step={100} value={size} onChange={(e) => setSize(Number(e.target.value))} className="h-1 w-full accent-[var(--tmb-contrarian)]" />
          </label>
          <label className="flex items-center justify-between text-[12px] text-fg-2">
            <span>Seed</span>
            <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} className="num w-20 rounded-md border border-line bg-bg px-2 py-1 text-right text-[12px] text-fg outline-none" />
          </label>
          <Button onClick={start} disabled={!market || busy} className="mt-auto w-full bg-contrarian text-bg hover:bg-contrarian/90">
            {busy ? <Sparkles className="animate-spin" /> : <Play />} {busy ? "Simulating…" : run ? "Run again" : "Run swarm"}
          </Button>
          {error && <p className="text-[11px] text-no">{error}</p>}
          {run && (
            <p className="num text-[10px] leading-snug text-fg-3">
              reactions: {run.reactionsSource} · liquidity b={Math.round(run.liquidity).toLocaleString()} · seed {run.seed}
              {matchesPreset ? " · stored run" : ""}
            </p>
          )}
        </div>
      </Panel>

      <Panel title={run ? `Swarm · ${run.agents.length.toLocaleString()} agents` : "Swarm"} accent="var(--tmb-contrarian)" action={cur ? <span className="num text-[11px] text-fg-3">{fmtT(cur.t)} · seen {Math.round((cur.seen / run!.agents.length) * 100)}% · <span className="text-yes">YES {yesPct}%</span> · <span className="text-no">NO {noPct}%</span></span> : undefined}>
        <div className="relative h-full">
          {run && cur ? (
            <>
              <SwarmCanvas stances={cur.stances} seenMask={seenMask} onPick={(i) => setPicked(i)} highlight={picked} />
              {picked != null && run.agents[picked] && <AgentCard run={run} agent={run.agents[picked]} onClose={() => setPicked(null)} />}
              <div className="absolute bottom-3 left-3 flex items-center gap-2">
                <Button size="icon-sm" variant="outline" onClick={() => { setFrame(0); setReveal(false); setPlaying(true); }} aria-label="Restart">
                  <RotateCcw />
                </Button>
                <Button size="icon-sm" variant="outline" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
                  {playing ? <Pause /> : <Play />}
                </Button>
                <span className="num text-[10.5px] text-fg-3">
                  {cur.t >= run.headlineAt ? `+${Math.round((cur.t - run.headlineAt) / 60)} min after headline` : `${Math.round((run.headlineAt - cur.t) / 60)} min before headline`}
                </span>
              </div>
            </>
          ) : (
            <div className="bg-dotgrid h-full">
              <EmptyState icon={Orbit} title={busy ? "Sampling the crowd…" : "No swarm running"} hint="Choose a contract and a headline. Up to 5,000 agents will react, trade, and move the price." />
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title={run?.realPoints ? "Simulated price · real curve overlay" : "Simulated price"}
        action={
          run ? (
            <span className="num flex items-center gap-3 text-[11px] text-fg-3">
              {run.maeCents != null && reveal && (
                <span>
                  MAE <span className="text-fg">{run.maePostCents ?? run.maeCents}¢</span> after the headline
                </span>
              )}
              {run.realPoints > 0 && (
                <button type="button" onClick={() => setReveal((r) => !r)} className={cn("rounded-sm border px-1.5 py-px tracking-wider uppercase", reveal ? "border-fg-2 text-fg" : "border-line text-fg-3 hover:text-fg-2")}>
                  {reveal ? "real curve on" : "reveal real curve"}
                </button>
              )}
            </span>
          ) : (
            <span className="num text-[11px] text-fg-3">MAE —</span>
          )
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
