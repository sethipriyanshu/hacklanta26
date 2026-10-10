import { api, tryApi, type Schemas } from "@/lib/api";

export type Persona = Schemas["Persona"];
export type SimRun = Schemas["SimRun"];
export type Tick = Schemas["Tick"];
export type AgentState = Schemas["AgentState"];
export type SwarmConfig = Schemas["SwarmConfig"];
export type SimRequest = Partial<Schemas["SimRequest"]> & { marketId: string; headline: string };

export interface SimPreset {
  scenario: number;
  code: string;
  title: string;
  proves: string;
  marketId: string;
  marketTitle: string;
  headline: string;
  headlineAt: number;
  backtest: boolean;
  swarm: { infoSpeed: number; size: number };
  precomputed: boolean;
}

export const getPresets = () => tryApi<SimPreset[]>("/sim/presets");
export const getPersonas = () => tryApi<Persona[]>("/sim/personas");
export const getStoredRun = (name: string) => tryApi<SimRun>(`/sim/runs/${name}`, { timeoutMs: 15000 });
export const runSim = (req: SimRequest) => api<SimRun>("/sim/run", { method: "POST", body: JSON.stringify(req), timeoutMs: 60000 });
