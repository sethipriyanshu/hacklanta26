import { Skeleton } from "@/components/ui/skeleton";
import { Panel, SkeletonLines } from "@/components/shell/Panel";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-2 h-3 w-40 rounded-sm bg-raised" />
      <Skeleton className="mb-5 h-7 w-48 rounded-sm bg-raised" />
      <Panel title="Contract under review" className="mb-3">
        <div className="flex items-center gap-4 p-3">
          <Skeleton className="h-4 w-80 rounded-sm bg-raised" />
          <Skeleton className="ml-auto h-7 w-16 rounded-sm bg-raised" />
        </div>
      </Panel>
      <div className="grid grid-cols-3 gap-3">
        {["var(--tmb-quant)", "var(--tmb-contrarian)", "var(--tmb-riskmgr)"].map((a) => (
          <Panel key={a} accent={a} className="min-h-[300px]">
            <div className="flex items-center gap-3 border-b border-line px-3 py-3">
              <Skeleton className="size-9 rounded-lg bg-raised" />
              <div className="flex-1">
                <Skeleton className="mb-1.5 h-3 w-28 rounded-sm bg-raised" />
                <Skeleton className="h-2.5 w-40 rounded-sm bg-raised" />
              </div>
            </div>
            <SkeletonLines n={5} />
          </Panel>
        ))}
      </div>
    </div>
  );
}
