"use client";

import { useState } from "react";
import { RISK_PROFILES, type RiskAppetite } from "@/lib/desk";
import { cn } from "@/lib/utils";

/** Kalshi's trading fee: 7% × contracts × price × (1 − price), rounded up to the next cent, per order. */
export const kalshiFee = (contracts: number, price: number) => Math.ceil(0.07 * contracts * price * (1 - price) * 100 - 1e-9) / 100;
const money = (x: number) => `$${x.toFixed(2)}`;

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between type-meta text-fg-2">
        <span>{label}</span>
        <span className="num text-fg">{fmt(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1 w-full accent-[var(--tmb-mispricing)]" />
    </label>
  );
}

function Out({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div>
      <dt className="type-small text-fg-3">{k}</dt>
      <dd className={cn("num text-[20px] leading-tight font-medium", strong ? "text-fg" : "text-fg-2")}>{v}</dd>
    </div>
  );
}

function Frame({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-panel p-5">
      <h3 className="type-title text-fg">{title}</h3>
      <p className="mt-0.5 mb-4 type-meta text-fg-2">{note}</p>
      {children}
    </section>
  );
}

export function FeeCalculator({ initialPrice }: { initialPrice?: number }) {
  const [venue, setVenue] = useState<"kalshi" | "polymarket">("kalshi");
  const [price, setPrice] = useState(Math.round((initialPrice ?? 0.5) * 100));
  const [n, setN] = useState(10);
  const p = price / 100;
  const cost = p * n;
  const fee = venue === "kalshi" ? kalshiFee(n, p) : 0;
  const total = cost + fee;
  return (
    <Frame title="Fee calculator" note={initialPrice ? "Prefilled with the live market above. Drag to try other prices." : "Drag to try different prices and sizes."}>
      <div className="mb-4 flex w-fit rounded-md border border-line p-1" role="group" aria-label="Venue">
        {(["kalshi", "polymarket"] as const).map((v) => (
          <button key={v} type="button" aria-pressed={venue === v} onClick={() => setVenue(v)} className={cn("h-8 rounded-sm px-3 font-display text-[14px]", venue === v ? "bg-fg text-bg" : "text-fg-2 hover:text-fg")}>
            {v === "kalshi" ? "Kalshi" : "Polymarket"}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider label="Price you pay" value={price} min={1} max={99} step={1} onChange={setPrice} fmt={(v) => `${v}¢`} />
        <Slider label="Contracts" value={n} min={1} max={500} step={1} onChange={setN} fmt={(v) => String(v)} />
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
        <Out k="Contracts cost" v={money(cost)} />
        <Out k="Fee" v={money(fee)} />
        <Out k="If it wins you get" v={money(n)} />
        <Out k="Breakeven chance" v={`${((total / n) * 100).toFixed(1)}%`} strong />
      </dl>
      <p className="mt-3 type-small text-fg-2">
        {venue === "kalshi" ? "Kalshi: 7% × contracts × price × (1 − price), rounded up to the next cent per order." : "Polymarket: most markets charge no trading fee; some newer markets add a small taker fee."} The spread is a separate cost on top.
      </p>
    </Frame>
  );
}

const KELLY_MULT: Record<RiskAppetite, number> = { conservative: 0.25, moderately_conservative: 0.25, moderate: 0.5, moderately_aggressive: 0.5, aggressive: 0.5 };

export function StakeCalculator() {
  const [mine, setMine] = useState(70);
  const [price, setPrice] = useState(60);
  const [risk, setRisk] = useState<RiskAppetite>("moderate");
  const p = mine / 100;
  const c = price / 100;
  const b = (1 - c) / c;
  const full = Math.max(0, (p * b - (1 - p)) / b);
  const prof = RISK_PROFILES.find((r) => r.id === risk)!;
  const stake = Math.min(prof.cap, full * KELLY_MULT[risk]);
  const edge = p - c;
  return (
    <Frame title="Stake calculator" note="The same maths the Analyst Desk uses: a fraction of Kelly, capped by your risk profile.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider label="Your chance it happens" value={mine} min={1} max={99} step={1} onChange={setMine} fmt={(v) => `${v}%`} />
        <Slider label="Price of YES" value={price} min={1} max={99} step={1} onChange={setPrice} fmt={(v) => `${v}¢`} />
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Risk profile">
        {RISK_PROFILES.map((r) => (
          <button key={r.id} type="button" aria-pressed={risk === r.id} onClick={() => setRisk(r.id)} className={cn("h-8 rounded-full border px-3 font-display text-[13px]", risk === r.id ? "border-fg bg-fg text-bg" : "border-line text-fg-2 hover:text-fg")}>
            {r.label}
          </button>
        ))}
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
        <Out k="Your edge" v={`${edge >= 0 ? "+" : "−"}${Math.abs(Math.round(edge * 100))} pts`} />
        <Out k="Full Kelly" v={`${Math.round(full * 100)}%`} />
        <Out k={`${KELLY_MULT[risk] === 0.25 ? "Quarter" : "Half"}-Kelly, capped at ${Math.round(prof.cap * 100)}%`} v={`${Math.round(stake * 100)}%`} strong />
        <Out k="Verdict" v={full <= 0 ? "No bet" : stake < 0.01 ? "Too thin" : "Stake it"} />
      </dl>
      <p className="mt-3 type-small text-fg-2">Stakes are a share of whatever money you set aside for this, never a dollar amount.</p>
    </Frame>
  );
}

export function LockupCalculator({ initialPrice, initialDays }: { initialPrice?: number; initialDays?: number }) {
  const [price, setPrice] = useState(Math.round((initialPrice ?? 0.95) * 100));
  const [days, setDays] = useState(Math.max(1, Math.min(1500, Math.round(initialDays ?? 365))));
  const ret = 100 / price - 1;
  const perYear = Math.pow(1 + ret, 365 / days) - 1;
  return (
    <Frame title="Lockup calculator" note={initialPrice ? "Prefilled with the long-dated market above, assuming it wins." : "What a winning contract earns per year, depending on how long your money is tied up."}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider label="Price you pay (it wins)" value={price} min={50} max={99} step={1} onChange={setPrice} fmt={(v) => `${v}¢`} />
        <Slider label="Days until it pays" value={days} min={1} max={1500} step={1} onChange={setDays} fmt={(v) => (v >= 365 ? `${(v / 365).toFixed(1)} years` : `${v} days`)} />
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
        <Out k="Return on the trade" v={`${(ret * 100).toFixed(1)}%`} />
        <Out k="Per year" v={`${(perYear * 100).toFixed(perYear < 1 ? 1 : 0)}%`} strong />
      </dl>
      <p className="mt-3 type-small text-fg-2">This is the best case: it assumes the contract wins. Losing even once costs the whole stake.</p>
    </Frame>
  );
}
