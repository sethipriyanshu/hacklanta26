import { tryApi } from "@/lib/api";

export interface Concept {
  id: string;
  title: string;
  accent: string;
  signalTypes: string[];
  blurb: string;
  body: string[];
  example: string;
}
export interface GameChart {
  kind: "real" | "synthetic";
  label: string;
  series: { price: number[]; volume: number[] };
  headlineIndex: number | null;
  reveal: string;
}
export interface GameRound {
  index: number;
  charts: GameChart[];
  answer: number;
  explanation: string;
  concept: string;
}
export const getConcepts = () => tryApi<Concept[]>("/learn/concepts");
export const getGame = (seed: number) => tryApi<{ seed: number; rounds: GameRound[] }>(`/learn/game?seed=${seed}`);
