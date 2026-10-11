import { cents, cents1, etAxis, etDay, etTime } from "@/lib/format";

type Pt = { ts: number; price: number };

/**
 * Price over time with the moment a signal fired pinned in its colour. With `compare`, the other venue's price
 * is drawn on the same scale and the gap between them is shaded. Draws only what it has: no fake history.
 */
export function ReceiptChart({
  points,
  onset,
  color = "var(--tmb-anomaly)",
  compare,
  labels,
  pinLabel = "fired",
  height = 148,
}: {
  points: Pt[];
  onset: number | null;
  color?: string;
  compare?: Pt[];
  labels?: [string, string];
  pinLabel?: string;
  height?: number;
}) {
  const W = 400;
  const H = height;
  const PAD = { t: 18, r: 44, b: 20, l: 4 };
  if (points.length < 2) {
    return (
      <div style={{ height }} className="grid place-items-center rounded-sm border border-dashed border-line type-small text-fg-2">
        No price history recorded for this market yet
      </div>
    );
  }
  const t0 = points[0].ts;
  const t1 = points[points.length - 1].ts;
  const cmp = (compare ?? []).filter((p) => p.ts >= t0 && p.ts <= t1);
  const all = [...points, ...cmp];
  const lo = Math.min(...all.map((p) => p.price));
  const hi = Math.max(...all.map((p) => p.price));
  // A flat market should look flat: give the scale at least 10¢ of room.
  const mid = (lo + hi) / 2;
  const span = Math.max(hi - lo, 0.1);
  const yMin = Math.max(0, mid - span / 2 - span * 0.1);
  const yMax = Math.min(1, mid + span / 2 + span * 0.1);
  const x = (ts: number) =>
    PAD.l + ((ts - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (p: number) =>
    PAD.t +
    (1 - (p - yMin) / Math.max(0.0001, yMax - yMin)) * (H - PAD.t - PAD.b);
  const path = (ps: Pt[]) =>
    ps
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${x(p.ts).toFixed(1)},${y(p.price).toFixed(1)}`,
      )
      .join(" ");
  const line = path(points);
  const cmpLine = cmp.length > 1 ? path(cmp) : null;
  const cmpLast = cmp.length > 1 ? cmp[cmp.length - 1] : null;
  // The gap band: down the first series, back along the other.
  const band = cmpLine
    ? `${line} ${[...cmp]
        .reverse()
        .map((p) => `L${x(p.ts).toFixed(1)},${y(p.price).toFixed(1)}`)
        .join(" ")} Z`
    : null;
  const area = `${line} L${x(t1).toFixed(1)},${H - PAD.b} L${x(t0).toFixed(1)},${H - PAD.b} Z`;
  const last = points[points.length - 1];
  const pin = onset != null && onset >= t0 && onset <= t1 ? onset : null;
  const pinPrice =
    pin != null
      ? points.reduce((a, b) =>
          Math.abs(b.ts - pin) < Math.abs(a.ts - pin) ? b : a,
        ).price
      : null;
  // Past a day, the hour alone repeats at both ends of the axis, so the date leads.
  const fmtT = (ts: number) => {
    const d = new Date(ts * 1000);
    return t1 - t0 > 20 * 3600 ? `${etDay(d)} ${etAxis(d)} ET` : etTime(d);
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="img"
      aria-label={`Price from ${cents1(points[0].price)} to ${cents1(last.price)}${pin ? `, ${pinLabel} ${fmtT(pin)}` : ""}`}
    >
      <defs>
        <linearGradient id="rc-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--tmb-fg)" stopOpacity="0.10" />
          <stop offset="1" stopColor="var(--tmb-fg)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[yMin, (yMin + yMax) / 2, yMax].map((v) => (
        <g key={v}>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--tmb-line)"
            strokeDasharray="2 4"
          />
          <text
            x={W - PAD.r + 6}
            y={y(v) + 3.5}
            className="num"
            fontSize="12"
            fill="var(--tmb-fg-2)"
          >
            {cents(v)}
          </text>
        </g>
      ))}
      {pin != null && (
        <rect
          x={x(pin)}
          y={PAD.t - 6}
          width={Math.max(0, x(t1) - x(pin))}
          height={H - PAD.t - PAD.b + 6}
          fill={color}
          opacity="0.08"
        />
      )}
      {band ? (
        <path d={band} fill={color} opacity="0.16" />
      ) : (
        <path d={area} fill="url(#rc-fill)" />
      )}
      {cmpLine && (
        <path
          d={cmpLine}
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          strokeDasharray="5 3"
          strokeLinejoin="round"
        />
      )}
      <path
        d={line}
        fill="none"
        stroke="var(--tmb-fg)"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(last.ts)} cy={y(last.price)} r="3" fill="var(--tmb-fg)" />
      {pin != null && pinPrice != null && (
        <g>
          <line
            x1={x(pin)}
            x2={x(pin)}
            y1={PAD.t - 6}
            y2={H - PAD.b}
            stroke={color}
            strokeWidth="1.5"
          />
          <circle
            cx={x(pin)}
            cy={y(pinPrice)}
            r="4.5"
            fill={color}
            stroke="var(--tmb-panel)"
            strokeWidth="2"
          />
          {/* Label sits beside the rule, never across it: left of the rule unless it would run off the plot. */}
          <text
            x={x(pin) > 150 ? x(pin) - 6 : x(pin) + 6}
            textAnchor={x(pin) > 150 ? "end" : "start"}
            y={H - PAD.b - 6}
            stroke="var(--tmb-bg)"
            strokeWidth="4"
            paintOrder="stroke"
            className="num"
            fontSize="12.5"
            fontWeight="600"
            fill={color}
          >
            {pinLabel} {fmtT(pin)}
          </text>
        </g>
      )}
      {cmpLast && (
        <g>
          {/* The live gap, bracketed between the two end quotes, inset from the pin rule so both stay readable. */}
          <line x1={x(t1) - 12} x2={x(t1) - 12} y1={y(last.price)} y2={y(cmpLast.price)} stroke={color} strokeWidth="1.5" />
          <line x1={x(t1) - 16} x2={x(t1) - 8} y1={y(last.price)} y2={y(last.price)} stroke={color} strokeWidth="1.5" />
          <line x1={x(t1) - 16} x2={x(t1) - 8} y1={y(cmpLast.price)} y2={y(cmpLast.price)} stroke={color} strokeWidth="1.5" />
          <text x={x(t1) - 20} y={(y(last.price) + y(cmpLast.price)) / 2 + 4} textAnchor="end" className="num" fontSize="12.5" fontWeight="600" fill={color} stroke="var(--tmb-bg)" strokeWidth="4" paintOrder="stroke">
            {(Math.abs(last.price - cmpLast.price) * 100).toFixed(1)}¢
          </text>
          <circle cx={x(cmpLast.ts)} cy={y(cmpLast.price)} r="3.5" fill="var(--tmb-bg)" stroke={color} strokeWidth="1.75" />
        </g>
      )}
      {cmpLine && labels && (
        <g className="num" fontSize="12">
          <line
            x1={PAD.l + 2}
            x2={PAD.l + 18}
            y1={8}
            y2={8}
            stroke="var(--tmb-fg)"
            strokeWidth="1.75"
          />
          <text x={PAD.l + 24} y={12} fill="var(--tmb-fg)">
            {labels[0]}
          </text>
          <line
            x1={PAD.l + 34 + labels[0].length * 7.4}
            x2={PAD.l + 50 + labels[0].length * 7.4}
            y1={8}
            y2={8}
            stroke={color}
            strokeWidth="1.75"
            strokeDasharray="5 3"
          />
          <text x={PAD.l + 56 + labels[0].length * 7.4} y={12} fill={color}>
            {labels[1]}
          </text>
        </g>
      )}
      <text
        x={PAD.l}
        y={H - 4}
        className="num"
        fontSize="12"
        fill="var(--tmb-fg-2)"
      >
        {fmtT(t0)}
      </text>
      <text
        x={W - PAD.r}
        y={H - 4}
        textAnchor="end"
        className="num"
        fontSize="12"
        fill="var(--tmb-fg-2)"
      >
        {fmtT(t1)}
      </text>
    </svg>
  );
}
