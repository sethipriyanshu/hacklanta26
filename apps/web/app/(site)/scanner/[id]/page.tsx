import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, MessagesSquare, Orbit } from "lucide-react";
import { AiSummary } from "@/components/scanner/AiSummary";
import { AnomalyGauge } from "@/components/scanner/AnomalyGauge";
import { CrossVenueCard } from "@/components/scanner/CrossVenueCard";
import { LiveOrderBook } from "@/components/scanner/LiveOrderBook";
import { PriceChart, type ChartPin } from "@/components/scanner/PriceChart";
import { SignalList } from "@/components/scanner/SignalList";
import { SignalBadge, VenueMark } from "@/components/scanner/SignalBadge";
import { WalletPanel } from "@/components/scanner/WalletPanel";
import { Panel, EmptyState } from "@/components/shell/Panel";
import { Exhibit } from "@/components/scanner/FindingExhibit";
import { buildFinding, marketName } from "@/lib/findings";
import { getBook, getEvent, getHistory, getMarket, getMarketSignals, getNews, getSummary, getTimeline, getWallets, type Market, type Signal } from "@/lib/api";
import { cents, usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Term } from "@/components/shell/Term";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = await getMarket(decodeURIComponent(id));
  return { title: m ? (m.eventTitle || m.title).slice(0, 60) : "Market" };
}

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  const market = await getMarket(id);
  if (!market) notFound();

  const [history, signals, timeline, book, wallets, event, news, summary] = await Promise.all([
    getHistory(id, "1h"),
    getMarketSignals(id),
    getTimeline(id, "1h"),
    getBook(id),
    market.venue === "polymarket" ? getWallets(id) : Promise.resolve(null),
    getEvent(id),
    getNews(id),
    getSummary(id),
  ]);

  const siblings = event?.markets ?? [];
  const marketIndex: Record<string, Market> = Object.fromEntries(siblings.map((m) => [m.id, m]));
  const gapSignal = (signals ?? []).find((s) => s.type === "gap");
  if (gapSignal) {
    const d = gapSignal.details as { kalshiId: string; polyIds: string[] };
    for (const mid of [d.kalshiId, ...d.polyIds]) if (!marketIndex[mid]) {
      const mm = await getMarket(mid);
      if (mm) marketIndex[mid] = mm;
    }
  }
  const anomaly = (signals ?? []).find((s) => s.type === "anomaly");
  const headScore = anomaly?.score ?? 0;
  const pins: ChartPin[] = (timeline ?? []).filter((t) => t.score >= 60).filter((t, i, arr) => i === 0 || t.ts - arr[i - 1].ts >= 3600 * 6).map((t) => ({ ts: t.ts, label: "flagged", kind: "anomaly" as const }));
  const sum = siblings.reduce((a, m) => a + m.yesPrice, 0);
  const change = market.change24h ?? 0;
  const impliedPct = Math.round(market.yesPrice * 100);
  const topHeadlines = news?.headlines.slice(0, 4) ?? [];

  const finding = buildFinding(market, (signals ?? []).filter((x) => x.score >= 40));
  const { event: eventName, outcome } = marketName(market);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={id.startsWith("demo:") ? "/demo" : "/scanner"} className="mb-3 inline-flex items-center gap-1 type-meta text-fg-2 hover:text-fg">
          <ArrowLeft className="size-3.5" /> Markets
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <div className="min-w-0 max-w-4xl">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <VenueMark venue={market.venue} />
              <span className="type-meta text-fg-2">{market.category}</span>
              <span className="num type-meta text-fg-3">{market.ticker}</span>
              {market.status === "closed" && <span className="type-meta font-medium text-fg">Resolved</span>}
            </div>
            <h1 className="mt-1 type-h1 text-fg">{eventName}</h1>
            {outcome && <p className="type-lead text-fg-2">{outcome}</p>}
          </div>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className="num text-[40px] leading-none font-medium text-fg">
                {impliedPct}¢<span className="ml-2 text-[15px] font-normal text-fg-2">yes · {impliedPct}% implied</span>
              </p>
              <p className="num mt-1.5 type-meta text-fg-2">
                {market.change24h != null && (
                  <span className={cn(Math.round(change * 100) > 0 ? "text-yes" : Math.round(change * 100) < 0 ? "text-no" : "")}>
                    {Math.round(change * 100) > 0 ? "+" : Math.round(change * 100) < 0 ? "−" : ""}
                    {Math.abs(Math.round(change * 100))} pts 24h
                  </span>
                )}
                {market.yesBid != null && market.yesAsk != null ? ` · bid ${cents(market.yesBid)} / ask ${cents(market.yesAsk)}` : ""}
                {` · vol 24h ${usd(market.volume24h)}`}
                {market.closeTime ? ` · closes ${new Date(market.closeTime).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Link href={`/desk?market=${encodeURIComponent(id)}`} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-fg px-3 font-display text-[14px] font-medium text-bg hover:bg-fg/85">
                <MessagesSquare className="size-4" /> Analyst Desk
              </Link>
              <Link href={`/sim?market=${encodeURIComponent(id)}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 font-display text-[14px] font-medium text-fg hover:border-fg-3 hover:bg-raised">
                <Orbit className="size-4" /> Simulate
              </Link>
              <a href={market.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 font-display text-[14px] font-medium text-fg hover:border-fg-3 hover:bg-raised">
                Venue <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-8">
          <Panel title="Price · hourly, 7 days" action={pins.length > 0 ? <span className="type-small text-fg-2">markers show where it was flagged</span> : undefined}>
            {history && history.points.length > 2 ? (
              <div className="p-3">
                <PriceChart points={history.points} pins={pins} height={320} />
              </div>
            ) : (
              <div className="h-[320px]">
                <EmptyState icon={Orbit} title="No price history yet" hint="Hourly history is fetched for the most active markets." />
              </div>
            )}
          </Panel>

          {finding && (
            <Panel title={`Flagged · ${finding.kind === "anomaly" ? "Anomaly" : finding.kind === "gap" ? "Cross-venue gap" : "Outcome sum"}`} accent="var(--tmb-anomaly)">
              <div className="grid gap-x-8 gap-y-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="flex flex-col gap-2">
                  <h3 className="font-display text-[20px] leading-snug font-medium text-fg">{finding.headline}</h3>
                  <p className="type-body text-fg">{finding.sentence}</p>
                  <p className="type-meta text-fg-2">{finding.caveat}</p>
                </div>
                <div className="min-w-0">
                  <Exhibit f={finding} size={7} cols={36} />
                </div>
              </div>
            </Panel>
          )}

          {siblings.length > 1 && (
            <Panel
              title={`Event outcomes · ${siblings.length}`}
              action={
                <span className={cn("num type-small", event?.event?.mutuallyExclusive && Math.abs(sum - 1) > 0.05 ? "font-medium text-anomaly" : "text-fg-2")}>
                  {event?.event?.mutuallyExclusive ? `sum ${Math.round(sum * 100)}%` : "not mutually exclusive"}
                </span>
              }
            >
              <ul className="max-h-72 divide-y divide-line overflow-y-auto">
                {siblings.slice(0, 40).map((m) => (
                  <li key={m.id}>
                    <Link href={`/scanner/${encodeURIComponent(m.id)}`} className={cn("flex items-center gap-4 px-4 py-2 hover:bg-raised/60", m.id === id && "bg-raised")}>
                      <span className="flex-1 truncate type-body text-fg">{m.subtitle ?? m.title}</span>
                      <span className="h-1.5 w-28 overflow-hidden rounded-full bg-raised">
                        <span className="block h-full rounded-full bg-fg-3" style={{ width: `${Math.round(m.yesPrice * 100)}%` }} />
                      </span>
                      <span className="num w-12 text-right type-body text-fg">{Math.round(m.yesPrice * 100)}¢</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {topHeadlines.length > 0 && (
            <Panel title="News" action={<span className="num type-small text-fg-2">{news?.headlines.length ?? 0} matched</span>}>
              <ul className="grid divide-line sm:grid-cols-2 sm:divide-x">
                {topHeadlines.map((h) => (
                  <li key={h.id} className="border-b border-line">
                    <a href={h.url} target="_blank" rel="noreferrer" className="flex h-full flex-col gap-1 px-4 py-3 transition-colors hover:bg-raised/60">
                      <span className="line-clamp-2 type-body text-fg">{h.title}</span>
                      <span className="type-small text-fg-2">
                        {h.source} · {new Date(h.publishedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title={<Term term="resolution rules">Resolution rules</Term>}>
            <p className="max-h-48 overflow-y-auto p-4 type-body whitespace-pre-line text-fg-2">{market.rulesText || "No rules text published."}</p>
          </Panel>
        </div>

        <div className="flex flex-col gap-5 lg:col-span-4">
          <Panel title={<Term term="anomaly score">Anomaly score</Term>}>
            <AnomalyGauge score={headScore} />
            <SignalList signals={signals ?? []} />
          </Panel>
          <AiSummary data={summary} pct={impliedPct} />
          <Panel title={<Term term="cross-venue gap">Cross-venue</Term>}>
            <CrossVenueCard signal={gapSignal} markets={marketIndex} />
          </Panel>
          {market.venue === "polymarket" && (
            <Panel title="Wallets · recent YES buyers">
              <WalletPanel data={wallets} />
            </Panel>
          )}
          <Panel title={<Term term="order book">Order book</Term>}>
            <LiveOrderBook marketId={id} initial={book} live />
          </Panel>
        </div>
      </div>
    </div>
  );
}

export function SignalSummary({ signals }: { signals: Signal[] }) {
  return (
    <span className="flex gap-1">
      {signals.map((s) => (
        <SignalBadge key={s.type} type={s.type} score={s.score} />
      ))}
    </span>
  );
}
