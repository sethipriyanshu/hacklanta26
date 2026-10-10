"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Radar, Search } from "lucide-react";
import { Sparkline } from "@/components/scanner/Sparkline";
import { SignalBadge, VenueMark } from "@/components/scanner/SignalBadge";
import { EmptyState } from "@/components/shell/Panel";
import type { MarketRow } from "@/lib/api";
import { cents, pct, usd } from "@/lib/format";
import { cn } from "@/lib/utils";

const CATEGORIES = ["All", "Politics", "Economics", "Sports", "Crypto", "Tech", "Other"] as const;
type SortKey = "title" | "yesPrice" | "change24h" | "volume24h" | "maxScore";
const GRID = "grid-cols-[minmax(0,1fr)_84px_72px_110px_92px_168px]";

export function MarketTable({ rows, view, initialCategory, bare }: { rows: MarketRow[]; view: "all" | "flags" | "gaps"; initialCategory?: string; bare?: boolean }) {
  const router = useRouter();
  const [cat, setCat] = useState<string>(initialCategory && CATEGORIES.includes(initialCategory as never) ? initialCategory : "All");
  const [venue, setVenue] = useState<"all" | "kalshi" | "polymarket">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: view === "all" ? "volume24h" : "maxScore", dir: -1 });

  const filtered = useMemo(() => {
    let r = rows;
    if (view === "flags") r = r.filter((m) => m.flags.some((f) => f.type === "anomaly"));
    if (view === "gaps") r = r.filter((m) => m.flags.some((f) => f.type === "gap" || f.type === "inconsistency"));
    if (cat !== "All") r = r.filter((m) => m.category === cat);
    if (venue !== "all") r = r.filter((m) => m.venue === venue);
    if (query) {
      const q = query.toLowerCase();
      r = r.filter((m) => m.title.toLowerCase().includes(q) || m.eventTitle.toLowerCase().includes(q) || m.ticker.toLowerCase().includes(q));
    }
    const val = (m: MarketRow): number | string => (sort.key === "title" ? m.eventTitle : sort.key === "change24h" ? (m.change24h ?? 0) : sort.key === "yesPrice" ? m.yesPrice : sort.key === "maxScore" ? m.maxScore : m.volume24h);
    return [...r].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, view, cat, venue, query, sort]);

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "title" ? 1 : -1 }));
  const Head = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <button type="button" onClick={() => toggle(k)} className={cn("eyebrow flex items-center gap-1 hover:text-fg-2", right && "justify-end")}>
      {children}
      {sort.key === k ? sort.dir === -1 ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
    </button>
  );

  return (
    <section className={cn("flex min-h-0 flex-col overflow-hidden", !bare && "rounded-lg border border-line bg-panel")}>
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <div className="flex items-center gap-1">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" onClick={() => setCat(c)} className={cn("h-6 rounded-full px-2.5 text-[11px] transition-colors", cat === c ? "bg-fg text-bg" : "text-fg-2 hover:bg-raised hover:text-fg")}>
              {c}
            </button>
          ))}
        </div>
        <span className="mx-1 h-4 w-px bg-line" />
        <div className="flex items-center gap-1">
          {(["all", "kalshi", "polymarket"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setVenue(v)} className={cn("num h-6 rounded-sm px-2 text-[10px] tracking-wider uppercase transition-colors", venue === v ? "bg-raised text-fg" : "text-fg-3 hover:text-fg")}>
              {v === "all" ? "Both" : v === "kalshi" ? "Kalshi" : "Poly"}
            </button>
          ))}
        </div>
        <label className="ml-auto flex h-7 w-60 items-center gap-2 rounded-md border border-line bg-bg px-2 text-fg-3 focus-within:border-fg-3">
          <Search className="size-3.5" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter markets" className="w-full bg-transparent text-[12px] text-fg outline-none placeholder:text-fg-3" />
        </label>
        <span className="num text-[11px] text-fg-3">{filtered.length} rows</span>
      </header>

      <div className={cn("grid items-center gap-3 border-b border-line px-3 py-2", GRID)}>
        <Head k="title">Market</Head>
        <span className="eyebrow">Venue</span>
        <Head k="yesPrice" right>YES</Head>
        <Head k="change24h">24h</Head>
        <Head k="volume24h" right>Volume</Head>
        <Head k="maxScore">Signals</Head>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="h-48">
            <EmptyState icon={Radar} title="Nothing matches" hint={view === "flags" ? "No market is scoring an anomaly right now. Try a demo scenario from the command line." : "Change the filter or clear the search."} />
          </div>
        ) : (
          filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => router.push(`/scanner/${encodeURIComponent(m.id)}`)}
              className={cn("grid w-full items-center gap-3 border-b border-line/60 px-3 py-2 text-left transition-colors last:border-0 hover:bg-raised/60 focus-visible:bg-raised/60 focus-visible:outline-none", GRID)}
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-fg">{m.subtitle && m.subtitle !== m.eventTitle ? `${m.eventTitle} · ${m.subtitle}` : m.title}</span>
                <span className="num block truncate text-[10.5px] text-fg-3">{m.ticker}</span>
              </span>
              <VenueMark venue={m.venue} />
              <span className="num text-right text-[13px] text-fg">{cents(m.yesPrice)}</span>
              <span className="flex items-center gap-2">
                <Sparkline points={m.spark} width={64} height={20} />
                <span className={cn("num w-12 text-[11px]", (m.change24h ?? 0) > 0 ? "text-yes" : (m.change24h ?? 0) < 0 ? "text-no" : "text-fg-3")}>{m.change24h != null ? pct(m.change24h, 1) : "—"}</span>
              </span>
              <span className="num text-right text-[12px] text-fg-2">{usd(m.volume24h)}</span>
              <span className="flex flex-wrap gap-1">
                {m.flags.length === 0 ? <span className="text-[11px] text-fg-3">clean</span> : m.flags.slice(0, 3).map((f) => <SignalBadge key={f.type} type={f.type} score={f.score} />)}
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
