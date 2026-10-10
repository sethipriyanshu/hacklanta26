import { Skeleton } from "@/components/ui/skeleton";
import { Panel, SkeletonLines } from "@/components/shell/Panel";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-2 h-3 w-40 rounded-sm bg-raised" />
      <Skeleton className="mb-5 h-7 w-32 rounded-sm bg-raised" />
      <div className="grid grid-cols-[1fr_340px] gap-3">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Panel key={i}>
              <div className="p-4">
                <div className="bg-dotgrid mb-4 h-20 rounded-md border border-line" />
                <Skeleton className="mb-2 h-3.5 w-32 rounded-sm bg-raised" />
                <Skeleton className="h-2.5 w-48 rounded-sm bg-raised" />
              </div>
            </Panel>
          ))}
        </div>
        <Panel title="Spot the Manipulation">
          <SkeletonLines n={6} />
        </Panel>
      </div>
    </div>
  );
}
