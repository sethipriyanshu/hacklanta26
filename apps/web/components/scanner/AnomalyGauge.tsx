/** The overall anomaly score: a number and one plain bar, nothing more. */
export function AnomalyGauge({ score }: { score: number; size?: number }) {
  const s = Math.max(0, Math.min(100, score));
  const label = s >= 70 ? "High" : s >= 40 ? "Flagged" : "Normal";
  return (
    <div className="flex flex-col gap-2.5 px-4 pt-4 pb-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="num text-[34px] leading-none font-medium text-fg">
          {Math.round(s)}
          <span className="text-[16px] font-normal text-fg-2">/100</span>
        </span>
        <span className={s >= 40 ? "font-display text-[16px] font-medium text-anomaly" : "font-display text-[16px] text-fg-2"}>{label}</span>
      </div>
      <div className="relative h-2 rounded-full bg-raised">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, s)}%`, background: s >= 40 ? "var(--tmb-anomaly)" : "var(--tmb-fg-3)" }} />
        <span aria-hidden className="absolute -inset-y-1 w-px bg-fg" style={{ left: "40%" }} title="Flag line: 40" />
      </div>
      <p className="type-small text-fg-2">Flagged at 40 and above.</p>
    </div>
  );
}
