import { api, tryApi, type Schemas } from "@/lib/api";

export type Persona = Schemas["Persona"];
export type SimRun = Schemas["SimRun"];
export type Tick = Schemas["Tick"];
export type AgentState = Schemas["AgentState"];
export type SwarmConfig = Schemas["SwarmConfig"];
export type SimRequest = Partial<Schemas["SimRequest"]> & { marketId: string; headline: string };


export const getPersonas = () => tryApi<Persona[]>("/sim/personas");
export const runSim = (req: SimRequest) => api<SimRun>("/sim/run", { method: "POST", body: JSON.stringify(req), timeoutMs: 60000 });

export interface RunSummary {
  summary: string;
  takeaway: string;
  source: "llm" | "template";
}
export type RunSummaryRequest = {
  marketTitle: string;
  headline: string;
  startPrice: number;
  endPrice: number;
  settleMinutes: number | null;
  tradedUsd: number;
  lowerShare: number;
  higherShare: number;
  unheardShare: number;
  groups: { label: string; agents: number; meanBelief: number; bet: number; minutes: number | null }[];
};
export const getRunSummary = (req: RunSummaryRequest) => tryApi<RunSummary>("/sim/summary", { method: "POST", body: JSON.stringify(req), timeoutMs: 30000 });
