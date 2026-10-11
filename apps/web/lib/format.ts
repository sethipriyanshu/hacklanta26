/** Number formatting used everywhere so figures look identical across modules. */
export const cents = (p: number) => `${Math.round(p * 100)}¢`;
/** One-decimal cents: the Scanner quotes every price at the precision its receipts use. */
export const cents1 = (p: number) => `${(p * 100).toFixed(1)}¢`;
export const pct = (x: number, digits = 1) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`;
export const usd = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? `$${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(1)}K` : `$${a.toFixed(0)}`;
  return n < 0 ? `-${s}` : s;
};
export const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
