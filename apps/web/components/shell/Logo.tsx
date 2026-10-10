/** Brand mark: a receipt with a checkmark. "We show you the receipts." */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="tmb-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--tmb-anomaly)" />
          <stop offset="1" stopColor="var(--tmb-mispricing)" />
        </linearGradient>
      </defs>
      <path
        d="M8 3h16a1 1 0 0 1 1 1v24l-3-2-3 2-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1Z"
        fill="url(#tmb-g)"
        opacity="0.95"
      />
      <path d="M11 9h10M11 13h7" stroke="var(--tmb-bg)" strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
      <path d="M11.5 19.5l3 3 6-6.5" stroke="var(--tmb-bg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
