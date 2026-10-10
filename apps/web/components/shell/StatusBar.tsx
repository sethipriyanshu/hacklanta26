"use client";

import { useEffect, useState } from "react";
import { getHealth, getSignals, type Health } from "@/lib/api";

export function StatusBar() {
  const [health, setHealth] = useState<Health | null>(null);
  const [flags, setFlags] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [h, s] = await Promise.all([getHealth(), getSignals({ min_score: 40 })]);
      if (!alive) return;
      setHealth(h);
      setFlags(s ? new Set(s.map((x) => x.marketId)).size : null);
    };
    load();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  const when = health?.recordedAt ? new Date(health.recordedAt).toISOString().slice(11, 16) + "Z" : "—";
  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-line bg-panel px-4 text-[11px] text-fg-3">
      <span className="num tracking-wider">READ-ONLY TERMINAL · NO ORDER ROUTING · NO WALLETS</span>
      <span className="num">
        FEED <span className="text-fg-2">{health ? (health.mode === "live" ? "LIVE" : "FIXTURES") : "OFFLINE"}</span> · MARKETS <span className="text-fg-2">{health?.marketCount ?? "—"}</span> · FLAGS <span className="text-fg-2">{flags ?? "—"}</span> · SNAPSHOT <span className="text-fg-2">{when}</span>
      </span>
      <span>
        Labels say <span className="text-anomaly">anomaly</span>, never &ldquo;insider&rdquo;. Nothing here is advice.
      </span>
    </footer>
  );
}
