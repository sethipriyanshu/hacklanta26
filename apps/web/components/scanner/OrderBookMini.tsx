import type { OrderBook } from "@/lib/api";
import { cents } from "@/lib/format";

export function OrderBookMini({ book }: { book: OrderBook | null }) {
  const allBids = book?.bids ?? [];
  const allAsks = book?.asks ?? [];
  if (!book || (allBids.length === 0 && allAsks.length === 0)) return <p className="px-3 py-3 text-[12px] text-fg-3">No depth recorded for this contract.</p>;
  const bids = allBids.slice(0, 5);
  const asks = allAsks.slice(0, 5);
  const max = Math.max(...bids.map((l) => l.size), ...asks.map((l) => l.size), 1);
  const best = bids[0] && asks[0] ? asks[0].price - bids[0].price : null;
  return (
    <div className="p-3">
      <div className="grid grid-cols-2 gap-3">
        <Column levels={bids} max={max} color="var(--tmb-yes)" label="Bids (YES)" align="right" />
        <Column levels={asks} max={max} color="var(--tmb-no)" label="Asks (YES)" align="left" />
      </div>
      <p className="num mt-2 text-center text-[10.5px] text-fg-3">{best != null ? `spread ${cents(best)}` : "one-sided book"}</p>
    </div>
  );
}

function Column({ levels, max, color, label, align }: { levels: { price: number; size: number }[]; max: number; color: string; label: string; align: "left" | "right" }) {
  return (
    <div>
      <p className={`eyebrow mb-1 ${align === "right" ? "text-right" : ""}`}>{label}</p>
      <ul className="flex flex-col gap-0.5">
        {levels.map((l) => (
          <li key={l.price} className="relative flex h-5 items-center justify-between px-1.5 text-[11px]">
            <span className="absolute inset-y-0 rounded-sm opacity-20" style={{ background: color, width: `${Math.round((l.size / max) * 100)}%`, [align === "right" ? "right" : "left"]: 0 }} />
            <span className="num relative text-fg">{cents(l.price)}</span>
            <span className="num relative text-fg-2">{Math.round(l.size).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
