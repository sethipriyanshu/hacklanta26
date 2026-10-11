"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import { PERSONAS, debateStreamUrl, riskProfile, type Consensus, type PersonaId, type RiskAppetite, type SideInterest, type Stance } from "@/lib/desk";
import type { Market } from "@/lib/api";
import { Avatar, DebateChat, stanceColor, stanceLabel, type Reply } from "@/components/desk/DebateChat";
import { cn } from "@/lib/utils";
import { Term } from "@/components/shell/Term";

interface Col {
  stance?: Stance;
  confidence?: number;
  keyRisk?: string;
  text: string;
  done: boolean;
  revised?: number;
  revisedStance?: Stance;
}

const EMPTY: Record<PersonaId, Col> = { quant: { text: "", done: false }, contrarian: { text: "", done: false }, riskmgr: { text: "", done: false } };
const ORDER: PersonaId[] = ["quant", "contrarian", "riskmgr"];

export function Debate({ market, risk, side }: { market: Market; risk: RiskAppetite; side: SideInterest }) {
  const [cols, setCols] = useState<Record<PersonaId, Col>>(EMPTY);
  const [consensus, setConsensus] = useState<Consensus | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "streaming" | "rebuttals" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<Reply[]>([]);
  const [typing, setTyping] = useState<PersonaId | null>(null);
  const es = useRef<EventSource | null>(null);
  const startRef = useRef<() => void>(() => {});

  const start = useCallback(() => {
    es.current?.close();
    setCols({ quant: { text: "", done: false }, contrarian: { text: "", done: false }, riskmgr: { text: "", done: false } });
    setConsensus(null);
    setThread([]);
    setTyping(null);
    setSource(null);
    setError(null);
    setPhase("streaming");
    const src = new EventSource(debateStreamUrl(market.id, risk, side));
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
    src.addEventListener("typing", (e) => setTyping((JSON.parse((e as MessageEvent).data) as { persona: PersonaId }).persona));
    src.addEventListener("rebuttal", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as Reply & { persona: PersonaId };
      setTyping(null);
      setThread((t) => [...t, d]);
      setCols((c) => ({ ...c, [d.persona]: { ...c[d.persona], revised: d.revisedConfidence ?? undefined, revisedStance: d.revisedStance ?? undefined } }));
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
  }, [market.id, risk, side]);

  startRef.current = start;

  // Run once per market. Safe under StrictMode's double run.
  useEffect(() => {
    startRef.current();
    return () => es.current?.close();
  }, [market.id]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="type-small text-fg-3">{source ? `Answers: ${source === "llm" ? "language model (saved after the first run)" : "written for the demo"}` : "Asking the desk…"}</p>
        <Button variant="outline" size="sm" onClick={start} disabled={phase === "streaming"}>
          <RotateCcw /> Ask again
        </Button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-md border border-line bg-panel px-4 py-3 type-body text-fg">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-anomaly" />
          {/no API key/i.test(error)
            ? "The analysts can’t run here: no AI provider key is configured on the server."
            : /spend cap/i.test(error)
              ? "The desk has used today’s AI budget. Markets it has already analysed still work; new ones resume tomorrow (UTC)."
              : error}
        </div>
      )}

      <h2 className="mt-2 type-title text-fg">Opening takes</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {ORDER.map((pid) => {
          const p = PERSONAS[pid];
          const c = cols[pid];
          return (
            <Panel key={pid} accent={p.accent} className="min-h-[300px]">
              <div className="flex items-center gap-3 border-b border-line px-3 py-3">
                <span className="num grid size-9 place-items-center rounded-md text-base font-semibold text-bg" style={{ background: p.accent }}>
                  {p.glyph}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{p.label}</p>
                  <p className="truncate type-small text-fg-3">{p.tagline}</p>
                </div>
                <AnimatePresence>{c.stance && <StancePill stance={c.stance} confidence={c.confidence ?? 0} />}</AnimatePresence>
              </div>
              <div className="flex flex-col gap-3 p-3">
                <p className="min-h-[88px] type-body leading-relaxed text-fg">
                  {c.text}
                  {!c.done && phase === "streaming" && <span className="caret-blink ml-0.5 inline-block h-[13px] w-[6px] translate-y-0.5 bg-fg-2" />}
                  {!c.text && phase !== "streaming" && <span className="text-fg-3">Waiting for the desk…</span>}
                </p>
                {c.done && c.keyRisk && (
                  <p className="type-small leading-snug text-fg-2">
                    <span className="eyebrow mr-1.5">Key risk</span>
                    {c.keyRisk}
                  </p>
                )}
              </div>
            </Panel>
          );
        })}
      </div>

      <DebateChat thread={thread} typing={typing} openings={cols} finished={phase === "done"} />
      {phase === "done" && thread.length > 0 && <WhereTheyLanded cols={cols} />}

      <ConsensusCard consensus={consensus} phase={phase} risk={risk} />
    </div>
  );
}

function StancePill({ stance, confidence }: { stance: Stance; confidence: number }) {
  const color = stanceColor(stance);
  return (
    <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="num flex items-center gap-1.5 rounded-full border px-2 py-0.5 type-small" style={{ color, borderColor: `color-mix(in oklab, ${color} 40%, transparent)`, background: `color-mix(in oklab, ${color} 12%, transparent)` }}>
      {stanceLabel(stance)}
      <span className="opacity-80">{Math.round(confidence * 100)}%</span>
    </motion.span>
  );
}

/** Before and after round two, per analyst, so the verdict visibly follows from the conversation. */
function WhereTheyLanded({ cols }: { cols: Record<PersonaId, Col> }) {
  return (
    <section aria-labelledby="landed-h" className="rounded-md border border-line bg-panel px-4 py-3">
      <h2 id="landed-h" className="eyebrow mb-2 text-fg">Where they landed</h2>
      <ul className="grid gap-x-6 gap-y-2 md:grid-cols-3">
        {ORDER.map((pid) => {
          const c = cols[pid];
          if (!c.stance) return null;
          const after = c.revisedStance ?? c.stance;
          const changed = after !== c.stance;
          const conf0 = Math.round((c.confidence ?? 0) * 100);
          const conf1 = Math.round((c.revised ?? c.confidence ?? 0) * 100);
          return (
            <li key={pid} className="flex items-center gap-2.5">
              <Avatar pid={pid} size={24} />
              <span className="min-w-0 type-meta text-fg-2">
                <span className="text-fg">{PERSONAS[pid].label.replace(/^The /, "")}</span>{" "}
                <span style={{ color: stanceColor(c.stance) }}>{stanceLabel(c.stance)}</span>
                <span className="num"> {conf0}%</span>
                <span className="mx-1 text-fg-3">→</span>
                <span className={cn(changed && "font-medium")} style={{ color: stanceColor(after) }}>
                  {stanceLabel(after)}
                </span>
                <span className="num"> {conf1}%</span>
                {changed && <span className="ml-1.5 rounded-sm bg-raised px-1 type-small text-fg">changed mind</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}


function ConsensusCard({ consensus, phase, risk }: { consensus: Consensus | null; phase: string; risk: RiskAppetite }) {
  const stake = consensus?.kellyFraction ?? 0;
  const profile = riskProfile(risk);
  const cap = profile.cap;
  const decision = consensus?.decision ?? null;
  const color = decision === "yes" ? "var(--tmb-yes)" : decision === "no" ? "var(--tmb-no)" : "var(--tmb-anomaly)";
  return (
    <Panel title="Consensus · computed in code, not by a model" accent={decision ? color : undefined}>
      <div className="grid items-center gap-6 p-4 md:grid-cols-[auto_1fr_260px]">
        <div className="min-w-32">
          <p className="eyebrow">Decision</p>
          <AnimatePresence mode="wait">
            <motion.p key={decision ?? "none"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="num text-[30px] leading-none font-medium" style={{ color: decision ? color : "var(--tmb-fg-3)" }}>
              {decision ? (decision === "pass" ? "Stay out" : `Buy ${decision}`) : phase === "streaming" || phase === "rebuttals" ? "…" : "—"}
            </motion.p>
          </AnimatePresence>
        </div>
        <div>
          <p className="type-body leading-relaxed text-fg">{consensus ? consensus.summary : "The desk weighs each stance by confidence, sizes the stake with half-Kelly, and the Risk Manager can veto."}</p>
          {consensus?.vetoed && (
            <p className="mt-1 flex items-center gap-1.5 type-meta text-anomaly">
              <AlertTriangle className="size-3.5" /> Vetoed by the Risk Manager
            </p>
          )}
          {consensus && (
            <p className="num mt-1.5 type-small text-fg-3">
              weighted YES {consensus.weightedYes.toFixed(2)} · NO {consensus.weightedNo.toFixed(2)}
              {consensus.belief > 0 ? ` · desk belief ${Math.round(consensus.belief * 100)}%` : ""}
            </p>
          )}
        </div>
        <div>
          <div className="mb-1.5 flex justify-between type-small">
            <span className="eyebrow"><Term term="stake">Suggested stake</Term></span>
            <span className="num text-fg-2">{Math.round(stake * 100)}%</span>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-raised">
            <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${Math.min(100, (stake / cap) * 100)}%` }} transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }} />
          </div>
          <p className="mt-1.5 type-small text-fg-3">Share of whatever you set aside for this. The bar runs to the {Math.round(cap * 100)}% cap for a {profile.label.toLowerCase()} profile.</p>
        </div>
      </div>
    </Panel>
  );
}
