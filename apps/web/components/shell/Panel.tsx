import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function Panel({ title, action, className, children, accent }: { title?: React.ReactNode; action?: React.ReactNode; className?: string; children?: React.ReactNode; accent?: string }) {
  return (
    <section className={cn("relative flex min-h-0 flex-col overflow-hidden rounded-md border border-line bg-panel", className)}>
      {(title || action) && (
        <header className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2">
          <h2 className="flex items-center gap-2 eyebrow text-fg">
            {accent && <span aria-hidden className="size-2.5 rounded-full" style={{ background: accent }} />}
            {title}
          </h2>
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
      <Icon className="size-5 text-fg-3" />
      <p className="type-title text-fg">{title}</p>
      {hint && <p className="max-w-sm type-meta text-fg-2">{hint}</p>}
    </div>
  );
}
