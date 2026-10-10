import { Skeleton } from "@/components/ui/skeleton";
import { Panel, SkeletonLines } from "@/components/shell/Panel";

export default function Loading() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between">
        <div>
          <Skeleton className="mb-2 h-3 w-48 rounded-sm bg-raised" />
          <Skeleton className="h-7 w-[520px] rounded-sm bg-raised" />
          <Skeleton className="mt-2 h-3 w-64 rounded-sm bg-raised" />
        </div>
        <Skeleton className="h-10 w-24 rounded-sm bg-raised" />
      </div>
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-8 flex flex-col gap-3">
          <Panel title="Price">
            <div className="bg-dotgrid h-[340px]" />
          </Panel>
          <Panel title="Resolution rules">
            <SkeletonLines n={3} />
          </Panel>
        </div>
        <div className="col-span-4 flex flex-col gap-3">
          <Panel title="Anomaly score">
            <div className="flex justify-center py-4">
              <Skeleton className="h-20 w-36 rounded-t-full bg-raised" />
            </div>
            <SkeletonLines n={2} />
          </Panel>
          <Panel title="Cross-venue">
            <SkeletonLines n={3} />
          </Panel>
          <Panel title="Order book">
            <SkeletonLines n={4} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
