import { Skeleton } from "@/components/ui/skeleton";
import { Panel, SkeletonLines } from "@/components/shell/Panel";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-2 h-3 w-40 rounded-sm bg-raised" />
      <Skeleton className="mb-5 h-7 w-56 rounded-sm bg-raised" />
      <div className="grid h-[calc(100dvh-13.5rem)] grid-cols-[300px_1fr] grid-rows-[1fr_200px] gap-3">
        <Panel title="Swarm controls" className="row-span-2">
          <SkeletonLines n={12} />
        </Panel>
        <Panel title="Swarm" accent="var(--tmb-contrarian)">
          <div className="bg-dotgrid h-full" />
        </Panel>
        <Panel title="Simulated price">
          <div className="h-full" />
        </Panel>
      </div>
    </div>
  );
}
