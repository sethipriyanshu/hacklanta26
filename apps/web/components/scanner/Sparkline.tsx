export function Sparkline({ points, width = 92, height = 24, className }: { points: number[]; width?: number; height?: number; className?: string }) {
  if (points.length < 2) return <span className="num text-[11px] text-fg-3">—</span>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 0.01;
  const step = width / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - 2 - ((p - min) / span) * (height - 4)).toFixed(1)}`).join(" ");
  const up = points[points.length - 1] >= points[0];
  const color = up ? "var(--tmb-yes)" : "var(--tmb-no)";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(points.length - 1) * step} cy={height - 2 - ((points[points.length - 1] - min) / span) * (height - 4)} r="1.8" fill={color} />
    </svg>
  );
}
