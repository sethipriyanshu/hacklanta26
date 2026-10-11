import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors LearnHome: a progress card and two game cards, then three path columns. */
export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-2 h-7 w-32 rounded-sm bg-raised" />
      <Skeleton className="mb-5 h-3 w-96 max-w-full rounded-sm bg-raised" />
      <div className="mb-8 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`h-40 rounded-md border border-line bg-panel ${i === 0 ? "md:col-span-2 xl:col-span-1" : ""}`} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-md border border-line bg-panel">
            <div className="border-b border-line px-5 py-4">
              <Skeleton className="mb-2 h-4 w-28 rounded-sm bg-raised" />
              <Skeleton className="h-3 w-56 rounded-sm bg-raised" />
            </div>
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="flex gap-3 border-b border-line/60 px-5 py-3.5 last:border-0">
                <Skeleton className="size-5 shrink-0 rounded-full bg-raised" />
                <div className="flex-1">
                  <Skeleton className="mb-1.5 h-3.5 w-40 rounded-sm bg-raised" />
                  <Skeleton className="h-3 w-full rounded-sm bg-raised" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
