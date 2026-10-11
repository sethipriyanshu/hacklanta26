import { DotRow } from "@/components/dots/Dots";
import type { Finding } from "@/lib/findings";
import { cn } from "@/lib/utils";


/** The counted exhibit for a finding: rows of dots for volume, two hundred-grids for a gap. */
export function Exhibit({ f, size = 10, cols = 30, animate = false }: { f: Finding; size?: number; cols?: number; animate?: boolean }) {
  if (f.kind === "gap" && f.venues) {
    const { kalshi, poly, costCents, edgeCents } = f.venues;
    const gap = Math.abs(Math.round(kalshi * 100) - Math.round(poly * 100));
    const cost = Math.min(gap, Math.round(costCents));
    const edge = Math.max(0, Math.round(edgeCents));
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          <VenuePrice name="Kalshi" price={kalshi} color="var(--tmb-fg)" />
          <VenuePrice name="Polymarket" price={poly} color="var(--tmb-mispricing)" />
        </div>
        <ExhibitLine label="The gap" figure={`${gap}¢`} strong>
          <svg width={(gap * size * 1.4) || 1} height={size * 1.4} className="block max-w-full overflow-visible" role="img" aria-label={`${gap} cent gap: ${cost} cents of costs, ${edge} left`}>
            {Array.from({ length: gap }, (_, i) => (
              <circle key={i} cx={i * size * 1.4 + size * 0.7} cy={size * 0.7} r={size / 2} fill={i < cost ? "var(--tmb-dot)" : "var(--tmb-anomaly)"} className={animate ? "dot-in" : undefined} style={animate ? { animationDelay: `${i * 40}ms` } : undefined} />
            ))}
          </svg>
          <p className="mt-2 type-meta text-fg-2">
            Grey is eaten by spreads and fees ({cost}¢); ochre is what’s left ({edge}¢).
          </p>
        </ExhibitLine>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {f.unit > 1 && <p className="type-meta text-fg-2">Each dot here is {f.unitLabel}.</p>}
      {f.rows.map((r, i) => (
        <ExhibitLine key={r.label} label={r.label} figure={r.figure} strong={r.tone === "unusual"}>
          <DotRow count={r.count} tone={r.tone} size={size} cols={cols} animate={animate} delay={i * 260} span={1300} label={`${r.label}: ${r.figure}`} />
        </ExhibitLine>
      ))}
    </div>
  );
}

function VenuePrice({ name, price, color }: { name: string; price: number; color: string }) {
  return (
    <p className="flex items-baseline gap-2.5 font-display">
      <span aria-hidden className="size-3 self-center rounded-full" style={{ background: color }} />
      <span className="text-[17px] text-fg-2">{name}</span>
      <span className="num text-[30px] leading-none font-medium text-fg">{Math.round(price * 100)}¢</span>
    </p>
  );
}

function ExhibitLine({ label, figure, strong, children }: { label: string; figure: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(7.5rem,9rem)_1fr] items-start gap-x-5 gap-y-1.5">
      <span className={cn("pt-px font-display text-[15px] leading-tight", strong ? "font-medium text-fg" : "text-fg-2")}>
        {label}
        <span className="num mt-0.5 block text-[15px] text-fg-2">{figure}</span>
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
