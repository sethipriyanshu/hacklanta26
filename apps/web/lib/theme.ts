/** Mirror of styles/tokens.css for code that cannot read CSS (canvas, charts). */
export type ThemeName = "dark";

export const THEMES: ThemeName[] = ["dark"];

export const TOKEN_NAMES = [
  "bg", "panel", "raised", "line", "fg", "fg-2", "fg-3",
  "yes", "no", "anomaly", "mispricing", "quant", "contrarian", "riskmgr", "dot",
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];

/** Static fallback used during SSR and tests; runtime reads the live CSS variable. */
export const DARK_TOKENS: Record<TokenName, string> = {
  bg: "#0b0d11", panel: "#14171c", raised: "#1d2127", line: "#262a31",
  fg: "#eef0f3", "fg-2": "#a3a9b3", "fg-3": "#868c96",
  yes: "#34d399", no: "#ff5f6d", anomaly: "#f5b83d", mispricing: "#5b8aff",
  quant: "#5b8aff", contrarian: "#ae88ff", riskmgr: "#34d399", dot: "#2b3037",
};

/** Read a token from the live document so canvas/chart code follows theme switches. */
export function token(name: TokenName): string {
  if (typeof window === "undefined") return DARK_TOKENS[name];
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--tmb-${name}`).trim();
  return v || DARK_TOKENS[name];
}

export function readTokens(): Record<TokenName, string> {
  return Object.fromEntries(TOKEN_NAMES.map((n) => [n, token(n)])) as Record<TokenName, string>;
}
