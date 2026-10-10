import { API_URL, tryApi } from "@/lib/api";

export type PersonaId = "quant" | "contrarian" | "riskmgr";
export type Stance = "yes" | "no" | "pass";

export interface DeskProfile {
  id: string;
  name: string;
  tier: string;
  monthlyIncome: number;
  fixedCosts: number;
  discretionary: number;
  holdings: { label: string; value: number }[];
  riskTolerance: number;
  accent: string;
  bio: string;
  riskBudget: number;
}

export interface Consensus {
  decision: Stance;
  sizeUsd: number;
  riskBudget: number;
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
  riskmgr: { label: "The Risk Manager", tagline: "Sizing. Veto power. Says no.", accent: "var(--tmb-riskmgr)", glyph: "⌀" },
};

export const getDeskProfiles = () => tryApi<DeskProfile[]>("/desk/profiles");
export const debateStreamUrl = (marketId: string, profileId: string) => `${API_URL}/desk/debate/stream?market_id=${encodeURIComponent(marketId)}&profile_id=${encodeURIComponent(profileId)}`;
