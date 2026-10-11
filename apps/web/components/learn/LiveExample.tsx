import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { VenueMark } from "@/components/scanner/SignalBadge";
import type { LiveExample as Ex, LiveKind } from "@/lib/learn";
import { usd } from "@/lib/format";

const c = (p?: number | null) => (p == null ? "—" : `${Math.round(p * 100)}¢`);
const c1 = (p?: number | null) => (p == null ? "—" : `${(p * 100).toFixed(1)}¢`);

/** One real, current market that shows the module's idea, rendered for that idea. */
export function LiveExample({ kind, ex }: { kind: LiveKind; ex: Ex | null }) {
  if (!ex) {
    return (
      <section className="rounded-md border border-dashed border-line px-5 py-4 type-meta text-fg-2">
        No current market shows this clearly right now. Check back after the next refresh.
      </section>
    );
  }
  const name = ex.subtitle && ex.subtitle !== ex.eventTitle ? `${ex.eventTitle} · ${ex.subtitle}` : ex.title && ex.title !== ex.eventTitle ? `${ex.eventTitle} · ${ex.title}` : ex.eventTitle;
  return (
    <section aria-labelledby="live-h" className="rounded-md border border-line bg-panel p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id="live-h" className="flex items-center gap-2 type-title text-fg">
          <span aria-hidden className="pulse-dot size-2 rounded-full bg-yes text-yes" /> Live example
        </h3>
        {ex.marketId && (
          <Link href={`/scanner/${encodeURIComponent(ex.marketId)}`} className="inline-flex items-center gap-1 type-meta text-fg-2 hover:text-fg">
            Open market <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </div>
      <div className="mb-3 flex items-center gap-3">
        <VenueMark venue={ex.venue} />
        <p className="min-w-0 truncate type-body font-medium text-fg">{name}</p>
      </div>
      <Body kind={kind} ex={ex} />
    </section>
  );
}

function Row({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="type-small text-fg-3">{k}</dt>
          <dd className="num text-[20px] leading-tight font-medium text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function BookSide({ rows, color, label, max }: { rows: { price: number; size: number }[]; color: string; label: string; max: number }) {
  return (
    <div>
      <p className="mb-1.5 type-small text-fg-3">{label}</p>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.price} className="grid grid-cols-[52px_1fr_72px] items-center gap-2 type-meta">
            <span className="num text-fg">{c1(r.price)}</span>
            <span className="h-2.5 rounded-[3px]" style={{ width: `${Math.max(3, (r.size / max) * 100)}%`, background: color, opacity: 0.8 }} />
            <span className="num text-right text-fg-2">{Math.round(r.size).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Body({ kind, ex }: { kind: LiveKind; ex: Ex }) {
  switch (kind) {
    case "liquid":
      return (
        <>
          <Row items={[["Yes price", c(ex.yesPrice)], ["Market's chance", `${Math.round((ex.yesPrice ?? 0) * 100)}%`], ["Bid / ask", `${c(ex.bid)} / ${c(ex.ask)}`], ["Traded today", usd(ex.volume24h ?? 0)]]} />
          <p className="mt-3 type-meta text-fg-2">The price is the crowd&apos;s probability: {c(ex.yesPrice)} reads as about a {Math.round((ex.yesPrice ?? 0) * 100)}% chance. The bid and ask around it show how sure you can be of that number.</p>
        </>
      );
    case "spread": {
      const spread = (ex.ask ?? 0) - (ex.bid ?? 0);
      return (
        <>
          <Row items={[["Best bid", c(ex.bid)], ["Best ask", c(ex.ask)], ["Spread", c1(spread)], ["Round trip costs", ex.ask ? `${((spread / ex.ask) * 100).toFixed(1)}%` : "—"]]} />
          <p className="mt-3 type-meta text-fg-2">Buy at {c(ex.ask)} and sell straight back at {c(ex.bid)} and you lose {c1(spread)} per contract before any fee.</p>
        </>
      );
    }
    case "book": {
      const asks = ex.book?.asks ?? [];
      const bids = ex.book?.bids ?? [];
      const max = Math.max(...asks.map((a) => a.size), ...bids.map((b) => b.size), 1);
      return (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <BookSide max={max} rows={asks} color="var(--tmb-no)" label="Asks (people selling YES), cheapest first" />
            <BookSide max={max} rows={bids} color="var(--tmb-yes)" label="Bids (people buying YES), highest first" />
          </div>
          <p className="mt-3 type-meta text-fg-2">A market order to buy fills the top ask first, then the next. Each step up the list is slippage.</p>
        </>
      );
    }
    case "flagged":
      return ex.flag ? (
        <>
          <Row items={[["Flag", ex.flag.type === "anomaly" ? "Anomaly" : ex.flag.type === "gap" ? "Cross-venue gap" : ex.flag.type], ["Score", `${ex.flag.score}/100`], ["Yes price", c(ex.yesPrice)], ["Traded today", usd(ex.volume24h ?? 0)]]} />
          <p className="mt-3 type-meta text-fg-2">{ex.flag.explanation}</p>
        </>
      ) : null;
    case "gap":
      return ex.gap ? (
        <>
          <Row items={[["Kalshi", c1(ex.gap.kalshi)], ["Polymarket", c1(ex.gap.poly)], ["Gap", `${ex.gap.gapCents}¢`], ["Left after costs", `${ex.gap.edgeCents}¢`]]} />
          <p className="mt-3 type-meta text-fg-2">
            Spreads and fees eat about {ex.gap.costCents}¢ of the {ex.gap.gapCents}¢ gap. {ex.gap.flagged ? "What's left is big enough to flag." : "That leaves too little to flag."}
          </p>
        </>
      ) : null;
    case "rules":
      return (
        <>
          <p className="max-h-48 overflow-y-auto rounded-md bg-raised px-3 py-2 type-meta whitespace-pre-line text-fg-2">{ex.rules}</p>
          <p className="mt-3 type-meta text-fg-2">Look for the source that settles it, the deadline, and what happens if the event is postponed or cancelled.</p>
        </>
      );
    case "long_dated": {
      const days = ex.daysToClose != null ? Math.max(1, Math.round(ex.daysToClose)) : null;
      const ret = ex.yesPrice ? 1 / ex.yesPrice - 1 : 0;
      const yr = days ? Math.pow(1 + ret, 365 / days) - 1 : null;
      return (
        <>
          <Row items={[["Yes price", c(ex.yesPrice)], ["Pays out in", days ? `${(days / 365).toFixed(1)} years` : "—"], ["Return if it wins", `${(ret * 100).toFixed(1)}%`], ["Per year", yr != null ? `${(yr * 100).toFixed(1)}%` : "—"]]} />
          <p className="mt-3 type-meta text-fg-2">Even if it wins, your money earns about {yr != null ? `${(yr * 100).toFixed(1)}%` : "little"} a year while it is tied up.</p>
        </>
      );
    }
    case "live_game":
      return (
        <>
          <Row items={[["Yes price", c(ex.yesPrice)], ["Traded today", usd(ex.volume24h ?? 0)], ["Score", ex.score && !ex.score.includes("|") ? ex.score : "—"], ["Period", ex.period ?? "in progress"]]} />
          <p className="mt-3 type-meta text-fg-2">This game is being played right now. Expect the price to swing on every play; none of it is flagged.</p>
        </>
      );
    case "outcome_set":
      return (
        <>
          <ul className="flex flex-col gap-1">
            {(ex.outcomes ?? []).map((o) => (
              <li key={o.label} className="grid grid-cols-[1fr_110px_44px] items-center gap-3 type-meta">
                <span className="truncate text-fg">{o.label}</span>
                <span className="h-2 rounded-[3px] bg-fg-3" style={{ width: `${Math.max(2, o.yesPrice * 100)}%` }} />
                <span className="num text-right text-fg">{c(o.yesPrice)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 type-meta text-fg-2">
            These outcomes add up to <span className="num font-medium text-fg">{Math.round((ex.sum ?? 0) * 100)}%</span>.{" "}
            {(ex.sum ?? 1) > 1 ? "Above 100%: the spreads are pushing the sum up." : "Below 100%: some possible winners aren't listed, or the prices disagree."}
          </p>
        </>
      );
  }
}
