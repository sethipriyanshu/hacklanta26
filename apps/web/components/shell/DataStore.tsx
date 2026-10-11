"use client";

import { useEffect, useState } from "react";
import { Database } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getDataStats, type DataStats } from "@/lib/api";
import { etTime } from "@/lib/format";

const n = (x?: number) => (x ?? 0).toLocaleString();
const mb = (b?: number) => (b ? `${(b / 1_048_576).toFixed(0)} MB` : "");

/** The Tiger Data store in one line: how many markets and price ticks it holds. Hidden when no database is set. */
export function DataStore() {
  const [s, setS] = useState<DataStats | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => void getDataStats().then((r) => alive && setS(r));
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  if (!s?.enabled || !s.connected || !s.markets) return null;
  const v = s.marketsByVenue ?? {};
  return (
    <Tooltip>
      <TooltipTrigger render={<p tabIndex={0} />} className="flex flex-wrap items-center gap-x-2 gap-y-1 type-meta text-fg-2 outline-none">
        <Database aria-hidden className="size-3.5 text-fg-3" />
        <span>
          Powered by <span className="font-medium text-fg">Tiger Data</span>
        </span>
        <span aria-hidden className="text-fg-3">·</span>
        <span className="num">
          <span className="text-fg">{n(s.markets)}</span> markets
        </span>
        <span aria-hidden className="text-fg-3">·</span>
        <span className="num">
          <span className="text-fg">{n(s.ticks)}</span> price ticks
        </span>
        {s.lastTick ? (
          <>
            <span aria-hidden className="text-fg-3">·</span>
            <span className="num">Last poll {etTime(s.lastTick)}</span>
          </>
        ) : null}
        {s.compressionRatio && s.compressionRatio > 1 ? (
          <>
            <span aria-hidden className="text-fg-3">·</span>
            <span className="num">{s.compressionRatio}× compressed</span>
          </>
        ) : null}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm flex-col items-start gap-1 text-left">
        <span>
          TimescaleDB on Tiger Cloud. {n(v.polymarket)} Polymarket and {n(v.kalshi)} Kalshi markets; every price change streams into a compressed hypertable with an hourly rollup.
        </span>
        <span className="num opacity-80">
          {n(s.ticksLastHour)} ticks in the last hour · {n(s.flags)} flags · {s.chunks} chunks {s.bytes ? `· ${mb(s.bytes)}` : ""}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
