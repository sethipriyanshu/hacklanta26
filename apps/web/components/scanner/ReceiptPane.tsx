"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, MessagesSquare, Orbit } from "lucide-react";
import { ReceiptChart } from "@/components/scanner/ReceiptChart";
import { SIGNAL_META, VenueMark } from "@/components/scanner/SignalBadge";
import {
  getHistory,
  getMarketSignals,
  getTimeline,
  type MarketRow,
  type Signal,
  type SignalType,
} from "@/lib/api";
import { usd } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PairReceipt {
  id: string;
  title: string;
  kalshiId: string;
  polyIds: string[];
  match: string;
  checkedBy: string | null;
  reason?: string | null;
  kalshiPrice: number;
  polyPrice: number;
  gap: number;
  threshold: number;
  edgeCents: number;
  flagged: boolean;
  thin: boolean;
  explanation: string;
}

/** Why a pair is or isn't an edge, in a few words. */
export function edgeReason(p: PairReceipt): string {
  if (p.flagged) return `edge +${p.edgeCents.toFixed(1)}¢ after costs`;
  if (p.checkedBy === "auto") return "not an edge: match unverified";
  if (p.thin) return "not an edge: one side barely trades";
  return "inside spreads + fees";
}

export type Selection =
  { kind: "market"; row: MarketRow } | { kind: "pair"; pair: PairReceipt };

interface MarketEvidence {
  failed: boolean;
  signals: Signal[];
  points: { ts: number; price: number }[];
  timeline: { ts: number; score: number }[];
}

const cache = new Map<string, Promise<MarketEvidence>>();
function loadEvidence(id: string): Promise<MarketEvidence> {
  let p = cache.get(id);
  if (!p) {
    p = Promise.all([
      getMarketSignals(id),
      getHistory(id, "1h"),
      getTimeline(id, "1h"),
    ]).then(([s, h, t]) => ({
      signals: (s ?? []).filter((x) => !("scenario" in (x.details ?? {}))),
      points: (h?.points ?? [])
        .slice(-72)
        .map((pt) => ({ ts: pt.ts, price: pt.price })),
      timeline: t ?? [],
      failed: s === null && h === null,
    }));
    cache.set(id, p);
    p.then((e) => e.failed && cache.delete(id));
  }
  return p;
}

/** Start of the most recent run of hours scoring 40+, i.e. when the current flag fired. */
function onsetFrom(timeline: { ts: number; score: number }[]): number | null {
  let i = timeline.length - 1;
  while (i >= 0 && timeline[i].score < 40) i--;
  if (i < 0) return null;
  while (i > 0 && timeline[i - 1].score >= 40) i--;
  return timeline[i].ts;
}

/** Start of the latest stretch where the venues sat further apart than spreads + fees, from both histories. */
function gapOnset(
  a: { ts: number; price: number }[],
  b: { ts: number; price: number }[],
  thresholdCents: number,
): number | null {
  if (a.length < 2 || b.length < 2) return null;
  const at = (ts: number) =>
    b.reduce((best, p) =>
      Math.abs(p.ts - ts) < Math.abs(best.ts - ts) ? p : best,
    );
  const over = a.map((p) => {
    const q = at(p.ts);
    return (
      Math.abs(q.ts - p.ts) <= 3600 &&
      Math.abs(p.price - q.price) * 100 > thresholdCents
    );
  });
  let i = over.length - 1;
  if (!over[i]) return null;
  while (i > 0 && over[i - 1]) i--;
  return a[i].ts;
}

type Stat = { label: string; value: string; strong?: boolean };

/** Three numbers that carry the flag, read left to right. */
function Stats({ items }: { items: Stat[] }) {
  return (
    <dl className="grid auto-cols-fr grid-flow-col gap-x-4 border-y border-line py-3">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="truncate type-small text-fg-2">{it.label}</dt>
          <dd className={cn("num truncate text-[20px] leading-tight font-medium", it.strong ? "text-anomaly" : "text-fg")}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function statsFor(sig: Signal, row: MarketRow): Stat[] {
  const d = (sig.details ?? {}) as Record<string, unknown>;
  const sub = (sig.subScores ?? {}) as Record<string, number | null>;
  if (sig.type === "anomaly") {
    const mult = num(d.volumeMultiple);
    const move = num(d.lastHourMove);
    const typ = num(d.typicalHourlyMove);
    const lead = num(d.gapHours);
    const wallets = num(sub.cWallet);
    const evidence: Stat[] = [
      ...(mult != null ? [{ label: "Volume vs normal", value: `${Math.round(mult).toLocaleString()}×` }] : []),
      ...(move != null ? [{ label: "Move vs normal", value: `${Math.round(Math.abs(move) * 100)} vs ${typ != null ? (typ * 100).toFixed(1) : "—"} pts` }] : []),
      ...(lead != null ? [{ label: "Moved before news", value: `${lead.toFixed(1)}h` }] : []),
      ...(wallets != null ? [{ label: "Fresh wallets", value: `${Math.round(wallets * 100)}%` }] : []),
    ];
    return [{ label: "Score", value: `${Math.round(Math.min(100, sig.score))}/100`, strong: true }, ...evidence.slice(0, 2)];
  }
  if (sig.type === "gap") {
    const k = num(d.kalshiPrice) ?? row.yesPrice;
    const p = num(d.polyPrice) ?? row.yesPrice;
    return [
      { label: "Kalshi", value: `${Math.round(k * 100)}¢` },
      { label: "Polymarket", value: `${Math.round(p * 100)}¢` },
      { label: "Left after costs", value: `${(sub.edgeCents ?? 0).toFixed(1)}¢`, strong: true },
    ];
  }
  if (sig.type === "inconsistency") {
    const over = d.side === "over";
    return [
      { label: over ? "YES bids add to" : "YES asks add to", value: `${((over ? sub.bidSumCents : sub.askSumCents) ?? 0).toFixed(1)}¢` },
      { label: "Outcomes", value: String((d.outcomes as number) ?? "—") },
      { label: "Edge per set", value: `${(sub.edgeCents ?? 0).toFixed(1)}¢`, strong: true },
    ];
  }
  return [{ label: "Score", value: `${Math.round(sig.score)}/100`, strong: true }];
}

function Actions({ id }: { id: string }) {
  const btn = "inline-flex h-9 items-center gap-1.5 rounded-md px-3 font-display text-[14px] font-medium transition-colors";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/scanner/${encodeURIComponent(id)}`} className={cn(btn, "bg-fg text-bg hover:bg-fg/85")}>
        Open market <ArrowUpRight className="size-4" />
      </Link>
      <Link href={`/desk?market=${encodeURIComponent(id)}`} className={cn(btn, "border border-line text-fg hover:border-fg-3 hover:bg-raised")}>
        <MessagesSquare className="size-4" /> Analysts
      </Link>
      <Link href={`/sim?market=${encodeURIComponent(id)}`} className={cn(btn, "border border-line text-fg hover:border-fg-3 hover:bg-raised")}>
        <Orbit className="size-4" /> Simulate
      </Link>
    </div>
  );
}

function Header({ venue, category, title, line }: { venue: "kalshi" | "polymarket"; category?: string; title: string; line: string }) {
  return (
    <header>
      <div className="mb-1.5 flex items-center gap-3">
        <VenueMark venue={venue} />
        {category && <span className="type-small text-fg-2">{category}</span>}
      </div>
      <h2 className="line-clamp-2 type-title text-fg">{title}</h2>
      <p className="num mt-0.5 type-meta text-fg-2">{line}</p>
    </header>
  );
}

function MarketReceipt({ row }: { row: MarketRow }) {
  const [ev, setEv] = useState<MarketEvidence | null>(null);
  const [which, setWhich] = useState<SignalType | null>(null);

  useEffect(() => {
    let alive = true;
    loadEvidence(row.id).then((e) => alive && setEv(e));
    return () => {
      alive = false;
    };
  }, [row.id]);

  const flagged = (ev?.signals ?? []).filter((s) => s.score >= 40);
  const active = flagged.find((s) => s.type === which) ?? flagged[0] ?? null;
  const fallbackFlag = row.flags[0] ?? null;
  const type = active?.type ?? fallbackFlag?.type ?? null;
  const meta = type ? SIGNAL_META[type] : null;
  // Anomalies pin where the run of 40+ hours began; gaps pin where the venues last moved apart by more than costs.
  const anomalyOnset = active?.type === "anomaly" ? (onsetFrom(ev?.timeline ?? []) ?? (active.details as { asOf?: number }).asOf ?? null) : null;
  const gap = active?.type === "gap" ? (active.details as { kalshiId?: string; polyIds?: string[]; match?: string; checkedBy?: string; kalshiPrice?: number; polyPrice?: number }) : null;
  const otherId = gap ? (row.venue === "kalshi" ? gap.polyIds?.[0] : gap.kalshiId) : undefined;
  const [compare, setCompare] = useState<{ id: string; points: { ts: number; price: number }[] } | null>(null);
  useEffect(() => {
    if (!otherId) return;
    let alive = true;
    getHistory(otherId, "1h").then((h) => alive && setCompare({ id: otherId, points: (h?.points ?? []).slice(-72).map((pt) => ({ ts: pt.ts, price: pt.price })) }));
    return () => {
      alive = false;
    };
  }, [otherId]);
  const comparePts = compare && compare.id === otherId ? compare.points : undefined;
  const ownPts = ev?.points ?? [];
  const thresholdCents = active?.type === "gap" ? (((active.subScores ?? {}) as Record<string, number | null>).thresholdCents ?? null) : null;
  const onset = anomalyOnset ?? (comparePts && thresholdCents != null && ev ? gapOnset(ownPts, comparePts, thresholdCents) : null);
  const sentence = active?.explanation ?? (fallbackFlag as { explanation?: string } | null)?.explanation ?? null;
  const title = row.subtitle && row.subtitle !== row.eventTitle ? `${row.eventTitle} · ${row.subtitle}` : row.title;

  return (
    <div className="flex flex-col gap-4">
      <Header venue={row.venue} category={row.category} title={title} line={`${Math.round(row.yesPrice * 100)}¢ yes · ${usd(row.volume24h)} volume 24h`} />

      {meta ? (
        <div className="flex flex-wrap items-center gap-1.5" role={flagged.length > 1 ? "tablist" : undefined} aria-label="Flags on this market">
          {(flagged.length ? flagged : [{ type: type! } as Signal]).map((s) => (
            <button
              key={s.type}
              type="button"
              role={flagged.length > 1 ? "tab" : undefined}
              aria-selected={flagged.length > 1 ? s === active : undefined}
              onClick={() => setWhich(s.type)}
              disabled={flagged.length < 2}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 font-display text-[14px] font-medium transition-colors disabled:cursor-default",
                s === active || flagged.length < 2 ? "border-fg bg-fg text-bg" : "border-line text-fg-2 hover:text-fg",
              )}
            >
              <span aria-hidden className="size-2 rounded-full bg-anomaly" />
              {SIGNAL_META[s.type].label}
            </button>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 type-meta text-fg-2">
          <span className="size-2 rounded-full bg-fg-3" /> Not flagged
        </p>
      )}

      {active && <Stats items={statsFor(active, row)} />}

      {ev?.failed ? (
        <p role="alert" className="type-meta text-no">Couldn’t load this market’s history. Check the data service, then select the row again.</p>
      ) : ev ? (
        <ReceiptChart
          points={ownPts}
          onset={onset}
          color="var(--tmb-anomaly)"
          compare={comparePts}
          pinLabel={active?.type === "gap" ? "apart since" : "flagged"}
          height={112}
          labels={row.venue === "kalshi" ? ["Kalshi", "Polymarket"] : ["Polymarket", "Kalshi"]}
        />
      ) : (
        <div className="h-[112px] animate-pulse rounded-sm bg-raised/60" />
      )}

      <p className="line-clamp-4 type-body text-fg">
        {sentence ?? (meta ? "Loading the evidence…" : "Nothing scores 40 or more here: trading, the other venue’s price and the outcome sum all look ordinary.")}
      </p>

      <Actions id={row.id} />
    </div>
  );
}

function PairReceiptView({ pair }: { pair: PairReceipt }) {
  return (
    <div className="flex flex-col gap-4">
      <Header venue="kalshi" title={pair.title} line={`Kalshi ${Math.round(pair.kalshiPrice * 100)}¢ · Polymarket ${Math.round(pair.polyPrice * 100)}¢`} />
      <p className="flex items-center gap-2 font-display text-[15px] font-medium text-fg">
        <span aria-hidden className="size-2.5 rounded-full" style={{ background: pair.flagged ? "var(--tmb-anomaly)" : "var(--tmb-fg-3)" }} />
        {pair.flagged ? "Cross-venue gap beyond costs" : edgeReason(pair)}
      </p>
      <Stats
        items={[
          { label: "Gap", value: `${(pair.gap * 100).toFixed(1)}¢` },
          { label: "Costs", value: `${(pair.threshold * 100).toFixed(1)}¢` },
          { label: "Left after costs", value: pair.flagged ? `${pair.edgeCents.toFixed(1)}¢` : "none", strong: pair.flagged },
        ]}
      />
      <p className="line-clamp-4 type-body text-fg">{pair.explanation}</p>
      <Actions id={pair.kalshiId} />
    </div>
  );
}

export function ReceiptPane({ selection }: { selection: Selection | null }) {
  return (
    <aside aria-label="Selected market" className="rounded-md border border-line bg-panel p-5">
      {!selection ? (
        <p className="py-16 text-center type-body text-fg-2">Pick a market to see why it was flagged.</p>
      ) : selection.kind === "market" ? (
        <MarketReceipt key={selection.row.id} row={selection.row} />
      ) : (
        <PairReceiptView key={selection.pair.id} pair={selection.pair} />
      )}
    </aside>
  );
}
