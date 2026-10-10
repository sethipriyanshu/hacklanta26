"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, SkipBack } from "lucide-react";
import { AnomalyGauge } from "@/components/scanner/AnomalyGauge";
import { WhyFlagged } from "@/components/scanner/SignalList";
import { PriceChart, type ChartPin } from "@/components/scanner/PriceChart";
import { Button } from "@/components/ui/button";
import type { PricePoint, Signal } from "@/lib/api";
import { getMarketSignals } from "@/lib/api";
import { cents } from "@/lib/format";

const fmt = (ts: number) => new Date(ts * 1000).toISOString().slice(5, 16).replace("T", " ") + "Z";

export function ReplayScrubber({ marketId, points, timeline, headline, peak }: { marketId: string; points: PricePoint[]; timeline: { ts: number; score: number }[]; headline: { title: string; at: number; source: string } | null; peak: Signal | null }) {
  const t0 = points[0]?.ts ?? 0;
  const t1 = points[points.length - 1]?.ts ?? 0;
  const [cursor, setCursor] = useState<number>(peak?.asOf ?? t1);
  const [playing, setPlaying] = useState(false);
  const [signal, setSignal] = useState<Signal | null>(peak);
  const raf = useRef<number | null>(null);

  const scoreAt = useMemo(() => {
    if (timeline.length === 0) return 0;
    let best = timeline[0];
    for (const t of timeline) if (t.ts <= cursor) best = t;
    return best.score;
  }, [timeline, cursor]);

  const priceAt = useMemo(() => {
    let p = points[0]?.price ?? 0;
    for (const pt of points) {
      if (pt.ts > cursor) break;
      p = pt.price;
    }
    return p;
  }, [points, cursor]);

  useEffect(() => {
    if (!playing) return;
    const step = Math.max(60, Math.round((t1 - t0) / 240));
    let last = performance.now();
    const tick = (now: number) => {
      if (now - last > 40) {
        last = now;
        setCursor((c) => {
          const n = c + step;
          if (n >= t1) {
            setPlaying(false);
            return t1;
          }
          return n;
        });
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, t0, t1]);

  useEffect(() => {
    const id = setTimeout(async () => {
      const rows = await getMarketSignals(marketId, Math.floor(cursor / 3600) * 3600);
      if (rows && rows[0]) setSignal(rows[0]);
    }, 180);
    return () => clearTimeout(id);
  }, [cursor, marketId]);

  const pins: ChartPin[] = useMemo(() => {
    const out: ChartPin[] = timeline.filter((t) => t.score >= 60).filter((t, i, arr) => i === 0 || t.ts - arr[i - 1].ts >= 3600 * 3).map((t) => ({ ts: t.ts, label: `anomaly ${Math.round(t.score)}`, kind: "anomaly" as const }));
    if (headline) out.push({ ts: headline.at, label: "headline", kind: "headline" });
    return out;
  }, [timeline, headline]);

  const visible = useMemo(() => points.filter((p) => p.ts <= cursor), [points, cursor]);
  const visiblePins = useMemo(() => pins.filter((p) => p.ts <= cursor), [pins, cursor]);
  const beforeNews = headline ? cursor < headline.at : false;

  return (
    <div className="grid grid-cols-[1fr_300px] gap-3">
      <section className="rounded-lg border border-line bg-panel">
        <header className="flex h-9 items-center justify-between border-b border-line px-3">
          <h2 className="eyebrow">Replay · minute data</h2>
          <span className="num text-[11px] text-fg-2">
            {fmt(cursor)} · YES <span className="text-fg">{cents(priceAt)}</span>
          </span>
        </header>
        <div className="p-2">
          <PriceChart points={visible.length > 2 ? visible : points.slice(0, 3)} pins={visiblePins} height={320} />
        </div>
        <div className="flex items-center gap-3 border-t border-line px-3 py-2">
          <Button size="icon-sm" variant="outline" onClick={() => { setPlaying(false); setCursor(t0 + 3600 * 6); }} aria-label="Restart">
            <SkipBack />
          </Button>
          <Button size="icon-sm" onClick={() => { if (cursor >= t1) setCursor(t0 + 3600 * 6); setPlaying((p) => !p); }} aria-label={playing ? "Pause" : "Play"} className="bg-anomaly text-bg hover:bg-anomaly/90">
            {playing ? <Pause /> : <Play />}
          </Button>
          <input type="range" min={t0} max={t1} step={60} value={cursor} onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }} className="h-1 flex-1 accent-[var(--tmb-anomaly)]" aria-label="Replay position" />
          {headline && (
            <span className={`num rounded-sm border px-1.5 py-0.5 text-[10px] tracking-wider ${beforeNews ? "border-anomaly/40 text-anomaly" : "border-mispricing/40 text-mispricing"}`}>
              {beforeNews ? `${Math.max(0, Math.round((headline.at - cursor) / 3600))}h BEFORE HEADLINE` : "HEADLINE OUT"}
            </span>
          )}
        </div>
      </section>
      <section className="flex flex-col rounded-lg border border-line bg-panel">
        <header className="flex h-9 items-center border-b border-line px-3">
          <h2 className="eyebrow">Anomaly score at cursor</h2>
        </header>
        <div className="p-3">
          <AnomalyGauge score={signal?.asOf != null && Math.abs(signal.asOf - cursor) < 3600 * 2 ? signal.score : scoreAt} />
          <p className="mt-3 min-h-16 text-[12px] leading-relaxed text-fg-2">{signal?.explanation ?? "Scrub the timeline to score the market as of that hour."}</p>
          {signal && (
            <WhyFlagged signal={signal}>
              <button type="button" className="mt-2 text-[12px] text-mispricing hover:underline">
                Why flagged →
              </button>
            </WhyFlagged>
          )}
          {headline && (
            <div className="mt-4 rounded-md border border-line bg-bg p-2.5">
              <p className="eyebrow mb-1">Headline</p>
              <p className="text-[12px] text-fg">{headline.title}</p>
              <p className="num mt-1 text-[10px] text-fg-3">
                {headline.source} · {fmt(headline.at)}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
