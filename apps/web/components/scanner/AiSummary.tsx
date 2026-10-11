import Link from "next/link";
import { Sparkles, GraduationCap, Info } from "lucide-react";
import type { MarketSummary } from "@/lib/api";

const CONCEPT_LABEL: Record<string, string> = {
  "implied-probability": "Reading the odds",
  "spread-vig": "Spread & vig",
  liquidity: "Liquidity",
  "wash-trading": "Wash trading",
  "anomaly-patterns": "Anomaly patterns",
  "cross-venue-arbitrage": "Cross-venue gaps",
};

/** The "understand this market" card — the learning-first lead of the contract page. */
export function AiSummary({ data, pct }: { data: MarketSummary | null; pct: number }) {
  if (!data) return null;
  const isAi = data.source === "llm";
  return (
    <section className="rounded-md border border-line bg-panel p-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="eyebrow text-fg">Summary</h2>
        <span className="ml-auto flex items-center gap-1 rounded-sm bg-raised px-1.5 py-0.5 type-small text-fg-2">
          <Sparkles className="size-3" />
          {isAi ? "AI" : "Template"}
        </span>
      </div>
      <p className="type-body font-medium text-fg">
        {data.plainTitle} <span className="num font-normal text-fg-2">· {pct}% implied</span>
      </p>
      <p className="mt-1.5 type-body text-fg-2">{data.summary}</p>

      {data.whatsNotable && (
        <p className="mt-2 flex items-start gap-2 type-body text-fg">
          <Info className="mt-0.5 size-4 shrink-0 text-anomaly" />
          <span>{data.whatsNotable}</span>
        </p>
      )}

      {data.concepts.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1.5 type-small text-fg-2">
            <GraduationCap className="size-4" /> Learn:
          </span>
          {data.concepts.map((c) => (
            <Link
              key={c}
              href={`/learn/${c}`}
              className="rounded-sm border border-line px-2.5 py-1 type-small text-fg-2 transition-colors hover:border-fg-3 hover:text-fg"
            >
              {CONCEPT_LABEL[c] ?? c}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
