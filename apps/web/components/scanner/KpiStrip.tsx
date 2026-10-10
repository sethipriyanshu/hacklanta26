import { KpiTile } from "@/components/shell/KpiTile";
import { cents } from "@/lib/format";

export function KpiStrip({ tracked, venues, flags, biggestGap, recordedAt, mode }: { tracked: number; venues: Record<string, number>; flags: number; biggestGap: { cents: number; title: string } | null; recordedAt: string | null; mode: "live" | "replay" | "offline" }) {
  const when = recordedAt ? new Date(recordedAt) : null;
  const ago = when ? Math.max(0, Math.round((Date.now() - when.getTime()) / 60000)) : null;
  return (
    <div className="mb-4 grid grid-cols-4 gap-3">
      <KpiTile label="Markets tracked" value={tracked.toLocaleString()} sub={`${venues.kalshi ?? 0} Kalshi · ${venues.polymarket ?? 0} Polymarket`} accent="var(--tmb-fg-3)" loading={mode === "offline"} />
      <KpiTile label="Active flags" value={String(flags)} sub="signals scoring 40 or higher" accent="var(--tmb-anomaly)" loading={mode === "offline"} />
      <KpiTile label="Biggest cross-venue gap" value={biggestGap ? cents(biggestGap.cents / 100) : "—"} sub={biggestGap?.title ?? "no confirmed pairs"} accent="var(--tmb-mispricing)" loading={mode === "offline"} />
      <KpiTile label="Last update" value={when ? when.toISOString().slice(11, 16) + "Z" : "—"} sub={mode === "replay" ? `replaying snapshot · ${ago}m old` : mode === "live" ? "live polling" : "API offline"} accent={mode === "live" ? "var(--tmb-yes)" : "var(--tmb-anomaly)"} loading={mode === "offline"} />
    </div>
  );
}
