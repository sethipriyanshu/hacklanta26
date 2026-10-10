import Link from "next/link";
import { GitCompareArrows } from "lucide-react";
import { EmptyState, Panel } from "@/components/shell/Panel";
import type { VenuePair } from "@/lib/api";
import { cents } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PairRow {
  pair: VenuePair;
  gap: { gap: number; threshold: number; edge_cents: number; flagged: boolean; kalshi_price: number; poly_price: number; explanation: string };
}

export function PairsTable({ rows }: { rows: PairRow[] }) {
  const sorted = [...rows].sort((a, b) => b.gap.gap - a.gap.gap);
  return (
    <Panel title={`Cross-venue pairs · ${rows.length} confirmed`} action={<span className="num text-[11px] text-fg-3">gap vs spreads + fees</span>}>
      {sorted.length === 0 ? (
        <div className="h-40">
          <EmptyState icon={GitCompareArrows} title="No confirmed pairs" hint="Pairs are proposed by title similarity and confirmed by comparing resolution rules." />
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-[1fr_90px_90px_80px_80px_90px_110px] items-center gap-3 border-b border-line px-3 py-2">
            {["Event", "Kalshi", "Polymarket", "Gap", "Edge", "Rules", "Verdict"].map((h, i) => (
              <span key={h} className={cn("eyebrow", i > 0 && i < 5 && "text-right")}>{h}</span>
            ))}
          </div>
          {sorted.map(({ pair, gap }) => (
            <Link key={pair.id} href={`/scanner/${encodeURIComponent(pair.kalshiId)}`} className="grid grid-cols-[1fr_90px_90px_80px_80px_90px_110px] items-center gap-3 border-b border-line/60 px-3 py-2.5 text-[12px] transition-colors last:border-0 hover:bg-raised/60">
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-fg">{pair.title}</span>
                <span className="num block truncate text-[10.5px] text-fg-3">{pair.kalshiId.replace("kalshi:", "")} ↔ {pair.polyIds.map((p) => p.replace("poly:", "")).join(" + ")}</span>
              </span>
              <span className="num text-right text-fg">{cents(gap.kalshi_price)}</span>
              <span className="num text-right text-fg">{cents(gap.poly_price)}</span>
              <span className={cn("num text-right", gap.flagged ? "text-mispricing" : "text-fg-2")}>{(gap.gap * 100).toFixed(1)}¢</span>
              <span className={cn("num text-right", gap.flagged ? "text-yes" : "text-fg-3")}>{gap.flagged ? `+${gap.edge_cents.toFixed(1)}¢` : "none"}</span>
              <span className="num text-[10px] tracking-wider uppercase" style={{ color: pair.match === "same" ? "var(--tmb-yes)" : pair.match === "partial" ? "var(--tmb-anomaly)" : "var(--tmb-no)" }}>
                {pair.match}
                <span className="ml-1 text-fg-3">· {pair.checkedBy ?? "curated"}</span>
              </span>
              <span className={cn("num rounded-full border px-2 py-0.5 text-center text-[10px] tracking-wider", gap.flagged ? "border-mispricing/40 bg-mispricing/10 text-mispricing" : "border-line text-fg-3")}>{gap.flagged ? "MISPRICED" : "IN LINE"}</span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}
