import Link from "next/link";
import { ScannerWorkbench } from "@/components/scanner/ScannerWorkbench";
import type { PairReceipt } from "@/components/scanner/ReceiptPane";
import { getMarkets, getPairResults } from "@/lib/api";

/** The Markets list. `demo` (the unlisted /demo route) puts frozen past flags on top of the live list; nothing else differs. */
export async function MarketsPage({ category, demo = false }: { category?: string; demo?: boolean }) {
  const view = "all" as const;
  const [markets, pairResults] = await Promise.all([getMarkets({ sort: "score", demo }), getPairResults(demo)]);
  const rows = markets?.markets ?? [];

  // Only pairs with a side the scanner actually lists, so every count on the page uses one set of markets.
  const listed = new Set(rows.map((m) => m.id));
  const pairs: PairReceipt[] = Object.values(pairResults ?? {})
    .filter(
      ({ pair }) =>
        listed.has(pair.kalshiId) || pair.polyIds.some((id) => listed.has(id)),
    )
    .map(({ pair, gap }) => ({
      id: pair.id,
      title: pair.title,
      kalshiId: pair.kalshiId,
      polyIds: pair.polyIds,
      match: pair.match,
      checkedBy: pair.checkedBy ?? null,
      reason: pair.reason,
      kalshiPrice: gap.kalshi_price,
      polyPrice: gap.poly_price,
      gap: gap.gap,
      threshold: gap.threshold,
      edgeCents: gap.edge_cents,
      flagged: gap.flagged,
      thin: (gap as { thin?: boolean }).thin ?? false,
      explanation: gap.explanation,
    }));

  const flagged = rows.filter((m) => m.flags.length > 0).length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="type-h1 text-fg">Markets</h1>
        <p className="type-body text-fg-2">
          {markets ? (
            <>
              <span className="num text-fg">{(markets?.total ?? rows.length).toLocaleString()}</span> open on Kalshi and Polymarket ·{" "}
              <span className="num font-medium text-anomaly">{flagged}</span> flagged
            </>
          ) : (
            <span className="text-no">Data service offline</span>
          )}
        </p>
      </header>

      {markets ? (
        <ScannerWorkbench
          rows={rows}
          total={markets?.total ?? rows.length}
          pairs={pairs}
          view={view}
          initialCategory={category}
          demo={demo}
        />
      ) : (
        <section className="rounded-md border border-line bg-panel px-6 py-16 text-center">
          <h2 className="type-title text-fg">No markets to show yet</h2>
          <p className="mx-auto mt-2 max-w-md type-body text-fg-2">
            The data service at localhost:8000 isn’t answering. Start it with{" "}
            <code className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[0.9em] text-fg">make api</code>, then try again.
          </p>
          <Link
            href={view === "all" ? "/scanner" : `/scanner?view=${view}`}
            className="mt-6 inline-flex h-10 items-center rounded-md bg-fg px-4 font-display text-[15px] font-medium text-bg hover:bg-fg/85"
          >
            Try again
          </Link>
        </section>
      )}
    </div>
  );
}
