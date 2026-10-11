"use client";

import { useEffect, useState } from "react";
import { getHealth, type Health } from "@/lib/api";
import { etTime } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Where the numbers come from, in words: live venues, recorded fixtures, or nothing. */
export function useHealth(intervalMs = 15000) {
  const [health, setHealth] = useState<(Health & { checkedAt: number }) | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    let misses = 0;
    const check = async () => {
      const h = await getHealth();
      if (!alive) return;
      // One slow answer is not an outage: only report offline after two misses in a row.
      if (h) {
        misses = 0;
        setHealth({ ...h, checkedAt: Date.now() });
      } else if (++misses >= 2) setHealth(null);
    };
    check();
    const id = setInterval(check, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);
  return health;
}

export const timeOf = (iso?: string) => (iso ? etTime(iso) : "");

export function FeedStatus() {
  const health = useHealth();
  // A venue is stale when its last good pull is over 10 minutes old or its latest attempt failed.
  const venues = health?.venues ?? {};
  const stale = ["kalshi", "polymarket"].filter((v) => {
    const p = venues[v];
    return !p || p.ok === false || !p.at || (health?.checkedAt ?? 0) - new Date(p.at).getTime() > 10 * 60_000;
  });
  const base = health === undefined ? "checking" : health === null ? "offline" : health.mode;
  const state = base === "live" && stale.length > 0 ? "stale" : base;
  const label = { live: "Live", stale: "Stale", replay: "Recorded", offline: "Offline", checking: "Checking" }[state];
  const color = { live: "var(--tmb-yes)", stale: "var(--tmb-anomaly)", replay: "var(--tmb-anomaly)", offline: "var(--tmb-no)", checking: "var(--tmb-fg-3)" }[state];
  const venueName = (v: string) => (v === "kalshi" ? "Kalshi" : "Polymarket");
  const hint =
    state === "live"
      ? `Live prices from Kalshi and Polymarket, ${health!.marketCount.toLocaleString()} markets. Last refresh ${timeOf(health!.recordedAt)}.`
      : state === "stale"
        ? `${stale.map(venueName).join(" and ")} ${stale.length > 1 ? "haven’t" : "hasn’t"} refreshed recently${stale.map((v) => venues[v]?.error).filter(Boolean).length ? " (the last pull failed)" : ""}. Showing the last good data; it retries every few minutes.`
        : state === "replay"
        ? `Showing a recorded snapshot from ${timeOf(health!.recordedAt)}. No live calls.`
        : state === "offline"
          ? "The data service isn't answering. Start it with make api."
          : "Checking the data service…";
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} className="hidden h-9 items-center gap-2 rounded-md px-2 font-display text-[14px] font-medium text-fg-2 sm:flex" />}>
        <span aria-hidden className={state === "live" ? "pulse-dot size-2 rounded-full" : "size-2 rounded-full"} style={{ background: color, color }} />
        {label}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}
