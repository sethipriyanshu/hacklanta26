import { Skeleton } from "@/components/ui/skeleton";

export function KpiTile({ label, value, sub, accent, loading }: { label: string; value?: string; sub?: string; accent?: string; loading?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-panel px-4 py-3">
      {accent && <span className="absolute top-0 left-0 h-full w-[3px]" style={{ background: accent }} />}
      <p className="eyebrow">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-24 rounded-sm bg-raised" />
      ) : (
        <p className="num mt-1 text-[26px] leading-none font-medium text-fg">{value}</p>
      )}
      <p className="mt-1.5 h-4 text-[11px] text-fg-3">{loading ? "" : sub}</p>
    </div>
  );
}
