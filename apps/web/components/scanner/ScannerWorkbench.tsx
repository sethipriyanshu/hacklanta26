"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, LoaderCircle, Search } from "lucide-react";
import { ReceiptPane, edgeReason, type PairReceipt, type Selection } from "@/components/scanner/ReceiptPane";
import { SIGNAL_META } from "@/components/scanner/SignalBadge";
import { getMarkets, type MarketRow } from "@/lib/api";
import { usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Term } from "@/components/shell/Term";

const CATEGORIES = ["All", "Politics", "Economics", "Sports", "Crypto", "Tech", "Other"] as const;
const LEAGUES = ["NFL", "CFB", "NBA", "WNBA", "CBB", "MLB", "NHL", "Soccer", "Tennis", "UFC", "Golf", "F1", "Esports"] as const;
type SortKey = "score" | "title" | "yesPrice" | "change24h" | "volume24h";
type View = "all" | "flags" | "gaps";

type Item = { key: string; flagged: boolean; sel: Selection };
/** One server-side slice of the market list: the filters that produced it, the rows fetched so far, and how many match in total. */
type Listing = { key: string; rows: MarketRow[]; total: number };

const PAGE = 400;

const marketTitle = (m: MarketRow) => (m.subtitle && m.subtitle !== m.eventTitle ? `${m.eventTitle} · ${m.subtitle}` : m.title);
/** One plain line per flag, rebuilt from the explanation's own numbers; the side pane carries the full story. */
const flagSentence = (m: MarketRow) => {
  const e = m.flags[0]?.explanation;
  if (!e) return null;
  const vol = e.match(/ran ([\d.]+)×/);
  if (vol) return `${Math.round(Number(vol[1])).toLocaleString()}× its normal trading in one hour.`;
  const move = e.match(/moved (-?[\d.]+) points in an hour, against a typical hourly move of ([\d.]+)/);
  if (move) return `Moved ${Math.abs(Math.round(Number(move[1])))} points in an hour; a normal hour moves it ${move[2]}.`;
  const set = m.flags[0]?.type === "inconsistency" ? m.flags[0].subScores : null;
  if (set?.edgeCents) return `Outcome set mispriced: about ${set.edgeCents.toFixed(1)}¢ per set after costs.`;
  const gap = e.match(/Kalshi prices YES at ([\d.]+)¢, Polymarket at ([\d.]+)¢/);
  if (gap) return `Kalshi says ${Math.round(Number(gap[1]))} in 100, Polymarket says ${Math.round(Number(gap[2]))}.`;
  const cut = e.search(/\.\s/);
  return cut > 0 ? e.slice(0, cut + 1) : e;
};

export function ScannerWorkbench({ rows: initialRows, total: initialTotal, pairs, view, initialCategory, demo }: { rows: MarketRow[]; total: number; pairs: PairReceipt[]; view: View; initialCategory?: string; demo?: boolean }) {
  const router = useRouter();
  const [cat, setCat] = useState<string>(initialCategory && CATEGORIES.includes(initialCategory as never) ? initialCategory : "All");
  const [venue, setVenue] = useState<"all" | "kalshi" | "polymarket">("all");
  const [liveOnly, setLiveOnly] = useState(false);
  const [league, setLeague] = useState<string>("All");
  // "In progress" is answered by the server across every market, never by the slice this page has loaded.
  const [liveTotal, setLiveTotal] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => void getMarkets({ live: true, limit: 1 }).then((r) => alive && r && setLiveTotal(r.total));
    load();
    const id = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLTableSectionElement>(null);

  // Search, category and venue run on the API across every market; the page only ever holds the slices it has fetched.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  const params = useMemo(
    () => ({
      sort: "score" as const,
      q: debouncedQuery || undefined,
      category: cat !== "All" ? cat : undefined,
      venue: venue !== "all" ? venue : undefined,
      live: liveOnly || undefined,
      league: league !== "All" ? league : undefined,
      demo: demo || undefined,
    }),
    [debouncedQuery, cat, venue, liveOnly, league, demo],
  );
  const paramsKey = JSON.stringify(params);
  const baseKey = JSON.stringify({ sort: "score", demo: demo || undefined });
  // Fetched slices by filter key. The unfiltered list arrives server-rendered; any other key is fetched on demand.
  const [listings, setListings] = useState<Record<string, Listing>>(() => ({ [baseKey]: { key: baseKey, rows: initialRows, total: initialTotal } }));
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (listings[paramsKey]) return;
    let cancelled = false;
    void getMarkets({ ...params, limit: PAGE, offset: 0 }).then((r) => {
      if (cancelled) return;
      // Keep the unfiltered list and this search only, so typing doesn't pile up cached slices.
      setListings((l) => ({ [baseKey]: l[baseKey], [paramsKey]: { key: paramsKey, rows: r?.markets ?? [], total: r?.total ?? 0 } }));
    });
    return () => {
      cancelled = true;
    };
  }, [listings, params, paramsKey, baseKey]);

  // While a search is in flight, keep filtering what's already loaded so the list responds immediately.
  const listing = listings[paramsKey] ?? listings[baseKey];
  const loadMore = async () => {
    const { key, rows: prev } = listing;
    setLoadingMore(true);
    const r = await getMarkets({ ...(JSON.parse(key) as typeof params), limit: PAGE, offset: prev.length });
    setLoadingMore(false);
    if (!r) return;
    const seen = new Set(prev.map((m) => m.id));
    setListings((l) => (l[key] ? { ...l, [key]: { key, rows: [...l[key].rows, ...r.markets.filter((m) => !seen.has(m.id))], total: r.total } } : l));
  };
  const rows = listing.rows;

  const filteredRows = useMemo(() => {
    let r = rows;
    if (view === "flags") r = r.filter((m) => m.flags.some((f) => f.type === "anomaly"));
    if (view === "gaps") r = r.filter((m) => m.flags.some((f) => f.type === "inconsistency"));
    if (liveOnly) r = r.filter((m) => m.live);
    if (league !== "All") r = r.filter((m) => (m.meta as { league?: string } | undefined)?.league === league);
    if (cat !== "All") r = r.filter((m) => m.category === cat);
    if (venue !== "all") r = r.filter((m) => m.venue === venue);
    if (query) {
      const q = query.toLowerCase();
      r = r.filter((m) => m.title.toLowerCase().includes(q) || m.eventTitle.toLowerCase().includes(q) || m.ticker.toLowerCase().includes(q));
    }
    if (sort) {
      const val = (m: MarketRow): number | string =>
        sort.key === "title" ? marketTitle(m) : sort.key === "score" ? m.maxScore : sort.key === "change24h" ? (m.change24h ?? 0) : sort.key === "yesPrice" ? m.yesPrice : m.volume24h;
      r = [...r].sort((a, b) => {
        const x = val(a);
        const y = val(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
    }
    return r;
  }, [rows, view, cat, venue, liveOnly, league, query, sort]);

  const filteredPairs = useMemo(() => {
    if (view !== "gaps") return [];
    const q = query.toLowerCase();
    return pairs.filter((p) => !q || p.title.toLowerCase().includes(q)).sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.gap - a.gap);
  }, [pairs, view, query]);

  const flaggedRows = useMemo(() => filteredRows.filter((m) => m.flags.length > 0), [filteredRows]);
  const cleanRows = useMemo(() => (view === "all" ? filteredRows.filter((m) => m.flags.length === 0) : []), [filteredRows, view]);

  const items: Item[] = useMemo(
    () => [
      ...filteredPairs.map((p) => ({ key: `pair:${p.id}`, flagged: p.flagged, sel: { kind: "pair", pair: p } as Selection })),
      ...flaggedRows.map((m) => ({ key: m.id, flagged: true, sel: { kind: "market", row: m } as Selection })),
      ...cleanRows.map((m) => ({ key: m.id, flagged: false, sel: { kind: "market", row: m } as Selection })),
    ],
    [filteredPairs, flaggedRows, cleanRows],
  );

  const [selKey, setSelKey] = useState<string | null>(null);
  const selected = items.find((i) => i.key === selKey) ?? items[0] ?? null;

  const move = useCallback(
    (d: 1 | -1) => {
      if (!items.length) return;
      const i = selected ? items.findIndex((x) => x.key === selected.key) : -1;
      const next = items[Math.max(0, Math.min(items.length - 1, i + d))];
      setSelKey(next.key);
      requestAnimationFrame(() => {
        const el = listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(next.key)}"]`);
        el?.focus({ preventScroll: true });
        el?.scrollIntoView({ block: "nearest" });
      });
    },
    [items, selected],
  );

  const open = useCallback(
    (it: Item | null) => {
      if (!it) return;
      const id = it.sel.kind === "market" ? it.sel.row.id : it.sel.pair.kalshiId;
      router.push(`/scanner/${encodeURIComponent(id)}`);
    },
    [router],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector("[role=dialog]")) return;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing) {
        if (e.key === "Escape") (t as HTMLElement).blur();
        return;
      }
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        move(1);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        move(-1);
      } else if (e.key === "Enter" && (t === document.body || t?.closest("[data-scanner-list]"))) {
        e.preventDefault();
        open(selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, open, selected]);

  const toggleSort = (key: SortKey) => setSort((s) => (s?.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "title" ? 1 : -1 }));
  const rowCls = (key: string) =>
    cn("cursor-pointer border-b border-line transition-colors duration-150 outline-none", selected?.key === key ? "bg-raised shadow-[inset_3px_0_0_var(--tmb-mispricing)]" : "hover:bg-raised/60", "focus-visible:shadow-[inset_0_0_0_2px_var(--tmb-mispricing)]");
  const rowProps = (it: Item) => ({
    "data-key": it.key,
    tabIndex: selected?.key === it.key ? 0 : -1,
    "aria-current": selected?.key === it.key ? ("true" as const) : undefined,
    onClick: () => setSelKey(it.key),
    onDoubleClick: () => open(it),
    onFocus: () => setSelKey(it.key),
  });

  const totalListed = items.length;
  const searching = listing.key !== paramsKey;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)]">
      <section className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <label className="flex h-9 min-w-56 flex-1 items-center gap-2.5 rounded-md border border-line bg-panel px-3 text-fg-2 focus-within:border-fg-2">
            <Search className="size-4 shrink-0" />
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search markets" aria-label="Search markets" className="w-full bg-transparent type-body text-fg outline-none placeholder:text-fg-3" />
            <kbd className="rounded-sm bg-raised px-1.5 font-display type-body text-fg-2">/</kbd>
          </label>
          {view !== "gaps" && (
            <select
              value={cat}
              onChange={(e) => {
                // Browsers can re-fire "change" on blur with the same value; only a real switch resets the league.
                if (e.target.value === cat) return;
                setCat(e.target.value);
                setLeague("All");
              }}
              aria-label="Category"
              className="h-9 rounded-md border border-line bg-panel px-3 type-body text-fg outline-none focus:border-fg-2"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c === "All" ? "All categories" : c}
                </option>
              ))}
            </select>
          )}
          {view !== "gaps" && (
            <div className="flex h-9 items-center rounded-md border border-line bg-panel p-1" role="group" aria-label="Venue">
              {(["all", "kalshi", "polymarket"] as const).map((v) => (
                <button key={v} type="button" aria-pressed={venue === v} onClick={() => setVenue(v)} className={cn("h-full rounded-sm px-3 font-display text-[14px] transition-colors", venue === v ? "bg-fg text-bg" : "text-fg-2 hover:text-fg")}>
                  {v === "all" ? "Both" : v === "kalshi" ? "Kalshi" : "Polymarket"}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            aria-pressed={liveOnly}
            onClick={() => setLiveOnly((v) => !v)}
            disabled={liveTotal === 0 && !liveOnly}
            className={cn("flex h-9 items-center gap-2 rounded-md border px-3 font-display text-[14px] transition-colors disabled:opacity-50", liveOnly ? "border-fg bg-fg text-bg" : "border-line bg-panel text-fg-2 hover:text-fg")}
            title="Games being played right now, on both venues"
          >
            <span className="pulse-dot size-2 rounded-full bg-yes text-yes" />
            In progress {liveTotal != null && <span className="num">{liveTotal.toLocaleString()}</span>}
          </button>
        </div>

        {cat === "Sports" && (
          <div role="group" aria-label="League" className="-mt-1 flex gap-1.5 overflow-x-auto pb-3">
            {["All", ...LEAGUES].map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={league === l}
                onClick={() => setLeague(l)}
                className={cn(
                  "h-8 shrink-0 rounded-full border px-3.5 font-display text-[14px] font-medium transition-colors",
                  league === l ? "border-fg bg-fg text-bg" : "border-line bg-panel text-fg-2 hover:border-fg-3 hover:text-fg",
                )}
              >
                {l === "All" ? "All sports" : l}
              </button>
            ))}
          </div>
        )}

        {totalListed === 0 ? (
          searching || query.trim() !== debouncedQuery ? (
            <p className="flex items-center justify-center gap-2 px-6 py-16 type-meta text-fg-2">
              <LoaderCircle className="size-3.5 animate-spin" /> Searching all markets…
            </p>
          ) : (
            <EmptyList view={view} filtered={!!query || cat !== "All" || venue !== "all" || liveOnly || league !== "All"} />
          )
        ) : (
          <div className="max-lg:overflow-x-auto">
          <table className="w-full table-fixed max-lg:min-w-[720px] border-collapse text-left" data-scanner-list>
            <colgroup>
              <col />
              <col className="w-[150px]" />
              <col className="w-[76px]" />
              <col className="w-[88px]" />
              <col className="w-[112px]" />
            </colgroup>
            <thead className="border-b border-line">
              <tr>
                <Th k="title" sort={sort} onSort={toggleSort}>Market</Th>
                <Th k="score" sort={sort} onSort={toggleSort}>{view === "gaps" ? <Term term="cross-venue gap">Gap</Term> : <Term term="anomaly score">Flag</Term>}</Th>
                {view === "gaps" ? (
                  <th scope="col" colSpan={3} className="z-10 lg:sticky lg:top-14 bg-bg px-3 py-3 text-right font-display text-[14px] font-medium text-fg-2">
                    <Term term="fees">Worth it after costs?</Term>
                  </th>
                ) : (
                  <>
                    <Th k="yesPrice" sort={sort} onSort={toggleSort} right><Term term="implied probability">Yes</Term></Th>
                    <Th k="change24h" sort={sort} onSort={toggleSort} right>24h</Th>
                    <Th k="volume24h" sort={sort} onSort={toggleSort} right><Term term="liquidity">Volume 24h</Term></Th>
                  </>
                )}
              </tr>
            </thead>
            <tbody ref={listRef}>
              {filteredPairs.length > 0 && <SectionRow label={`${filteredPairs.length} events listed on both venues`} hint="their price gap against trading costs" />}
              {filteredPairs.map((p) => {
                const it = items.find((i) => i.key === `pair:${p.id}`)!;
                return (
                  <tr key={it.key} {...rowProps(it)} className={rowCls(it.key)}>
                    <td className="px-3 py-2.5 align-top">
                      <span className={cn("flex items-center gap-2 font-display text-[14px] font-medium", p.flagged ? "text-fg" : "text-fg-2")}>
                        <span aria-hidden className="size-2.5 rounded-full" style={{ background: p.flagged ? "var(--tmb-anomaly)" : "var(--tmb-dot)" }} />
                        <span className="num">{(p.gap * 100).toFixed(0)}¢</span> apart
                      </span>
                    </td>
                    <td className="min-w-0 py-3 pr-3 align-top">
                      <span className="block truncate type-body font-medium text-fg">{p.title}</span>
                      <span className="mt-0.5 block truncate type-meta text-fg-2">
                        Kalshi says {Math.round(p.kalshiPrice * 100)} in 100 · Polymarket says {Math.round(p.polyPrice * 100)}
                      </span>
                    </td>
                    <td colSpan={3} className={cn("px-3 py-2.5 text-right align-top type-meta", p.flagged ? "text-yes" : "text-fg-2")}>
                      {edgeReason(p)}
                    </td>
                  </tr>
                );
              })}

              {flaggedRows.length > 0 && view !== "flags" && <SectionRow label={view === "gaps" ? `${flaggedRows.length} outcome sets that don’t add up` : `${flaggedRows.length} flagged`} accent />}
              {flaggedRows.map((m) => {
                const it = items.find((i) => i.key === m.id)!;
                const top = m.flags[0];
                const meta = SIGNAL_META[top.type];
                const sentence = flagSentence(m);
                return (
                  <tr key={m.id} {...rowProps(it)} className={rowCls(m.id)}>
                    <td className="min-w-0 py-2.5 pr-3 pl-3 align-top">
                      <MarketName m={m} strong />
                      <span className="mt-0.5 line-clamp-2 pl-5 type-meta text-fg-2">{sentence ?? meta.hint}</span>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <FlagChip type={top.type} value={top.type === "gap" && top.subScores?.edgeCents != null ? `${top.subScores.edgeCents.toFixed(0)}¢` : String(Math.round(Math.min(100, top.score)))} />
                    </td>
                    {view === "gaps" ? (
                      <td colSpan={3} className="px-3 py-3 text-right align-top type-meta text-fg-2">
                        {top.subScores?.sumPct != null ? `outcomes sum to ${top.subScores.sumPct.toFixed(1)}%` : meta.label}
                      </td>
                    ) : (
                      <PriceCells m={m} />
                    )}
                  </tr>
                );
              })}

              {cleanRows.map((m) => {
                const it = items.find((i) => i.key === m.id)!;
                return (
                  <tr key={m.id} {...rowProps(it)} className={rowCls(m.id)}>
                    <td className="min-w-0 py-2.5 pr-3 pl-3">
                      <MarketName m={m} />
                    </td>
                    <td className="px-3 py-2.5" aria-label="Not flagged" />
                    <PriceCells m={m} quiet />
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}

        {view !== "gaps" && (
          <div className="flex items-center justify-between gap-3 border-t border-line py-4">
            <p className="type-meta text-fg-2">
              {searching ? (
                <span className="inline-flex items-center gap-1.5">
                  <LoaderCircle className="size-3 animate-spin" /> Searching all markets…
                </span>
              ) : (
                <>
                  Showing <span className="num text-fg">{rows.length.toLocaleString()}</span> of <span className="num text-fg">{listing.total.toLocaleString()}</span> {listing.key === baseKey ? "markets" : "matching markets"}
                </>
              )}
            </p>
            {!searching && rows.length < listing.total && (
              <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 font-display text-[14px] font-medium text-fg transition-colors hover:bg-raised disabled:opacity-60">
                {loadingMore && <LoaderCircle className="size-3 animate-spin" />}
                Show {Math.min(PAGE, listing.total - rows.length).toLocaleString()} more
              </button>
            )}
          </div>
        )}
      </section>

      <div className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
        <p className="sr-only" aria-live="polite">
          {selected ? `Selected ${selected.sel.kind === "pair" ? selected.sel.pair.title : marketTitle(selected.sel.row)}` : ""}
        </p>
        <ReceiptPane selection={selected?.sel ?? null} />
        <p className="mt-3 px-1 type-small text-fg-2">Use ↑ and ↓ to move through the list, Enter to open a market.</p>
      </div>
    </div>
  );
}

function Th({ k, sort, onSort, children, right }: { k: SortKey; sort: { key: SortKey; dir: 1 | -1 } | null; onSort: (k: SortKey) => void; children: React.ReactNode; right?: boolean }) {
  const active = sort?.key === k;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={cn("z-10 lg:sticky lg:top-14 bg-bg px-3 py-3 font-normal", right && "text-right")}>
      <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 font-display text-[14px] font-medium text-fg-2 hover:text-fg", right && "flex-row-reverse")}>
        {children}
        {active && (sort.dir === -1 ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  );
}

function PriceCells({ m, quiet }: { m: MarketRow; quiet?: boolean }) {
  const ch = m.change24h ?? null;
  const py = quiet ? "py-2.5" : "py-2.5 align-top";
  return (
    <>
      <td className={cn("num px-3 text-right type-body", py, "text-fg")}>{m.yesPrice > 0 && m.yesPrice < 0.005 ? "<1¢" : `${Math.round(m.yesPrice * 100)}¢`}</td>
      <td className={cn("num px-3 text-right type-meta", py, ch == null || Math.round(ch * 100) === 0 ? "text-fg-2" : ch > 0 ? "text-yes" : "text-no")}>
        {ch == null ? "—" : Math.round(ch * 100) === 0 ? "0" : `${ch > 0 ? "+" : "−"}${Math.abs(Math.round(ch * 100))}`}
      </td>
      <td className={cn("num px-3 text-right type-meta text-fg-2", py)}>{usd(m.volume24h)}</td>
    </>
  );
}

/** Venue told apart by shape, not colour: a square for Kalshi, a ring for Polymarket. */
function VenueGlyph({ venue }: { venue: string }) {
  const k = venue === "kalshi";
  return (
    <span title={k ? "Kalshi" : "Polymarket"} aria-label={k ? "Kalshi" : "Polymarket"} className="grid size-3.5 shrink-0 place-items-center">
      <span className={k ? "size-2 rounded-[2px] bg-fg-3" : "size-2.5 rounded-full border-[1.5px] border-fg-3"} />
    </span>
  );
}

/** The market's name opens its page; clicking anywhere else on the row previews it in the side pane. */
function MarketName({ m, strong }: { m: MarketRow; strong?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <VenueGlyph venue={m.venue} />
      <Link
        href={`/scanner/${encodeURIComponent(m.id)}`}
        onClick={(e) => e.stopPropagation()}
        className={cn("truncate type-body hover:underline", strong ? "font-medium text-fg" : "text-fg")}
      >
        {marketTitle(m)}
      </Link>
      {m.live && <GameClock m={m} />}
    </span>
  );
}

/** The venue's own score and period for a game in progress, when it publishes them. */
function GameClock({ m }: { m: MarketRow }) {
  const meta = (m.meta ?? {}) as { score?: string | null; period?: string | null };
  const score = meta.score && !meta.score.includes("|") ? meta.score : null;
  const text = [score, meta.period].filter(Boolean).join(" · ");
  return (
    <span className="shrink-0 rounded-sm bg-yes/15 px-1.5 font-display text-[12px] font-medium whitespace-nowrap text-yes">
      {text ? `Live · ${text}` : "Live"}
    </span>
  );
}

function FlagChip({ type, value }: { type: keyof typeof SIGNAL_META; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-anomaly/15 px-2 py-0.5 font-display text-[13px] font-medium whitespace-nowrap text-anomaly">
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {SIGNAL_META[type].short}
      <span className="num">{value}</span>
    </span>
  );
}

function SectionRow({ label, hint, accent }: { label: string; hint?: string; accent?: boolean }) {
  return (
    <tr aria-hidden className="border-b border-line">
      <td colSpan={5} className="px-3 pt-4 pb-1.5">
        <span className={cn("font-display text-[14px] font-medium", accent ? "text-fg" : "text-fg-2")}>{label}</span>
        {hint && <span className="ml-2 type-meta text-fg-2">{hint}</span>}
      </td>
    </tr>
  );
}

function EmptyList({ view, filtered }: { view: View; filtered: boolean }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="type-title text-fg">{filtered ? "No markets match these filters" : view === "flags" ? "No anomalies right now" : view === "gaps" ? "No mispricing right now" : "No markets loaded"}</p>
      <p className="mx-auto mt-2 max-w-sm type-body text-fg-2">
        {filtered ? "Clear the search, or go back to all categories and both venues." : "Nothing scores 40 or more right now. Flags appear here as soon as a market crosses the line."}
      </p>
    </div>
  );
}
