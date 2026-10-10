"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, Play, Quote, RotateCcw } from "lucide-react";
import { Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/components/shell/ProfileProvider";
import { PERSONAS, debateStreamUrl, type Consensus, type DeskProfile, type PersonaId, type Stance } from "@/lib/desk";
import type { Market } from "@/lib/api";
import { cents, usd } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Col {
  stance?: Stance;
  confidence?: number;
  keyRisk?: string;
  text: string;
  done: boolean;
  rebuttal?: string;
  revised?: number;
}
const EMPTY: Record<PersonaId, Col> = { quant: { text: "", done: false }, contrarian: { text: "", done: false }, riskmgr: { text: "", done: false } };
const ORDER: PersonaId[] = ["quant", "contrarian", "riskmgr"];

export function Debate({ market, profiles, scenarioId }: { market: Market; profiles: DeskProfile[]; scenarioId: number | null }) {
  const { profile: active } = useProfile();
  const profile = profiles.find((p) => p.id === active.id) ?? profiles[0];
  const [cols, setCols] = useState<Record<PersonaId, Col>>(EMPTY);
  const [consensus, setConsensus] = useState<Consensus | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "streaming" | "rebuttals" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const es = useRef<EventSource | null>(null);
  const startRef = useRef<() => void>(() => {});

  const start = useCallback(() => {
    es.current?.close();
    setCols({ quant: { text: "", done: false }, contrarian: { text: "", done: false }, riskmgr: { text: "", done: false } });
    setConsensus(null);
    setSource(null);
    setError(null);
    setPhase("streaming");
    const src = new EventSource(debateStreamUrl(market.id, profile.id));
    es.current = src;
    src.addEventListener("context", (e) => setSource((JSON.parse((e as MessageEvent).data) as { source: string }).source));
    src.addEventListener("take_start", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { persona: PersonaId; stance: Stance; confidence: number; keyRisk: string };
      setCols((c) => ({ ...c, [d.persona]: { ...c[d.persona], stance: d.stance, confidence: d.confidence, keyRisk: d.keyRisk } }));
    });
    src.addEventListener("token", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { persona: PersonaId; text: string };
      setCols((c) => ({ ...c, [d.persona]: { ...c[d.persona], text: c[d.persona].text + d.text } }));
    });
    src.addEventListener("take_end", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { persona: PersonaId };
      setCols((c) => ({ ...c, [d.persona]: { ...c[d.persona], done: true } }));
      setPhase("rebuttals");
    });
    src.addEventListener("rebuttal", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { persona: PersonaId; text: string; revisedConfidence: number | null };
      setCols((c) => ({ ...c, [d.persona]: { ...c[d.persona], rebuttal: d.text, revised: d.revisedConfidence ?? undefined } }));
    });
    src.addEventListener("consensus", (e) => {
      setConsensus(JSON.parse((e as MessageEvent).data) as Consensus);
      setPhase("done");
      src.close();
    });
    src.addEventListener("error", (e) => {
      const data = (e as MessageEvent).data;
      if (data) setError((JSON.parse(data) as { message: string }).message);
      else if (src.readyState === EventSource.CLOSED) setError("Lost the connection to the desk.");
      setPhase("error");
      src.close();
    });
  }, [market.id, profile.id]);

  startRef.current = start;

  // Re-run whenever the market or the profile changes (that is the scenario 4 moment). Safe under StrictMode's double run.
  useEffect(() => {
    startRef.current();
    return () => es.current?.close();
  }, [market.id, profile.id]);

  return (
    <div className="flex flex-col gap-3">
      <Panel title="Contract under review" action={source && <span className="num text-[11px] text-fg-3">answers: {source === "llm" ? "language model (cached)" : "authored for the demo"}</span>}>
        <div className="flex items-center gap-4 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] text-fg">{market.title}</p>
            <p className="truncate text-[11.5px] text-fg-3">{market.eventTitle} · {market.venue}</p>
          </div>
          <div className="text-right">
            <p className="eyebrow">YES</p>
            <p className="num text-[22px] leading-none text-fg">{cents(market.yesPrice)}</p>
          </div>
          <div className="w-px self-stretch bg-line" />
          <div className="text-right">
            <p className="eyebrow">Viewing as</p>
            <p className="text-[13px] text-fg">
              {profile.name} <span className="text-fg-3">· {profile.tier}</span>
            </p>
            <p className="num text-[11px] text-fg-3">risk budget {usd(profile.riskBudget)} / mo</p>
          </div>
          <Button variant="outline" size="sm" onClick={start} disabled={phase === "streaming"}>
            {phase === "idle" ? <Play /> : <RotateCcw />} {phase === "idle" ? "Ask the desk" : "Ask again"}
          </Button>
        </div>
      </Panel>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-no/40 bg-no/10 px-3 py-2 text-[12px] text-fg">
          <AlertTriangle className="size-4 text-no" /> {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {ORDER.map((pid) => {
          const p = PERSONAS[pid];
          const c = cols[pid];
          return (
            <Panel key={pid} accent={p.accent} className="min-h-[300px]">
              <div className="flex items-center gap-3 border-b border-line px-3 py-3">
                <span className="num grid size-9 place-items-center rounded-lg text-base font-semibold text-bg" style={{ background: p.accent }}>
                  {p.glyph}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{p.label}</p>
                  <p className="truncate text-[11px] text-fg-3">{p.tagline}</p>
                </div>
                <AnimatePresence>{c.stance && <StancePill stance={c.stance} confidence={c.revised ?? c.confidence ?? 0} revised={c.revised != null} />}</AnimatePresence>
              </div>
              <div className="flex flex-col gap-3 p-3">
                <p className="min-h-[88px] text-[13px] leading-relaxed text-fg">
                  {c.text}
                  {!c.done && phase === "streaming" && <span className="caret-blink ml-0.5 inline-block h-[13px] w-[6px] translate-y-0.5 bg-fg-2" />}
                  {!c.text && phase !== "streaming" && <span className="text-fg-3">Waiting for the desk…</span>}
                </p>
                {c.done && c.keyRisk && (
                  <p className="text-[11.5px] leading-snug text-fg-2">
                    <span className="eyebrow mr-1.5">Key risk</span>
                    {c.keyRisk}
                  </p>
                )}
                <AnimatePresence>
                  {c.rebuttal && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-md border border-line bg-bg p-2.5">
                      <p className="eyebrow mb-1 flex items-center gap-1">
                        <Quote className="size-3" /> Rebuttal
                      </p>
                      <p className="text-[12px] leading-snug text-fg-2">{c.rebuttal}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Panel>
          );
        })}
      </div>

      <ConsensusCard consensus={consensus} profile={profile} phase={phase} scenarioId={scenarioId} />
    </div>
  );
}

function StancePill({ stance, confidence, revised }: { stance: Stance; confidence: number; revised: boolean }) {
  const color = stance === "yes" ? "var(--tmb-yes)" : stance === "no" ? "var(--tmb-no)" : "var(--tmb-fg-2)";
  const label = stance === "yes" ? "BUY YES" : stance === "no" ? "BUY NO" : "PASS";
  return (
    <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="num flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] tracking-wider" style={{ color, borderColor: `color-mix(in oklab, ${color} 40%, transparent)`, background: `color-mix(in oklab, ${color} 12%, transparent)` }}>
      {label}
      <span className="opacity-80">{Math.round(confidence * 100)}%</span>
      {revised && <span className="opacity-60" title="revised after rebuttals">↻</span>}
    </motion.span>
  );
}

function ConsensusCard({ consensus, profile, phase, scenarioId }: { consensus: Consensus | null; profile: DeskProfile; phase: string; scenarioId: number | null }) {
  const budget = profile.riskBudget;
  const size = consensus?.sizeUsd ?? 0;
  const pct = budget > 0 ? Math.min(100, (size / budget) * 100) : 0;
  const decision = consensus?.decision ?? null;
  const color = decision === "yes" ? "var(--tmb-yes)" : decision === "no" ? "var(--tmb-no)" : "var(--tmb-anomaly)";
  return (
    <Panel title="Consensus · computed in code, not by a model" accent={decision ? color : undefined}>
      <div className="grid grid-cols-[auto_1fr_300px] items-center gap-6 p-4">
        <div className="min-w-32">
          <p className="eyebrow">Decision</p>
          <AnimatePresence mode="wait">
            <motion.p key={decision ?? "none"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="num text-[30px] leading-none font-medium" style={{ color: decision ? color : "var(--tmb-fg-3)" }}>
              {decision ? (decision === "pass" ? "PASS" : `${decision.toUpperCase()} ${usd(size)}`) : phase === "streaming" || phase === "rebuttals" ? "…" : "—"}
            </motion.p>
          </AnimatePresence>
        </div>
        <div>
          <p className="text-[13px] leading-relaxed text-fg">{consensus ? consensus.summary : "The desk weighs each stance by confidence, sizes with half-Kelly, caps at the risk budget, and the Risk Manager can veto."}</p>
          {consensus?.vetoed && (
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-anomaly">
              <AlertTriangle className="size-3.5" /> Vetoed by the Risk Manager
            </p>
          )}
          {consensus && (
            <p className="num mt-1.5 text-[10.5px] text-fg-3">
              weighted YES {consensus.weightedYes.toFixed(2)} · NO {consensus.weightedNo.toFixed(2)} · kelly {Math.round(consensus.kellyFraction * 100)}%{scenarioId ? ` · scenario ${scenarioId}: switch the profile in the top bar` : ""}
            </p>
          )}
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-[11px]">
            <span className="eyebrow">Position vs risk budget</span>
            <span className="num text-fg-2">
              {usd(size)} <span className="text-fg-3">/ {usd(budget)}</span>
            </span>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-raised">
            <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }} />
          </div>
          <p className={cn("mt-1.5 text-[10.5px]", budget > 0 ? "text-fg-3" : "text-anomaly")}>{budget > 0 ? `5% of ${usd(profile.discretionary)} discretionary × ${profile.riskTolerance}× tolerance` : "No discretionary income: budget is $0"}</p>
        </div>
      </div>
    </Panel>
  );
}
