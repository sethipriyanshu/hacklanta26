"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play } from "lucide-react";
import { Debate } from "@/components/desk/Debate";
import { VenueMark } from "@/components/scanner/SignalBadge";
import type { Market } from "@/lib/api";
import { RISK_PROFILES, riskProfile, type RiskAppetite, type SideInterest } from "@/lib/desk";
import { cn } from "@/lib/utils";


/** Two questions before the desk runs: how much risk, and which side. The answers shape the analysts' brief and the stake. */
export function DeskIntake({ market }: { market: Market }) {
  const [risk, setRisk] = useState<RiskAppetite | null>(null);
  const [side, setSide] = useState<SideInterest | null>(null);
  const [run, setRun] = useState<{ risk: RiskAppetite; side: SideInterest } | null>(null);
  const yes = Math.round(market.yesPrice * 100);
  const title = market.subtitle && market.subtitle !== market.eventTitle ? `${market.eventTitle} · ${market.subtitle}` : market.title;

  const SIDES: { id: SideInterest; label: string; hint: string }[] = [
    { id: "yes", label: "Buy YES", hint: `Costs ${yes}¢, pays $1 if it happens` },
    { id: "no", label: "Buy NO", hint: `Costs ${100 - yes}¢, pays $1 if it doesn’t` },
    { id: "unsure", label: "Not sure", hint: "Let the desk pick a side" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-panel px-5 py-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-3">
            <VenueMark venue={market.venue} />
            <span className="type-small text-fg-3">{market.category}</span>
          </div>
          <p className="truncate type-title text-fg">{title}</p>
        </div>
        <div className="flex items-center gap-5">
          <p className="num text-[30px] leading-none font-medium text-fg">
            {yes}¢<span className="ml-1.5 text-[14px] font-normal text-fg-2">yes</span>
          </p>
          <Link href={`/scanner/${encodeURIComponent(market.id)}`} className="inline-flex items-center gap-1 type-meta text-fg-2 hover:text-fg">
            <ArrowLeft className="size-4" /> Back to market
          </Link>
        </div>
      </section>

      {run ? (
        <>
          <div className="flex flex-wrap items-center gap-2 type-meta text-fg-2">
            <span className="rounded-sm bg-raised px-2 py-0.5 text-fg">{riskProfile(run.risk).label}</span>
            <span className="rounded-sm bg-raised px-2 py-0.5 text-fg">{SIDES.find((s) => s.id === run.side)?.label}</span>
            <button type="button" onClick={() => setRun(null)} className="ml-1 underline hover:text-fg">
              Change answers
            </button>
          </div>
          <Debate key={`${run.risk}-${run.side}`} market={market} risk={run.risk} side={run.side} />
        </>
      ) : (
        <section aria-labelledby="intake-h" className="rounded-md border border-line bg-panel p-5">
          <h2 id="intake-h" className="type-title text-fg">Two questions before the desk weighs in</h2>
          <p className="mt-0.5 type-meta text-fg-2">Your answers go to all three analysts and set how strict the Risk Manager is and how big a stake it suggests.</p>

          <Question label="1. What’s your risk profile?" cols={5}>
            {RISK_PROFILES.map((r) => (
              <Choice key={r.id} active={risk === r.id} onClick={() => setRisk(r.id)} label={r.label} hint={`${r.hint} Stake capped at ${Math.round(r.cap * 100)}%.`} />
            ))}
          </Question>

          <Question label="2. What are you looking to buy?">
            {SIDES.map((s) => (
              <Choice key={s.id} active={side === s.id} onClick={() => setSide(s.id)} label={s.label} hint={s.hint} tone={s.id} />
            ))}
          </Question>

          <button
            type="button"
            disabled={!risk || !side}
            onClick={() => risk && side && setRun({ risk, side })}
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-md bg-fg px-4 font-display text-[15px] font-medium text-bg transition-colors hover:bg-fg/85 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="size-4" /> Run the analysis
          </button>
        </section>
      )}
    </div>
  );
}

function Question({ label, children, cols = 3 }: { label: string; children: React.ReactNode; cols?: 3 | 5 }) {
  return (
    <fieldset className="mt-5">
      <legend className="mb-2 font-display text-[15px] font-medium text-fg">{label}</legend>
      <div className={cn("grid gap-2", cols === 5 ? "sm:grid-cols-2 lg:grid-cols-5" : "sm:grid-cols-3")}>{children}</div>
    </fieldset>
  );
}

function Choice({ active, onClick, label, hint, tone }: { active: boolean; onClick: () => void; label: string; hint: string; tone?: SideInterest }) {
  const accent = tone === "yes" ? "var(--tmb-yes)" : tone === "no" ? "var(--tmb-no)" : "var(--tmb-mispricing)";
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn("flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors", active ? "bg-raised" : "border-line hover:border-fg-3 hover:bg-raised/60")}
      style={active ? { borderColor: accent, boxShadow: `inset 0 0 0 1px ${accent}` } : undefined}
    >
      <span className="font-display text-[16px] font-medium text-fg">{label}</span>
      <span className="type-small text-fg-2">{hint}</span>
    </button>
  );
}
