import { tryApi } from "@/lib/api";

export type Track = "basics" | "trading" | "signals";
export type LiveKind = "liquid" | "spread" | "book" | "flagged" | "gap" | "rules" | "long_dated" | "live_game" | "outcome_set";
export type Widget = "fees" | "stake" | "lockup";

export interface QuizItem {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export interface Concept {
  id: string;
  title: string;
  track: Track;
  accent: string;
  signalTypes: string[];
  blurb: string;
  body: string[];
  example: string;
  live: LiveKind | null;
  widget: Widget | null;
  quiz: QuizItem[];
}

export const TRACKS: { id: Track; label: string; blurb: string }[] = [
  { id: "basics", label: "Basics", blurb: "What a price means and what you're really buying." },
  { id: "trading", label: "Trading", blurb: "Costs, orders, sizing and time." },
  { id: "signals", label: "Reading signals", blurb: "What our flags look for, and when they don't apply." },
];

/** A real, current market that illustrates a module. Fields beyond the market depend on the kind. */
export interface LiveExample {
  marketId?: string;
  title?: string;
  eventTitle: string;
  subtitle?: string | null;
  venue: "kalshi" | "polymarket";
  category?: string;
  yesPrice?: number;
  bid?: number | null;
  ask?: number | null;
  spread?: number | null;
  volume24h?: number;
  closeTime?: string | null;
  daysToClose?: number | null;
  book?: { asks: { price: number; size: number }[]; bids: { price: number; size: number }[] };
  flag?: { type: string; score: number; explanation: string };
  gap?: { kalshi: number; poly: number; gapCents: number; costCents: number; edgeCents: number; flagged: boolean };
  rules?: string;
  score?: string | null;
  period?: string | null;
  sum?: number;
  outcomes?: { label: string; yesPrice: number }[];
}

export interface MoveRound {
  kind: "headline" | "chart";
  marketId: string;
  title: string;
  headline: string | null;
  headlineAt: number | null;
  before: number;
  after: number;
  horizon: string;
  lead: number[];
  reveal?: number[];
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
export const getExample = (kind: LiveKind) => tryApi<LiveExample | null>(`/learn/example?kind=${kind}`, { timeoutMs: 15000 });
/** No seed: the API picks a fresh mix each visit. */
export const getMoves = () => tryApi<{ seed: number; rounds: MoveRound[] }>("/learn/moves");
export const getGame = () => tryApi<{ seed: number; rounds: GameRound[] }>("/learn/game");
