/** Small inline SVG illustrations per concept, drawn with theme tokens so they follow light/dark/classic. */
export function ConceptIllustration({ id, accent }: { id: string; accent: string }) {
  const common = { fill: "none", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "implied-probability":
      return (
        <svg viewBox="0 0 160 64" className="h-full w-full" aria-hidden="true">
          <rect x="12" y="22" width="136" height="20" rx="10" fill="var(--tmb-raised)" />
          <rect x="12" y="22" width="84" height="20" rx="10" fill={accent} opacity="0.85" />
          <text x="54" y="36" fontSize="11" fontFamily="var(--font-geist-mono)" fill="var(--tmb-bg)" textAnchor="middle">62¢</text>
          <text x="122" y="36" fontSize="11" fontFamily="var(--font-geist-mono)" fill="var(--tmb-fg-2)" textAnchor="middle">38¢</text>
        </svg>
      );
    case "spread-vig":
      return (
        <svg viewBox="0 0 160 64" className="h-full w-full" aria-hidden="true">
          <line x1="20" y1="32" x2="140" y2="32" stroke="var(--tmb-line)" strokeWidth="2" />
          <line x1="62" y1="18" x2="62" y2="46" stroke="var(--tmb-yes)" strokeWidth="3" />
          <line x1="98" y1="18" x2="98" y2="46" stroke="var(--tmb-no)" strokeWidth="3" />
          <path d="M66 32 H94" stroke={accent} strokeWidth="2" strokeDasharray="3 3" />
          <text x="80" y="14" fontSize="9" fontFamily="var(--font-geist-mono)" fill={accent} textAnchor="middle">spread</text>
          <text x="62" y="58" fontSize="9" fontFamily="var(--font-geist-mono)" fill="var(--tmb-fg-3)" textAnchor="middle">bid</text>
          <text x="98" y="58" fontSize="9" fontFamily="var(--font-geist-mono)" fill="var(--tmb-fg-3)" textAnchor="middle">ask</text>
        </svg>
      );
    case "liquidity":
      return (
        <svg viewBox="0 0 160 64" className="h-full w-full" aria-hidden="true">
          {[6, 14, 30, 48, 26, 12, 8].map((h, i) => (
            <rect key={i} x={22 + i * 17} y={52 - h} width="11" height={h} rx="2" fill={i < 3 ? "var(--tmb-yes)" : "var(--tmb-no)"} opacity={0.35 + (h / 48) * 0.6} />
          ))}
          <path d="M20 54 H142" stroke="var(--tmb-line)" strokeWidth="2" />
          <circle cx="73" cy="16" r="4" fill={accent} />
        </svg>
      );
    case "wash-trading":
      return (
        <svg viewBox="0 0 160 64" className="h-full w-full" aria-hidden="true">
          {Array.from({ length: 14 }).map((_, i) => (
            <rect key={i} x={14 + i * 9.6} y={i > 4 && i < 10 ? 30 : 46} width="6" height={i > 4 && i < 10 ? 20 : 4} rx="1" fill={accent} opacity={i > 4 && i < 10 ? 0.8 : 0.35} />
          ))}
          <path d="M14 20 C 40 21, 70 19, 100 20 S 130 21, 146 20" stroke="var(--tmb-fg)" {...common} />
        </svg>
      );
    case "anomaly-patterns":
      return (
        <svg viewBox="0 0 160 64" className="h-full w-full" aria-hidden="true">
          <path d="M14 50 H70 C 80 50, 84 44, 88 36 S 96 14, 104 12 H146" stroke={accent} {...common} />
          <line x1="122" y1="8" x2="122" y2="56" stroke="var(--tmb-mispricing)" strokeWidth="1.5" strokeDasharray="3 3" />
          <text x="122" y="62" fontSize="8" fontFamily="var(--font-geist-mono)" fill="var(--tmb-mispricing)" textAnchor="middle">headline</text>
          <circle cx="86" cy="40" r="3.5" fill={accent} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 160 64" className="h-full w-full" aria-hidden="true">
          <rect x="18" y="14" width="52" height="36" rx="6" fill="var(--tmb-raised)" />
          <rect x="90" y="14" width="52" height="36" rx="6" fill="var(--tmb-raised)" />
          <text x="44" y="36" fontSize="12" fontFamily="var(--font-geist-mono)" fill="var(--tmb-yes)" textAnchor="middle">9¢</text>
          <text x="116" y="36" fontSize="12" fontFamily="var(--font-geist-mono)" fill="var(--tmb-mispricing)" textAnchor="middle">13¢</text>
          <path d="M72 32 H88" stroke={accent} strokeWidth="2" markerEnd="url(#a)" />
          <text x="80" y="24" fontSize="8" fontFamily="var(--font-geist-mono)" fill={accent} textAnchor="middle">4¢</text>
        </svg>
      );
  }
}
