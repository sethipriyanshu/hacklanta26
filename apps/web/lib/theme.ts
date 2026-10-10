/** Mirror of styles/tokens.css for code that cannot read CSS (canvas, charts). */
export type ThemeName = "dark" | "light" | "classic";

export const THEMES: ThemeName[] = ["dark", "light", "classic"];

export const TOKEN_NAMES = [
  "bg", "panel", "raised", "line", "fg", "fg-2", "fg-3",
  "yes", "no", "anomaly", "mispricing", "quant", "contrarian", "riskmgr",
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];

/** Static fallback used during SSR and tests; runtime reads the live CSS variable. */
export const DARK_TOKENS: Record<TokenName, string> = {
  bg: "#0b0d10", panel: "#12151a", raised: "#1a1e25", line: "#242a33",
  fg: "#e8eaed", "fg-2": "#9aa3ae", "fg-3": "#5f6b78",
  yes: "#3dd68c", no: "#ff5c6c", anomaly: "#ffb547", mispricing: "#5b8cff",
  quant: "#5b8cff", contrarian: "#c77dff", riskmgr: "#3dd68c",
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
