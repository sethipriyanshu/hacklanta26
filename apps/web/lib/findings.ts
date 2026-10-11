/** Turns raw signals into findings a judge can read: a plain sentence and the quantities worth counting.
 *  Every number here comes straight from a signal's details; nothing is estimated for display. */
import type { Market, Signal } from "@/lib/api";
import { usd } from "@/lib/format";

/** The most dots one row may draw before the row switches to a coarser unit (stated in the key). */
export const MAX_DOTS = 480;

export interface Exhibit {
  /** What the row is, in words ("A normal hour", "The last hour"). */
  label: string;
  /** How many units the row counts, possibly fractional. */
  count: number;
  /** What one dot stands for, when it isn't obvious from the label. */
  tone: "base" | "unusual" | "yes" | "no" | "venue2";
  /** The figure printed after the row, already formatted. */
  figure: string;
}

export interface Finding {
  marketId: string;
  kind: "anomaly" | "gap" | "inconsistency";
  score: number;
  /** The event, e.g. "Indiana vs Nebraska". */
  event: string;
  /** The outcome being priced, e.g. "Indiana wins", or null when it repeats the event. */
  outcome: string | null;
  venue: string;
  yesPrice: number;
  /** One-line verdict used as the finding's heading. */
  headline: string;
  /** The plain sentence under the counts. */
  sentence: string;
  /** What it does and doesn't mean. */
  caveat: string;
  /** Rows of counted dots, read top to bottom. */
  rows: Exhibit[];
  /** One dot equals this many units in `rows` (1 unless a row would overflow). */
  unit: number;
  unitLabel: string;
  /** Present on gaps: both venues' YES prices. */
  venues?: { kalshi: number; poly: number; costCents: number; edgeCents: number };
  detectedAt: string;
  others: Signal[];
}

const d = (s: Signal) => (s.details ?? {}) as Record<string, number | string | string[] | boolean | null | undefined>;
const num = (v: unknown, fb = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fb);
const pts = (x: number) => `${(Math.abs(x) * 100).toFixed(Math.abs(x) * 100 < 1 ? 1 : 0)}`;

export function marketName(m: Pick<Market, "title" | "eventTitle" | "subtitle">): { event: string; outcome: string | null } {
  const event = m.eventTitle || m.title;
  const outcome = m.title && m.title !== event ? m.title : m.subtitle && m.subtitle !== event ? m.subtitle : null;
  return { event, outcome };
}

const KIND_RANK: Record<string, number> = { anomaly: 0, gap: 1, inconsistency: 2 };

export function buildFinding(m: Market, sigs: Signal[]): Finding | null {
  const ordered = [...sigs].sort((a, b) => b.score - a.score || KIND_RANK[a.type] - KIND_RANK[b.type]);
  const s = ordered[0];
  if (!s) return null;
  const { event, outcome } = marketName(m);
  const base = { marketId: m.id, score: s.score, event, outcome, venue: m.venue, yesPrice: m.yesPrice, detectedAt: s.detectedAt, others: ordered.slice(1) };

  if (s.type === "anomaly" && typeof d(s).gapHours === "number" && !num(d(s).volumeMultiple)) {
    // News-timing anomaly: the evidence is when the price moved relative to the first matching headline.
    const lead = num(d(s).gapHours);
    return {
      ...base,
      kind: "anomaly",
      headline: `Moved ${lead.toFixed(1)} hours before the news`,
      sentence: s.explanation,
      caveat: "A move ahead of the headline is worth checking against public information that came out earlier. It is not proof that anyone traded on inside knowledge.",
      rows: [],
      unit: 1,
      unitLabel: "",
    };
  }

  if (s.type === "anomaly") {
    const x = d(s);
    const multiple = num(x.volumeMultiple);
    const lastVol = num(x.lastHourVolume);
    const baseVol = num(x.baselineHourlyVolume);
    const move = num(x.lastHourMove);
    const typical = num(x.typicalHourlyMove);
    // Volume-led flags compare dollars traded; move-led ones (or venues without hourly volume) compare the moves.
    const byMove = multiple < 2;
    const ratio = byMove ? Math.abs(move) / Math.max(typical, 0.001) : multiple;
    const unit = ratio > MAX_DOTS ? Math.ceil(ratio / MAX_DOTS / 5) * 5 : 1;
    const dir = move < 0 ? "fell" : "rose";
    const rows: Exhibit[] = byMove
      ? [
          { label: "A normal hour", count: 1 / unit, tone: "base", figure: `${pts(typical)} pts` },
          { label: "The last hour", count: ratio / unit, tone: "unusual", figure: `${pts(move)} pts` },
        ]
      : [
          { label: "A normal hour", count: 1 / unit, tone: "base", figure: usd(baseVol) },
          { label: "The last hour", count: multiple / unit, tone: "unusual", figure: usd(lastVol) },
        ];
    return {
      ...base,
      kind: "anomaly",
      headline: multiple >= 2 ? `${Math.round(multiple).toLocaleString()}× its normal trading in one hour` : "Price moved far more than usual in one hour",
      sentence:
        (multiple >= 2 ? `${usd(lastVol)} changed hands in the last hour, against about ${usd(baseVol)} in a normal hour. ` : "") +
        (Math.abs(move) * 100 < 0.5 ? "The price barely moved." : `The price ${dir} ${pts(move)} points; a normal hour moves it ${pts(typical)}.`),
      caveat: "An anomaly is not proof of anything. Breaking news or one large trader can do this. Check the timing against the news.",
      rows,
      unit,
      unitLabel: byMove ? (unit === 1 ? "one normal hour's move" : `${unit} normal hours' moves`) : unit === 1 ? "one normal hour of trading" : `${unit} normal hours of trading`,
    };
  }

  if (s.type === "gap") {
    const x = d(s);
    const k = num(x.kalshiPrice, m.yesPrice);
    const p = num(x.polyPrice, m.yesPrice);
    const sub = (s.subScores ?? {}) as Record<string, number | null>;
    const gapC = num(sub.gapCents, Math.abs(k - p) * 100);
    const costC = num(sub.thresholdCents);
    const edgeC = num(sub.edgeCents, Math.max(0, gapC - costC));
    const cheaper = k < p ? "Kalshi" : "Polymarket";
    return {
      ...base,
      kind: "gap",
      headline: `Priced ${gapC.toFixed(0)}¢ apart on the two venues`,
      sentence: `Kalshi says ${Math.round(k * 100)} in 100; Polymarket says ${Math.round(p * 100)} in 100 for the same outcome. Trading costs eat about ${costC.toFixed(0)}¢ of that, leaving roughly ${edgeC.toFixed(0)}¢ for someone buying on ${cheaper}.`,
      caveat: "Gaps close fast and the two venues' rules can differ in small print. Read both rulebooks before treating it as free money.",
      rows: [],
      unit: 1,
      unitLabel: "one cent of a $1 contract",
      venues: { kalshi: k, poly: p, costCents: costC, edgeCents: edgeC },
    };
  }

  const sub = (s.subScores ?? {}) as Record<string, number | null>;
  const over = d(s).side === "over";
  const setCents = num(over ? sub.bidSumCents : sub.askSumCents, 100);
  return {
    ...base,
    kind: "inconsistency",
    headline: over ? `YES bids add up to ${setCents.toFixed(0)}¢ for a $1 payout` : `A full set of YES costs ${setCents.toFixed(0)}¢ and pays $1`,
    sentence: s.explanation,
    caveat: over
      ? "Exactly one outcome pays, so buying every NO wins on all but one. Quotes can be small, so check the depth before counting the edge."
      : "This only pays if one of the listed outcomes must win. Check the rules for an “other” outcome before trusting it.",
    rows: [
      { label: "A full set pays", count: 100, tone: "base", figure: "$1.00" },
      { label: over ? "YES bids add to" : "YES asks add to", count: setCents, tone: "unusual", figure: `$${(setCents / 100).toFixed(2)}` },
    ],
    unit: 1,
    unitLabel: "one cent",
  };
}

/** Group signals by market and build at most `limit` findings, strongest first. */
export function buildFindings(signals: Signal[], markets: Map<string, Market>, limit = 5): Finding[] {
  const byMarket = new Map<string, Signal[]>();
  for (const s of signals) byMarket.set(s.marketId, [...(byMarket.get(s.marketId) ?? []), s]);
  const out: Finding[] = [];
  for (const [id, sigs] of byMarket) {
    const m = markets.get(id);
    if (!m) continue;
    const f = buildFinding(m, sigs);
    if (f) out.push(f);
  }
  out.sort((a, b) => b.score - a.score || KIND_RANK[a.kind] - KIND_RANK[b.kind]);
  return out.slice(0, limit);
}
