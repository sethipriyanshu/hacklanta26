import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, MessagesSquare, Orbit } from "lucide-react";
import { AnomalyGauge } from "@/components/scanner/AnomalyGauge";
import { CrossVenueCard } from "@/components/scanner/CrossVenueCard";
import { OrderBookMini } from "@/components/scanner/OrderBookMini";
import { PriceChart, type ChartPin } from "@/components/scanner/PriceChart";
import { ReplayScrubber } from "@/components/scanner/ReplayScrubber";
import { SignalList } from "@/components/scanner/SignalList";
import { SignalBadge, VenueMark } from "@/components/scanner/SignalBadge";
import { WalletPanel } from "@/components/scanner/WalletPanel";
import { Panel, EmptyState } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import { getBook, getEvent, getHistory, getMarket, getMarketSignals, getNews, getScenarios, getSignals, getTimeline, getWallets, type Market, type Signal } from "@/lib/api";
import { cents, pct, usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Newspaper } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = await getMarket(decodeURIComponent(id));
  return { title: m ? m.title.slice(0, 60) : "Contract" };
}

export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ scenario?: string }> }) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  const sp = await searchParams;
  const market = await getMarket(id);
  if (!market) notFound();
  const scenarios = (await getScenarios()) ?? [];
  const scenario = sp.scenario ? scenarios.find((s) => String(s.id) === sp.scenario && s.marketId === id) ?? null : null;
  const replay = Boolean(scenario?.windowStart && scenario?.headline);

  const [history, history1m, signals, scenarioSignals, timeline, book, wallets, event, news] = await Promise.all([
    getHistory(id, "1h"),
    replay ? getHistory(id, "1m") : Promise.resolve(null),
    getMarketSignals(id),
    replay ? getSignals({ scenario: true }) : Promise.resolve(null),
    getTimeline(id, replay ? "1m" : "1h"),
    getBook(id),
    market.venue === "polymarket" ? getWallets(id, scenario?.headline ? Math.floor(new Date(scenario.headline.at).getTime() / 1000) - 36 * 3600 : undefined, scenario?.headline ? Math.floor(new Date(scenario.headline.at).getTime() / 1000) : undefined) : Promise.resolve(null),
    getEvent(id),
    getNews(id),
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
  const peak = (scenarioSignals ?? []).find((s) => s.marketId === id && (s.details as { scenario?: number }).scenario === scenario?.id) ?? null;
  const anomaly = (signals ?? []).find((s) => s.type === "anomaly");
  const headScore = replay && peak ? peak.score : anomaly?.score ?? 0;
  const pins: ChartPin[] = (timeline ?? []).filter((t) => t.score >= 60).filter((t, i, arr) => i === 0 || t.ts - arr[i - 1].ts >= 3600 * 6).map((t) => ({ ts: t.ts, label: `anomaly ${Math.round(t.score)}`, kind: "anomaly" as const }));
  const sum = siblings.reduce((a, m) => a + m.yesPrice, 0);
  const change = market.change24h ?? 0;
  const headline = scenario?.headline ? { title: scenario.headline.title, at: Math.floor(new Date(scenario.headline.at).getTime() / 1000), source: scenario.headline.source ?? "" } : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <Link href="/scanner" className="mb-2 inline-flex items-center gap-1 text-[11px] text-fg-3 hover:text-fg-2">
            <ArrowLeft className="size-3" /> Scanner
          </Link>
          <div className="flex items-center gap-2">
            <VenueMark venue={market.venue} />
            <span className="num text-[11px] text-fg-3">{market.ticker}</span>
            <span className="num rounded-sm border border-line px-1.5 text-[10px] tracking-wider text-fg-3 uppercase">{market.category}</span>
            {market.status === "closed" && <span className="num rounded-sm border border-line px-1.5 text-[10px] tracking-wider text-fg-3 uppercase">resolved</span>}
            {scenario && <span className="num rounded-sm border border-anomaly/40 bg-anomaly/10 px-1.5 text-[10px] tracking-wider text-anomaly">{scenario.code} · {scenario.title}</span>}
          </div>
          <h1 className="mt-1 truncate text-[22px] font-semibold tracking-tight text-fg">{market.title}</h1>
          <p className="truncate text-[13px] text-fg-2">{market.eventTitle}{market.subtitle ? ` · ${market.subtitle}` : ""}</p>
        </div>
        <div className="flex items-end gap-6">
          <div className="text-right">
            <p className="eyebrow">YES</p>
            <p className="num text-[36px] leading-none font-medium text-fg">{cents(market.yesPrice)}</p>
            <p className="num mt-1 text-[11px] text-fg-3">
              {market.yesBid != null && market.yesAsk != null ? `${cents(market.yesBid)} / ${cents(market.yesAsk)}` : "—"}
              <span className={cn("ml-2", change > 0 ? "text-yes" : change < 0 ? "text-no" : "text-fg-3")}>{market.change24h != null ? pct(change) : ""}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex gap-2">
              <Button render={<Link href={`/desk?market=${encodeURIComponent(id)}`} />} className="bg-quant text-bg hover:bg-quant/90">
                <MessagesSquare /> Ask the Analyst Desk
              </Button>
              <Button variant="outline" render={<Link href={`/sim?market=${encodeURIComponent(id)}`} />}>
                <Orbit /> Simulate this
              </Button>
            </div>
            <p className="num text-[10.5px] text-fg-3">
              vol 24h {usd(market.volume24h)} · total {usd(market.volume)} {market.closeTime ? `· closes ${market.closeTime.slice(0, 10)}` : ""} ·{" "}
              <a href={market.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-fg-2">
                venue <ExternalLink className="size-2.5" />
              </a>
            </p>
          </div>
        </div>
      </div>

      {replay && history1m && history1m.points.length > 2 ? (
        <ReplayScrubber marketId={id} points={history1m.points} timeline={timeline ?? []} headline={headline} peak={peak} />
      ) : null}

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-8 flex flex-col gap-3">
          {!replay && (
            <Panel title="Price · hourly, 7 days" action={<span className="num text-[11px] text-fg-3">{pins.length} anomaly pin{pins.length === 1 ? "" : "s"}</span>}>
              {history && history.points.length > 2 ? (
                <div className="p-2">
                  <PriceChart points={history.points} pins={pins} height={340} />
                </div>
              ) : (
                <div className="h-[340px]">
                  <EmptyState icon={Orbit} title="No price history recorded" hint="Hourly history is fetched for the most active markets. Open a top market or run in live mode." />
                </div>
              )}
            </Panel>
          )}
          {siblings.length > 1 && (
            <Panel title={`Event outcomes · ${siblings.length}`} action={<span className={cn("num text-[11px]", event?.event?.mutuallyExclusive ? (Math.abs(sum - 1) > 0.05 ? "text-mispricing" : "text-fg-3") : "text-fg-3")}>{event?.event?.mutuallyExclusive ? `YES sum ${Math.round(sum * 100)}%` : "not mutually exclusive"}</span>}>
              <ul className="max-h-72 divide-y divide-line/60 overflow-y-auto">
                {siblings.slice(0, 40).map((m) => (
                  <li key={m.id}>
                    <Link href={`/scanner/${encodeURIComponent(m.id)}`} className={cn("flex items-center gap-3 px-3 py-1.5 text-[12px] hover:bg-raised/60", m.id === id && "bg-raised/40")}>
                      <span className="flex-1 truncate text-fg">{m.subtitle ?? m.title}</span>
                      <span className="h-1.5 w-28 overflow-hidden rounded-full bg-raised">
                        <span className="block h-full rounded-full bg-fg-3" style={{ width: `${Math.round(m.yesPrice * 100)}%` }} />
                      </span>
                      <span className="num w-12 text-right text-fg">{cents(m.yesPrice)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Resolution rules">
            <p className="max-h-40 overflow-y-auto p-3 text-[12px] leading-relaxed whitespace-pre-line text-fg-2">{market.rulesText || "No rules text published."}</p>
          </Panel>
        </div>

        <div className="col-span-4 flex flex-col gap-3">
          <Panel title="Anomaly score" accent="var(--tmb-anomaly)">
            <div className="pt-3">
              <AnomalyGauge score={headScore} />
            </div>
            <SignalList signals={(signals ?? []).filter((s) => !replay || s.type !== "anomaly").concat(replay && peak ? [peak] : [])} />
          </Panel>
          <Panel title="Cross-venue" accent="var(--tmb-mispricing)">
            <CrossVenueCard signal={gapSignal} markets={marketIndex} />
          </Panel>
          {market.venue === "polymarket" && (
            <Panel title={replay ? "Wallets · 36h before the headline" : "Wallets · recent YES buyers"} accent="var(--tmb-anomaly)">
              <WalletPanel data={wallets} />
            </Panel>
          )}
          <Panel title="Order book">
            <OrderBookMini book={book} />
          </Panel>
          <Panel title="Headlines" action={<span className="num text-[11px] text-fg-3">{news?.headlines.length ?? 0}</span>}>
            {news && news.headlines.length > 0 ? (
              <ul className="max-h-64 divide-y divide-line/60 overflow-y-auto">
                {news.headlines.slice(0, 8).map((h) => (
                  <li key={h.id}>
                    <a href={h.url} target="_blank" rel="noreferrer" className="block px-3 py-2 hover:bg-raised/60">
                      <p className="line-clamp-2 text-[12px] leading-snug text-fg">{h.title}</p>
                      <p className="num mt-0.5 text-[10px] text-fg-3">
                        {h.source} · {h.publishedAt.slice(0, 16).replace("T", " ")}Z
                      </p>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="h-24">
                <EmptyState icon={Newspaper} title="No matched headlines" />
              </div>
            )}
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
