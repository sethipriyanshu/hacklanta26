/** Small inline SVG diagrams, one per module, drawn with theme tokens. */
const F = "var(--font-jost)";
const common = { fill: "none", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function T({ x, y, children, fill = "var(--tmb-fg-3)", size = 9, anchor = "middle" }: { x: number; y: number; children: React.ReactNode; fill?: string; size?: number; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} fontSize={size} fontFamily={F} fill={fill} textAnchor={anchor}>
      {children}
    </text>
  );
}

export function ConceptIllustration({ id, accent }: { id: string; accent: string }) {
  const svg = (children: React.ReactNode) => (
    <svg viewBox="0 0 160 64" className="h-full w-full" aria-hidden="true">
      {children}
    </svg>
  );
  switch (id) {
    case "implied-probability":
      return svg(
        <>
          <rect x="12" y="22" width="136" height="20" rx="10" fill="var(--tmb-raised)" />
          <rect x="12" y="22" width="84" height="20" rx="10" fill={accent} opacity="0.85" />
          <T x={54} y={36} size={11} fill="var(--tmb-bg)">62¢ = 62%</T>
          <T x={122} y={36} size={11} fill="var(--tmb-fg-2)">38¢</T>
        </>,
      );
    case "spread-vig":
      return svg(
        <>
          <line x1="20" y1="32" x2="140" y2="32" stroke="var(--tmb-line)" strokeWidth="2" />
          <line x1="62" y1="18" x2="62" y2="46" stroke="var(--tmb-yes)" strokeWidth="3" />
          <line x1="98" y1="18" x2="98" y2="46" stroke="var(--tmb-no)" strokeWidth="3" />
          <path d="M66 32 H94" stroke={accent} strokeWidth="2" strokeDasharray="3 3" />
          <T x={80} y={14} fill={accent}>spread</T>
          <T x={62} y={58}>bid</T>
          <T x={98} y={58}>ask</T>
        </>,
      );
    case "fine-print":
      return svg(
        <>
          <rect x="44" y="6" width="72" height="52" rx="4" fill="var(--tmb-raised)" />
          {[14, 21, 28, 35, 42, 49].map((y, i) => (
            <rect key={y} x="52" y={y} width={i === 3 ? 56 : i % 2 ? 50 : 44} height="3" rx="1.5" fill={i === 3 ? accent : "var(--tmb-fg-3)"} opacity={i === 3 ? 0.95 : 0.4} />
          ))}
          <circle cx="104" cy="37" r="10" stroke={accent} {...common} />
          <path d="M111 44 L120 53" stroke={accent} {...common} strokeWidth={3} />
        </>,
      );
    case "base-rates":
      return svg(
        <>
          {Array.from({ length: 20 }).map((_, i) => (
            <circle key={i} cx={22 + (i % 10) * 13} cy={i < 10 ? 22 : 40} r="4.5" fill={i < 3 ? accent : "var(--tmb-raised)"} />
          ))}
          <T x={80} y={60} fill="var(--tmb-fg-2)">3 in 20 times before</T>
        </>,
      );
    case "liquidity":
      return svg(
        <>
          {[6, 14, 30, 48, 26, 12, 8].map((h, i) => (
            <rect key={i} x={22 + i * 17} y={52 - h} width="11" height={h} rx="2" fill={i < 3 ? "var(--tmb-yes)" : "var(--tmb-no)"} opacity={0.35 + (h / 48) * 0.6} />
          ))}
          <path d="M20 54 H142" stroke="var(--tmb-line)" strokeWidth="2" />
        </>,
      );
    case "fees":
      return svg(
        <>
          <rect x="16" y="20" width="96" height="22" rx="4" fill="var(--tmb-raised)" />
          <rect x="112" y="20" width="14" height="22" fill={accent} opacity="0.85" />
          <rect x="126" y="20" width="18" height="22" rx="4" fill="var(--tmb-no)" opacity="0.5" />
          <T x={64} y={35} size={10} fill="var(--tmb-fg-2)">price</T>
          <T x={119} y={56} fill={accent}>fee</T>
          <T x={136} y={14} fill="var(--tmb-no)">spread</T>
        </>,
      );
    case "order-types":
      return svg(
        <>
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x="18" y={10 + i * 12} width={58 - i * 10} height="8" rx="2" fill="var(--tmb-no)" opacity={0.85 - i * 0.15} />
          ))}
          <path d="M82 14 H96" stroke="var(--tmb-fg)" {...common} />
          <T x={100} y={17} anchor="start" fill="var(--tmb-fg)">market: fills now</T>
          <path d="M82 46 H96" stroke={accent} {...common} strokeDasharray="3 3" />
          <T x={100} y={49} anchor="start" fill={accent}>limit: waits</T>
        </>,
      );
    case "sizing":
      return svg(
        <>
          <circle cx="40" cy="32" r="22" fill="var(--tmb-raised)" />
          <path d="M40 32 L40 10 A22 22 0 0 1 59 21 Z" fill={accent} opacity="0.9" />
          <T x={92} y={28} anchor="start" size={11} fill="var(--tmb-fg)">½ Kelly</T>
          <T x={92} y={42} anchor="start" fill="var(--tmb-fg-2)">a slice, not the pie</T>
        </>,
      );
    case "time-lockup":
      return svg(
        <>
          <path d="M16 40 H144" stroke="var(--tmb-line)" strokeWidth="2" />
          <circle cx="20" cy="40" r="4" fill="var(--tmb-fg)" />
          <circle cx="140" cy="40" r="4" fill={accent} />
          <path d="M24 30 C 60 12, 100 12, 136 30" stroke={accent} {...common} strokeDasharray="3 4" />
          <T x={20} y={56}>95¢ today</T>
          <T x={140} y={56} fill={accent}>$1 in 2 yrs</T>
          <T x={80} y={14} fill="var(--tmb-fg-2)">≈2.6% a year</T>
        </>,
      );
    case "anomaly-patterns":
      return svg(
        <>
          <path d="M14 50 H70 C 80 50, 84 44, 88 36 S 96 14, 104 12 H146" stroke={accent} {...common} />
          <line x1="122" y1="8" x2="122" y2="56" stroke="var(--tmb-mispricing)" strokeWidth="1.5" strokeDasharray="3 3" />
          <T x={122} y={62} size={8} fill="var(--tmb-mispricing)">headline</T>
          <circle cx="86" cy="40" r="3.5" fill={accent} />
        </>,
      );
    case "news-moves":
      return svg(
        <>
          <line x1="58" y1="6" x2="58" y2="56" stroke="var(--tmb-mispricing)" strokeWidth="1.5" strokeDasharray="3 3" />
          <path d="M12 44 H58 L64 18 C 74 22, 90 26, 148 24" stroke={accent} {...common} />
          <T x={58} y={63} size={8} fill="var(--tmb-mispricing)">news</T>
          <T x={110} y={16} fill="var(--tmb-fg-2)">jumps, then settles</T>
        </>,
      );
    case "wash-trading":
      return svg(
        <>
          {Array.from({ length: 14 }).map((_, i) => (
            <rect key={i} x={14 + i * 9.6} y={i > 4 && i < 10 ? 30 : 46} width="6" height={i > 4 && i < 10 ? 20 : 4} rx="1" fill={accent} opacity={i > 4 && i < 10 ? 0.8 : 0.35} />
          ))}
          <path d="M14 20 C 40 21, 70 19, 100 20 S 130 21, 146 20" stroke="var(--tmb-fg)" {...common} />
        </>,
      );
    case "cross-venue-arbitrage":
      return svg(
        <>
          <rect x="18" y="14" width="52" height="36" rx="6" fill="var(--tmb-raised)" />
          <rect x="90" y="14" width="52" height="36" rx="6" fill="var(--tmb-raised)" />
          <T x={44} y={36} size={12} fill="var(--tmb-fg)">41¢</T>
          <T x={116} y={36} size={12} fill="var(--tmb-mispricing)">46¢</T>
          <path d="M72 32 H88" stroke={accent} strokeWidth="2" />
          <T x={80} y={26} size={8} fill={accent}>5¢</T>
          <T x={44} y={60}>Kalshi</T>
          <T x={116} y={60}>Polymarket</T>
        </>,
      );
    case "in-play":
      return svg(
        <>
          <path d="M12 36 L24 30 L32 40 L44 20 L54 44 L66 26 L78 38 L90 14 L102 46 L114 28 L126 34 L148 22" stroke={accent} {...common} />
          <circle cx="146" cy="10" r="3.5" fill="var(--tmb-no)" />
          <T x={140} y={13} anchor="end" size={8} fill="var(--tmb-no)">LIVE</T>
          <T x={80} y={60} fill="var(--tmb-fg-2)">every play moves it</T>
        </>,
      );
    case "outcome-sets":
      return svg(
        <>
          {[44, 26, 18, 9, 6].map((w, i) => (
            <rect key={i} x="16" y={8 + i * 10} width={w * 2} height="7" rx="2" fill={i === 0 ? accent : "var(--tmb-fg-3)"} opacity={i === 0 ? 0.9 : 0.5} />
          ))}
          <T x={146} y={30} anchor="end" size={13} fill="var(--tmb-fg)">103%</T>
          <T x={146} y={44} anchor="end">sum of all</T>
        </>,
      );
    default:
      return svg(<rect x="18" y="14" width="124" height="36" rx="6" fill="var(--tmb-raised)" />);
  }
}
