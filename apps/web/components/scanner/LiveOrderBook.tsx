"use client";

import { useEffect, useState } from "react";
import { bookStreamUrl, type OrderBook } from "@/lib/api";
import { OrderBookMini } from "@/components/scanner/OrderBookMini";

/** Wraps the order book with a live SSE feed. Polymarket streams over WebSocket upstream, Kalshi is fast-polled;
 *  both arrive here as `book` events. In replay mode we keep the static snapshot and open nothing. */
export function LiveOrderBook({ marketId, initial, live }: { marketId: string; initial: OrderBook | null; live: boolean }) {
  const [book, setBook] = useState<OrderBook | null>(initial);
  const [streaming, setStreaming] = useState(false);
  const [settled, setSettled] = useState(false); // gave the stream time; no live depth arrived

  useEffect(() => {
    if (!live) return;
    setStreaming(false);
    setSettled(false);
    // Some resolved or illiquid markets never push a book. After a grace period, stop implying we're still connecting.
    const timer = setTimeout(() => setSettled(true), 6000);
    const es = new EventSource(bookStreamUrl(marketId));
    es.addEventListener("book", (ev) => {
      try {
        setBook(JSON.parse((ev as MessageEvent).data) as OrderBook);
        setStreaming(true);
      } catch {
        /* ignore a malformed frame */
      }
    });
    es.onerror = () => setStreaming(false); // the browser auto-reconnects an EventSource
    return () => {
      clearTimeout(timer);
      es.close();
    };
  }, [marketId, live]);

  const label = !live ? "Snapshot" : streaming ? "Live" : settled ? "Snapshot" : "Connecting…";
  return (
    <div>
      <div className="flex items-center justify-end px-3 pt-2">
        <span className="flex items-center gap-1.5 type-small" style={{ color: streaming ? "var(--tmb-yes)" : "var(--tmb-fg-3)" }}>
          <span className={streaming ? "pulse-dot size-1.5 rounded-full bg-current" : "size-1.5 rounded-full bg-current"} />
          {label}
        </span>
      </div>
      <OrderBookMini book={book} />
    </div>
  );
}
