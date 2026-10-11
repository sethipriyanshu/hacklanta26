import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <Skeleton className="h-7 w-36 rounded-sm bg-raised" />
          <Skeleton className="mt-2 h-4 w-96 rounded-sm bg-raised" />
        </div>
        <Skeleton className="h-10 w-80 rounded-sm bg-raised" />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)]">
        <div className="overflow-hidden border-t border-line">
          <div className="border-b border-line px-3 py-2.5">
            <Skeleton className="h-8 w-full rounded-sm bg-raised" />
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[112px_1fr_76px_84px_92px] items-center gap-3 border-b border-line/60 px-3 py-3 last:border-0">
              <Skeleton className="h-5 w-9 rounded-sm bg-raised" />
              <Skeleton className="h-3.5 rounded-sm bg-raised" style={{ width: `${[70, 55, 80, 62, 48, 74, 66, 58, 77, 60][i]}%` }} />
              <Skeleton className="ml-auto h-3.5 w-9 rounded-sm bg-raised" />
              <Skeleton className="ml-auto h-3.5 w-12 rounded-sm bg-raised" />
              <Skeleton className="ml-auto h-3.5 w-14 rounded-sm bg-raised" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4 border-l border-line p-6">
          <Skeleton className="h-5 w-3/4 rounded-sm bg-raised" />
          <Skeleton className="h-16 w-40 rounded-sm bg-raised" />
          <Skeleton className="h-[148px] w-full rounded-sm bg-raised" />
          <Skeleton className="h-12 w-full rounded-sm bg-raised" />
        </div>
      </div>
    </div>
  );
}
