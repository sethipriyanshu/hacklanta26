"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createSeriesMarkers, type IChartApi, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type Time, type UTCTimestamp } from "lightweight-charts";
import type { PricePoint } from "@/lib/api";
import { readTokens } from "@/lib/theme";

export interface ChartPin {
  ts: number;
  label: string;
  kind: "anomaly" | "headline";
}

const centsFmt = (p: number) => `${Math.round(p * 100)}¢`;
const volFmt = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : `${Math.round(v)}`);

export function PriceChart({ points, pins = [], height = 360 }: { points: PricePoint[]; pins?: ChartPin[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const line = useRef<ISeriesApi<"Line"> | null>(null);
  const vol = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markers = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const fitted = useRef(false);

  // Create once.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const t = readTokens();
    const c = createChart(el, {
      height,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: t["fg-3"], fontFamily: "var(--font-geist-mono)", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: t.line, style: LineStyle.Dotted }, horzLines: { color: t.line, style: LineStyle.Dotted } },
      rightPriceScale: { borderColor: t.line, scaleMargins: { top: 0.08, bottom: 0.26 } },
      timeScale: { borderColor: t.line, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: t["fg-3"], labelBackgroundColor: t.raised }, horzLine: { color: t["fg-3"], labelBackgroundColor: t.raised } },
      handleScroll: { mouseWheel: false },
    });
    line.current = c.addSeries(LineSeries, {
      color: t.yes,
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
      crosshairMarkerRadius: 4,
      priceFormat: { type: "custom", formatter: centsFmt, minMove: 0.001 },
      autoscaleInfoProvider: (orig: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const r = orig();
        return r ? { ...r, priceRange: { minValue: Math.max(0, r.priceRange.minValue), maxValue: Math.min(1, r.priceRange.maxValue) } } : r;
      },
    });
    vol.current = c.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "custom", formatter: volFmt, minMove: 1 }, color: t["fg-3"], lastValueVisible: false, priceLineVisible: false });
    c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, borderVisible: false });
    markers.current = createSeriesMarkers(line.current, []);
    chart.current = c;
    const ro = new ResizeObserver(() => c.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      c.remove();
      chart.current = null;
      line.current = null;
      vol.current = null;
      markers.current = null;
      fitted.current = false;
    };
  }, [height]);

  // Update data cheaply.
  useEffect(() => {
    const l = line.current;
    const v = vol.current;
    const c = chart.current;
    if (!l || !v || !c || points.length === 0) return;
    const t = readTokens();
    const up = points[points.length - 1].price >= points[0].price;
    l.applyOptions({ color: up ? t.yes : t.no, priceLineColor: up ? t.yes : t.no });
    l.setData(points.map((p) => ({ time: p.ts as UTCTimestamp, value: p.price })));
    v.setData(points.filter((p) => p.volume != null).map((p, i, arr) => ({ time: p.ts as UTCTimestamp, value: p.volume ?? 0, color: i > 0 && p.price < arr[i - 1].price ? `${t.no}55` : `${t.yes}55` })));
    if (!fitted.current) {
      c.timeScale().fitContent();
      fitted.current = true;
    }
  }, [points]);

  useEffect(() => {
    const m = markers.current;
    if (!m) return;
    const t = readTokens();
    const rows: SeriesMarker<Time>[] = pins
      .map((p) => ({
        time: p.ts as UTCTimestamp,
        position: p.kind === "headline" ? ("aboveBar" as const) : ("belowBar" as const),
        color: p.kind === "headline" ? t.mispricing : t.anomaly,
        shape: p.kind === "headline" ? ("arrowDown" as const) : ("circle" as const),
        text: p.label,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));
    m.setMarkers(rows);
  }, [pins]);

  return <div ref={ref} className="w-full" />;
}
