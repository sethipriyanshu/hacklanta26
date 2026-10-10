import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function Panel({ title, action, className, children, accent }: { title?: string; action?: React.ReactNode; className?: string; children?: React.ReactNode; accent?: string }) {
  return (
    <section className={cn("relative flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-panel", className)}>
      {accent && <span className="absolute inset-x-0 top-0 h-px opacity-70" style={{ background: `linear-gradient(90deg, ${accent}, transparent 60%)` }} />}
      {(title || action) && (
        <header className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
          <h2 className="eyebrow">{title}</h2>
          {action}
        </header>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

export function SkeletonLines({ n = 4, className }: { n?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2.5 p-3", className)}>
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className="h-3 rounded-sm bg-raised" style={{ width: `${[92, 70, 84, 55, 76, 64][i % 6]}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint }: { icon: React.ComponentType<{ className?: string }>; title: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <span className="grid size-10 place-items-center rounded-lg border border-line bg-raised text-fg-3">
        <Icon className="size-4" />
      </span>
      <p className="text-sm text-fg-2">{title}</p>
      {hint && <p className="max-w-xs text-[12px] leading-snug text-fg-3">{hint}</p>}
    </div>
  );
}
