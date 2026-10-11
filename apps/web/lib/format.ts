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

/** Every time in the product is US Eastern (the venues' home zone), labelled ET, so server and browser agree. */
const ET = "America/New_York";
const toDate = (t: number | string | Date) => (t instanceof Date ? t : typeof t === "number" ? new Date(t < 1e12 ? t * 1000 : t) : new Date(t));
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...o, timeZone: ET });
const F_TIME = fmt({ hour: "numeric", minute: "2-digit" });
const F_DAY = fmt({ month: "short", day: "numeric" });
/** "3:42 PM ET" (unix seconds, ms, ISO string or Date). */
export const etTime = (t: number | string | Date) => `${F_TIME.format(toDate(t))} ET`;
/** "Oct 10". */
export const etDay = (t: number | string | Date) => F_DAY.format(toDate(t));
/** "Oct 10, 3:42 PM ET". */
export const etDateTime = (t: number | string | Date) => `${etDay(t)}, ${etTime(t)}`;
/** Compact axis label without the zone: "3:42 PM" or, across days, "Oct 10 3 PM". */
export const etAxis = (t: number | string | Date, withDay = false) => {
  const d = toDate(t);
  return withDay ? `${F_DAY.format(d)} ${fmt({ hour: "numeric" }).format(d)}` : F_TIME.format(d);
};
