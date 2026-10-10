/** Mock user profiles. Fictional people; the Analyst Desk sizes positions against these. */
export interface Profile {
  id: string;
  name: string;
  tier: string;
  monthlyIncome: number;
  fixedCosts: number;
  discretionary: number;
  riskTolerance: number; // 0.5 .. 1.5
  accent: string; // css color expression
}

export const PROFILES: Profile[] = [
  { id: "student", name: "Sam", tier: "Student · tight budget", monthlyIncome: 1400, fixedCosts: 1250, discretionary: 150, riskTolerance: 0.6, accent: "var(--tmb-riskmgr)" },
  { id: "saver", name: "Maya", tier: "Mid-career saver", monthlyIncome: 7200, fixedCosts: 4600, discretionary: 2600, riskTolerance: 1.0, accent: "var(--tmb-quant)" },
  { id: "whale", name: "Jordan", tier: "High income · risk-taker", monthlyIncome: 24000, fixedCosts: 9000, discretionary: 15000, riskTolerance: 1.5, accent: "var(--tmb-contrarian)" },
];

/** 5% of discretionary, scaled by tolerance, never negative. Mirrors engines/consensus.py. */
export function riskBudget(p: Profile): number {
  if (p.discretionary <= 0) return 0;
  return Math.round(p.discretionary * 0.05 * p.riskTolerance);
}
