import { API_URL, tryApi } from "@/lib/api";

export type PersonaId = "quant" | "contrarian" | "riskmgr";
export type Stance = "yes" | "no" | "pass";
/** The five-step risk scale used for 401(k) and target-date portfolios. */
export type RiskAppetite = "conservative" | "moderately_conservative" | "moderate" | "moderately_aggressive" | "aggressive";

export const RISK_PROFILES: { id: RiskAppetite; label: string; hint: string; cap: number }[] = [
  { id: "conservative", label: "Conservative", hint: "Protect what you have. Strictest vetoes.", cap: 0.05 },
  { id: "moderately_conservative", label: "Moderately conservative", hint: "Mostly safety, a little upside.", cap: 0.1 },
  { id: "moderate", label: "Moderate", hint: "Balanced between growth and safety.", cap: 0.2 },
  { id: "moderately_aggressive", label: "Moderately aggressive", hint: "Mostly growth, accepts swings.", cap: 0.35 },
  { id: "aggressive", label: "Aggressive", hint: "Maximum upside, loosest vetoes.", cap: 0.5 },
];
export const riskProfile = (id: RiskAppetite) => RISK_PROFILES.find((r) => r.id === id) ?? RISK_PROFILES[2];
export type SideInterest = "yes" | "no" | "unsure";

export interface Recommendation {
  marketId: string;
  title: string;
  eventTitle: string;
  venue: "kalshi" | "polymarket";
  category: string;
  yesPrice: number;
  volume24h: number;
  spread: number | null;
  closeTime: string | null;
  reasons: string[];
}

export interface Consensus {
  decision: Stance;
  belief: number;
  kellyFraction: number;
  weightedYes: number;
  weightedNo: number;
  vetoed: boolean;
  vetoReason: string | null;
  summary: string;
}

export const PERSONAS: Record<PersonaId, { label: string; tagline: string; accent: string; glyph: string }> = {
  quant: { label: "The Quant", tagline: "Base rates, spreads, arbitrage math.", accent: "var(--tmb-quant)", glyph: "Σ" },
  contrarian: { label: "The Contrarian", tagline: "Fades hype. Distrusts crowds.", accent: "var(--tmb-contrarian)", glyph: "↯" },
  riskmgr: { label: "The Risk Manager", tagline: "Liquidity, manipulation risk. Veto power.", accent: "var(--tmb-riskmgr)", glyph: "⌀" },
};

export const getRecommendations = (limit = 6) => tryApi<Recommendation[]>(`/desk/recommendations?limit=${limit}`);
export const debateStreamUrl = (marketId: string, risk: RiskAppetite, side: SideInterest) =>
  `${API_URL}/desk/debate/stream?market_id=${encodeURIComponent(marketId)}&risk=${risk}&side=${side}`;
