import Link from "next/link";
import { GitCompareArrows } from "lucide-react";
import type { Market, Signal } from "@/lib/api";
import { cents } from "@/lib/format";

export function CrossVenueCard({ signal, markets }: { signal: Signal | undefined; markets: Record<string, Market> }) {
  if (!signal) return <p className="px-3 py-4 type-meta text-fg-3">No confirmed twin on the other venue yet. Pairs are matched by title, then an LLM compares resolution rules.</p>;
  const d = signal.details as { kalshiId: string; polyIds: string[]; kalshiPrice: number; polyPrice: number; match: string; flagged: boolean };
  const k = markets[d.kalshiId];
  const polys = d.polyIds.map((i) => markets[i]).filter(Boolean);
  const gap = Math.abs(d.kalshiPrice - d.polyPrice);
  return (
    <div className="p-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Side label="Kalshi" price={d.kalshiPrice} href={k ? `/scanner/${encodeURIComponent(k.id)}` : undefined} title={k?.subtitle ?? k?.title ?? d.kalshiId} color="var(--tmb-yes)" />
        <div className="text-center">
          <GitCompareArrows className="mx-auto size-4 text-mispricing" />
          <p className="num mt-1 text-[18px] leading-none text-fg">{cents(gap)}</p>
          <p className="eyebrow mt-1">gap</p>
        </div>
        <Side label="Polymarket" price={d.polyPrice} href={polys[0] ? `/scanner/${encodeURIComponent(polys[0].id)}` : undefined} title={polys.map((p) => p.subtitle ?? p.title).join(" + ")} color="var(--tmb-mispricing)" />
      </div>
      <p className="mt-3 type-meta leading-relaxed text-fg-2">{signal.explanation}</p>
      <p className="num mt-2 type-small text-fg-3">
        rules match: <span style={{ color: d.match === "same" ? "var(--tmb-yes)" : d.match === "partial" ? "var(--tmb-anomaly)" : "var(--tmb-no)" }}>{d.match}</span>
      </p>
    </div>
  );
}

function Side({ label, price, href, title, color }: { label: string; price: number; href?: string; title: string; color: string }) {
  const inner = (
    <div className="rounded-md border border-line bg-bg px-3 py-2 transition-colors hover:border-fg-3">
      <p className="eyebrow" style={{ color }}>
        {label}
      </p>
      <p className="num text-[22px] leading-tight text-fg">{cents(price)}</p>
      <p className="truncate type-small text-fg-3" title={title}>
        {title}
      </p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
