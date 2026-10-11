/** Isotype counting: quantities drawn as rows of identical dots, read like a sentence.
 *  A fractional count draws its last dot cut, never rounded up. Pure SVG, server-renderable. */
import { cn } from "@/lib/utils";

export type DotTone = "base" | "unusual" | "yes" | "no" | "venue2" | "empty";

export const TONE: Record<DotTone, string> = {
  base: "var(--tmb-fg)",
  unusual: "var(--tmb-anomaly)",
  yes: "var(--tmb-yes)",
  no: "var(--tmb-no)",
  venue2: "var(--tmb-mispricing)",
  empty: "var(--tmb-dot)",
};

interface DotRowProps {
  count: number;
  tone?: DotTone;
  /** Dots per line before wrapping. */
  cols?: number;
  /** Dot diameter in px; spacing follows from it. */
  size?: number;
  /** Count-in animation: dots appear in reading order, starting after `delay` ms. */
  animate?: boolean;
  delay?: number;
  /** Total time the count-in may take, however many dots there are. */
  span?: number;
  label: string;
  className?: string;
}

export function DotRow({ count, tone = "base", cols = 30, size = 10, animate = false, delay = 0, span = 900, label, className }: DotRowProps) {
  const whole = Math.floor(count);
  const frac = count - whole;
  const n = whole + (frac > 0.001 ? 1 : 0);
  const pitch = size * 1.4;
  const r = size / 2;
  const lineCount = Math.max(1, Math.ceil(n / cols));
  const width = Math.min(n, cols) * pitch;
  const height = lineCount * pitch;
  const step = n > 1 ? Math.min(28, span / n) : 0;
  const color = TONE[tone];
  const id = `cut-${Math.round(count * 1000)}-${tone}`;
  return (
    <svg role="img" aria-label={label} width={Math.max(width, pitch)} height={height} viewBox={`0 0 ${Math.max(width, pitch)} ${height}`} className={cn("block max-w-full overflow-visible", className)}>
      {frac > 0.001 && (
        <defs>
          <clipPath id={id}>
            <rect x={(whole % cols) * pitch + pitch / 2 - r} y={Math.floor(whole / cols) * pitch} width={size * frac} height={pitch} />
          </clipPath>
        </defs>
      )}
      {Array.from({ length: n }, (_, i) => {
        const cx = (i % cols) * pitch + pitch / 2;
        const cy = Math.floor(i / cols) * pitch + pitch / 2;
        const isCut = i === whole && frac > 0.001;
        return (
          <g key={i}>
            {isCut && <circle cx={cx} cy={cy} r={r - 0.5} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={1} />}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={color}
              clipPath={isCut ? `url(#${id})` : undefined}
              className={animate ? "dot-in" : undefined}
              style={animate ? { animationDelay: `${Math.round(delay + i * step)}ms` } : undefined}
            />
          </g>
        );
      })}
    </svg>
  );
}

interface HundredGridProps {
  /** Chance as 0..1; fills round(value*100) dots of the hundred. */
  value: number;
  tone?: DotTone;
  /** Dots from this index up to `value` are drawn in the highlight tone (a gap between two grids). */
  highlightFrom?: number;
  size?: number;
  animate?: boolean;
  delay?: number;
  label: string;
  className?: string;
}

/** A hundred dots, one $1 contract: the filled dots are the chance the market gives. */
export function HundredGrid({ value, tone = "base", highlightFrom, size = 9, animate = false, delay = 0, label, className }: HundredGridProps) {
  const filled = Math.max(0, Math.min(100, Math.round(value * 100)));
  const pitch = size * 1.45;
  const r = size / 2;
  const side = pitch * 10;
  return (
    <svg role="img" aria-label={label} width={side} height={side} viewBox={`0 0 ${side} ${side}`} className={cn("block", className)}>
      {Array.from({ length: 100 }, (_, i) => {
        const cx = (i % 10) * pitch + pitch / 2;
        const cy = Math.floor(i / 10) * pitch + pitch / 2;
        const on = i < filled;
        const hl = on && highlightFrom !== undefined && i >= highlightFrom;
        const fill = hl ? TONE.unusual : on ? TONE[tone] : TONE.empty;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill={fill}
            className={animate && on ? "dot-in" : undefined}
            style={animate && on ? { animationDelay: `${Math.round(delay + i * 7)}ms` } : undefined}
          />
        );
      })}
    </svg>
  );
}

/** A single key swatch for legends. */
export function KeyDot({ tone, size = 12, cut = false }: { tone: DotTone; size?: number; cut?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className="shrink-0">
      {cut ? (
        <>
          <circle cx="6" cy="6" r="5.5" fill="none" stroke={TONE[tone]} strokeOpacity={0.35} />
          <path d="M6 0.5 A5.5 5.5 0 0 0 6 11.5 Z" fill={TONE[tone]} />
        </>
      ) : (
        <circle cx="6" cy="6" r="6" fill={TONE[tone]} />
      )}
    </svg>
  );
}
