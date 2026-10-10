import { Skeleton } from "@/components/ui/skeleton";
import { KpiTile } from "@/components/shell/KpiTile";
import { Panel } from "@/components/shell/Panel";

export default function Loading() {
  return (
    <div>
      <div className="mb-4">
        <Skeleton className="mb-2 h-3 w-40 rounded-sm bg-raised" />
        <Skeleton className="h-7 w-56 rounded-sm bg-raised" />
      </div>
      <div className="mb-4 grid grid-cols-4 gap-3">
        {["Markets tracked", "Active flags", "Biggest cross-venue gap", "Last update"].map((l) => (
          <KpiTile key={l} label={l} loading />
        ))}
      </div>
      <Panel title="Markets">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[1fr_84px_72px_110px_92px_168px] items-center gap-3 border-b border-line/60 px-3 py-2.5 last:border-0">
            <Skeleton className="h-3 rounded-sm bg-raised" style={{ width: `${[70, 55, 80, 62, 48, 74, 66, 58, 77, 60][i]}%` }} />
            <Skeleton className="h-5 w-14 rounded-sm bg-raised" />
            <Skeleton className="h-3 w-9 rounded-sm bg-raised" />
            <Skeleton className="h-5 w-24 rounded-sm bg-raised" />
            <Skeleton className="h-3 w-14 rounded-sm bg-raised" />
            <Skeleton className="h-4 w-20 rounded-full bg-raised" />
          </div>
        ))}
      </Panel>
    </div>
  );
}
