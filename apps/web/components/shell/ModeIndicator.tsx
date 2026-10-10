"use client";

import { useEffect, useState } from "react";
import { api, type Health } from "@/lib/api";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Mode = "live" | "replay" | "offline" | "checking";

const LABEL: Record<Mode, string> = { live: "LIVE", replay: "REPLAY", offline: "OFFLINE", checking: "…" };
const COLOR: Record<Mode, string> = { live: "var(--tmb-yes)", replay: "var(--tmb-anomaly)", offline: "var(--tmb-fg-3)", checking: "var(--tmb-fg-3)" };
const HINT: Record<Mode, string> = {
  live: "Polling venues every 45s.",
  replay: "Serving recorded fixtures. No outbound calls.",
  offline: "API not reachable. Start it with make api.",
  checking: "Checking the API…",
};

export function ModeIndicator() {
  const [mode, setMode] = useState<Mode>("checking");

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const h = await api<Health>("/health", { timeoutMs: 2500 });
        if (alive) setMode(h.mode);
      } catch {
        if (alive) setMode("offline");
      }
    };
    check();
    const id = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger
        render={<div className="flex h-7 items-center gap-2 rounded-full border border-line bg-raised px-2.5" style={{ color: COLOR[mode] }} />}
      >
        <span className={mode === "live" || mode === "replay" ? "pulse-dot size-1.5 rounded-full bg-current" : "size-1.5 rounded-full bg-current"} />
        <span className="num text-[11px] tracking-widest">{LABEL[mode]}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{HINT[mode]}</TooltipContent>
    </Tooltip>
  );
}
