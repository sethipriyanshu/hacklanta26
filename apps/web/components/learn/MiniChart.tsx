export function MiniChart({ price, volume, headlineIndex, highlight }: { price: number[]; volume: number[]; headlineIndex?: number | null; highlight?: "good" | "bad" | null }) {
  const w = 300;
  const h = 150;
  const padB = 34;
  const min = Math.min(...price);
  const max = Math.max(...price);
  const span = Math.max(max - min, 0.2); // never zoom into noise: a flat market must look flat
  const step = w / Math.max(1, price.length - 1);
  const d = price.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - padB - 6 - ((p - min) / span) * (h - padB - 16)).toFixed(1)}`).join(" ");
  const color = highlight === "bad" ? "var(--tmb-anomaly)" : highlight === "good" ? "var(--tmb-fg-3)" : "var(--tmb-fg)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
      {volume.map((v, i) => (
        <rect key={i} x={i * step - step * 0.35} y={h - 4 - v * (padB - 8)} width={Math.max(1, step * 0.7)} height={v * (padB - 8)} fill="var(--tmb-fg-3)" opacity="0.5" />
      ))}
      <line x1="0" y1={h - padB} x2={w} y2={h - padB} stroke="var(--tmb-line)" />
      {headlineIndex != null && highlight === "bad" && <line x1={headlineIndex * step} y1="4" x2={headlineIndex * step} y2={h - padB} stroke="var(--tmb-mispricing)" strokeDasharray="3 3" />}
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
