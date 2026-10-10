import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SignalType } from "@/lib/api";
import { cn } from "@/lib/utils";

export const SIGNAL_META: Record<SignalType, { label: string; short: string; color: string; hint: string }> = {
  anomaly: { label: "Anomaly", short: "ANOM", color: "var(--tmb-anomaly)", hint: "Unusual volume or price action, scored 0–100" },
  gap: { label: "Cross-venue gap", short: "GAP", color: "var(--tmb-mispricing)", hint: "Same event priced differently on Kalshi and Polymarket" },
  inconsistency: { label: "Inconsistency", short: "SUM", color: "var(--tmb-mispricing)", hint: "Mutually exclusive outcomes that do not sum to 100%" },
  newsLag: { label: "News lag", short: "LAG", color: "var(--tmb-contrarian)", hint: "Headline arrived, price has not moved yet" },
};

export function SignalBadge({ type, score, size = "sm", className }: { type: SignalType; score?: number; size?: "sm" | "md"; className?: string }) {
  const m = SIGNAL_META[type];
  const badge = (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 font-medium whitespace-nowrap", size === "sm" ? "h-5 text-[10px]" : "h-6 px-2 text-[11px]", className)}
      style={{ color: m.color, borderColor: `color-mix(in oklab, ${m.color} 40%, transparent)`, background: `color-mix(in oklab, ${m.color} 12%, transparent)` }}
    >
      <span className="size-1.5 rounded-full bg-current" />
      <span className="num tracking-wider">{m.short}</span>
      {score !== undefined && <span className="num opacity-90">{Math.round(score)}</span>}
    </span>
  );
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{badge}</TooltipTrigger>
      <TooltipContent side="top">
        {m.label}
        {score !== undefined ? ` · ${Math.round(score)}/100` : ""} — {m.hint}
      </TooltipContent>
    </Tooltip>
  );
}

export function VenueMark({ venue, className }: { venue: "kalshi" | "polymarket"; className?: string }) {
  const k = venue === "kalshi";
  return (
    <span className={cn("num inline-flex h-5 items-center gap-1 rounded-sm border border-line bg-raised px-1.5 text-[10px] tracking-wider", className)} title={k ? "Kalshi" : "Polymarket"}>
      <span className="size-1.5 rounded-[2px]" style={{ background: k ? "var(--tmb-yes)" : "var(--tmb-mispricing)" }} />
      {k ? "KALSHI" : "POLY"}
    </span>
  );
}
