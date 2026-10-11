/** Brand mark: nine counted dots, one of them out of line. Finding that dot is the whole product. */
export function Logo({ className }: { className?: string }) {
  const dots = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => ({ r, c })));
  return (
    <svg viewBox="0 0 30 30" className={className} aria-hidden="true">
      {dots.map(({ r, c }) => {
        const odd = r === 0 && c === 2;
        return <circle key={`${r}${c}`} cx={5 + c * 10} cy={5 + r * 10} r={odd ? 4.6 : 3.6} fill={odd ? "var(--tmb-anomaly)" : "var(--tmb-fg)"} />;
      })}
    </svg>
  );
}
