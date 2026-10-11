"use client";

import { ChevronRight, HelpCircle } from "lucide-react";
import Link from "next/link";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SIGNAL_META, SignalBadge } from "@/components/scanner/SignalBadge";
import type { Signal } from "@/lib/api";

const SUB_LABEL: Record<string, string> = { zVol: "Volume vs 7-day", zMove: "Move vs volatility", cWallet: "Fresh-wallet share", tNews: "Move before news", gapCents: "Gap (¢)", thresholdCents: "Spreads + fees (¢)", edgeCents: "Edge (¢)", sumPct: "Mid prices sum (%)", bidSumCents: "YES bids sum (¢)", askSumCents: "YES asks sum (¢)" };
const LEARN: Record<Signal["type"], string> = { anomaly: "/learn/anomaly-patterns", gap: "/learn/cross-venue-arbitrage", inconsistency: "/learn/implied-probability", newsLag: "/learn/anomaly-patterns" };

export function SignalList({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) return <p className="px-3 py-4 type-meta text-fg-3">No signals on this contract. Volume, price action and outcome sums all look ordinary.</p>;
  return (
    <ul className="divide-y divide-line">
      {signals.map((s, i) => (
        <li key={`${s.type}-${i}`}>
          <WhyFlagged signal={s}>
            <button type="button" className="group flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-raised/60">
              <SignalBadge type={s.type} score={s.score} size="md" />
              <span className="flex-1 truncate type-meta text-fg-2">{s.explanation}</span>
              <ChevronRight className="size-3.5 shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5" />
            </button>
          </WhyFlagged>
        </li>
      ))}
    </ul>
  );
}

export function WhyFlagged({ signal, children }: { signal: Signal; children: React.ReactElement }) {
  const meta = SIGNAL_META[signal.type];
  const subs = Object.entries(signal.subScores ?? {});
  const weights = signal.weights ?? {};
  return (
    <Sheet>
      <SheetTrigger render={children} />
      <SheetContent side="right" className="w-[440px] border-line bg-panel sm:max-w-[440px]">
        <SheetHeader className="border-b border-line">
          <SheetTitle className="flex items-center gap-2 text-fg">
            <HelpCircle className="size-4" style={{ color: meta.color }} /> Why flagged
          </SheetTitle>
          <SheetDescription className="text-fg-2">
            {meta.label} · score <span className="num text-fg">{Math.round(signal.score)}</span>/100
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 p-4">
          <p className="type-body leading-relaxed text-fg">{signal.explanation}</p>
          <div>
            <p className="eyebrow mb-2">Sub-scores</p>
            <ul className="flex flex-col gap-2">
              {subs.map(([k, v]) => (
                <li key={k} className="grid grid-cols-[1fr_auto] items-center gap-3">
                  <span className="flex items-center justify-between type-meta text-fg-2">
                    <span>{SUB_LABEL[k] ?? k}</span>
                    {weights[k] !== undefined && <span className="num type-small text-fg-3">w {Math.round((weights[k] ?? 0) * 100)}%</span>}
                  </span>
                  {v == null ? (
                    <span className="num w-28 text-right type-small text-fg-3">not available</span>
                  ) : k.endsWith("Cents") || k.endsWith("Pts") || k.endsWith("Pct") ? (
                    <span className="num w-28 text-right type-meta text-fg">{v}</span>
                  ) : (
                    <span className="flex w-28 items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                        <span className="block h-full rounded-full" style={{ width: `${Math.round((v as number) * 100)}%`, background: meta.color }} />
                      </span>
                      <span className="num w-8 text-right type-small text-fg">{Math.round((v as number) * 100)}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          {signal.type === "anomaly" && (
            <div className="rounded-md border border-line bg-bg p-3 type-small leading-relaxed text-fg-2">
              <span className="num text-fg-3">A = 100 × (0.35·z<sub>vol</sub> + 0.30·z<sub>move</sub> + 0.20·c<sub>wallet</sub> + 0.15·t<sub>news</sub>)</span>
              <br />
              Missing terms are dropped and the rest reweighted. This is an <span className="text-anomaly">anomaly</span> score: it says the hour looked unusual, not who caused it.
            </div>
          )}
          <Link href={LEARN[signal.type]} className="type-meta text-mispricing hover:underline">
            Learn: what this signal means →
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
