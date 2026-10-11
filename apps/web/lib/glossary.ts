/** Short definitions for the "What's this?" hovers. Each points at the Learn module that explains it properly. */
export const GLOSSARY = {
  "implied probability": { def: "A YES price read as a chance: 62¢ means the market puts it at about 62%.", module: "implied-probability" },
  spread: { def: "The gap between the best bid and the best ask. Buying and selling straight back loses it.", module: "spread-vig" },
  "anomaly score": { def: "0–100: how far this hour's trading and price move sit from the market's own normal. 40+ is flagged.", module: "anomaly-patterns" },
  "cross-venue gap": { def: "The same outcome priced differently on Kalshi and Polymarket. Flagged only when it's bigger than spreads and fees.", module: "cross-venue-arbitrage" },
  "outcome sum": { def: "Outcomes where exactly one can win should add to about 100%. Spreads push the sum around, so we never flag it.", module: "outcome-sets" },
  stake: { def: "A share of the money you set aside, sized by a fraction of Kelly and capped by your risk profile.", module: "sizing" },
  "order book": { def: "Every resting offer to buy (bids) and sell (asks). A big order eats through several levels.", module: "order-types" },
  liquidity: { def: "How much you can trade near the quoted price. Thin markets move a lot on small orders.", module: "liquidity" },
  "resolution rules": { def: "The text that decides how the market settles: the source, the deadline, and edge cases.", module: "fine-print" },
  slippage: { def: "The extra you pay when your order fills beyond the best price.", module: "order-types" },
  "in-play": { def: "A game being played right now. Prices swing on every play, so we don't flag them.", module: "in-play" },
  fees: { def: "Kalshi charges about 7% × price × (1 − price) per contract; most Polymarket markets charge nothing.", module: "fees" },
} as const;

export type GlossaryTerm = keyof typeof GLOSSARY;
