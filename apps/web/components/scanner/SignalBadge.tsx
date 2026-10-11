import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SignalType } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Names for each flag. Every flag is ochre; the label, not the hue, says which kind. */
export const SIGNAL_META: Record<SignalType, { label: string; short: string; color: string; hint: string }> = {
  anomaly: { label: "Anomaly", short: "Anomaly", color: "var(--tmb-anomaly)", hint: "Far more trading, or a far bigger price move, than a normal hour" },
  gap: { label: "Cross-venue gap", short: "Gap", color: "var(--tmb-anomaly)", hint: "The same outcome priced differently on Kalshi and Polymarket" },
  inconsistency: { label: "Outcome sum", short: "Sum", color: "var(--tmb-anomaly)", hint: "Outcomes where exactly one can win, but their prices don’t add to 100%" },
  newsLag: { label: "News lag", short: "Lag", color: "var(--tmb-contrarian)", hint: "A headline arrived and the price hasn’t moved yet" },
};

export function SignalBadge({ type, className }: { type: SignalType; score?: number; size?: "sm" | "md"; className?: string }) {
  const m = SIGNAL_META[type];
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={cn("inline-flex items-center gap-1.5 font-display text-[14px] font-medium whitespace-nowrap text-fg", className)} />}>
        <span aria-hidden className="size-2.5 rounded-full" style={{ background: m.color }} />
        {m.label}
      </TooltipTrigger>
      <TooltipContent side="top">{m.hint}</TooltipContent>
    </Tooltip>
  );
}

/** Venue in words, with its colour: Kalshi is ink, Polymarket is blue, everywhere in the product. */
export function VenueMark({ venue, className }: { venue: "kalshi" | "polymarket"; className?: string }) {
  const k = venue === "kalshi";
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-display text-[14px] font-medium text-fg-2", className)}>
      <span aria-hidden className="size-2.5 rounded-full" style={{ background: k ? "var(--tmb-fg)" : "var(--tmb-mispricing)" }} />
      {k ? "Kalshi" : "Polymarket"}
    </span>
  );
}
