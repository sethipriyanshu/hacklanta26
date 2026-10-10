import type { Metadata } from "next";
import { Radar } from "lucide-react";
import { ModuleHeader } from "@/components/shell/ModuleHeader";
import { KpiTile } from "@/components/shell/KpiTile";
import { Panel, EmptyState } from "@/components/shell/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { MODULE_BY_ID } from "@/lib/modules";

export const metadata: Metadata = { title: "Scanner" };

const COLS = ["Market", "Venue", "YES", "24h", "Volume", "Signals"];

export default function ScannerPage() {
  return (
    <>
      <ModuleHeader mod={MODULE_BY_ID.scanner} />
      <div className="mb-4 grid grid-cols-4 gap-3">
        <KpiTile label="Markets tracked" loading accent="var(--tmb-fg-3)" />
        <KpiTile label="Active flags" loading accent="var(--tmb-anomaly)" />
        <KpiTile label="Biggest cross-venue gap" loading accent="var(--tmb-mispricing)" />
        <KpiTile label="Last update" loading accent="var(--tmb-yes)" />
      </div>
      <Panel title="Markets · all categories" action={<span className="num text-[11px] text-fg-3">sorted by volume</span>}>
        <div className="grid grid-cols-[1fr_90px_80px_120px_100px_160px] items-center gap-3 border-b border-line px-3 py-2">
          {COLS.map((c) => (
            <span key={c} className="eyebrow">{c}</span>
          ))}
        </div>
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[1fr_90px_80px_120px_100px_160px] items-center gap-3 border-b border-line/60 px-3 py-2.5 last:border-0">
            <Skeleton className="h-3 rounded-sm bg-raised" style={{ width: `${[70, 55, 80, 62, 48, 74, 66, 58, 77][i]}%` }} />
            <Skeleton className="h-3 w-12 rounded-sm bg-raised" />
            <Skeleton className="h-3 w-9 rounded-sm bg-raised" />
            <Skeleton className="h-5 w-24 rounded-sm bg-raised" />
            <Skeleton className="h-3 w-14 rounded-sm bg-raised" />
            <Skeleton className="h-4 w-20 rounded-full bg-raised" />
          </div>
        ))}
        <div className="h-28">
          <EmptyState icon={Radar} title="Waiting for the market feed" hint="Markets from Kalshi and Polymarket appear here once the data layer is online." />
        </div>
      </Panel>
    </>
  );
}
