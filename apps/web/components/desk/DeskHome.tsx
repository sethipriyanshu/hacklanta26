"use client";

import Link from "next/link";
import { ArrowRight, Search, ShieldCheck } from "lucide-react";
import { VenueMark } from "@/components/scanner/SignalBadge";
import { useCommandLine } from "@/components/shell/CommandLine";
import type { Recommendation } from "@/lib/desk";

/** The desk with no market chosen: low-risk markets to start with, picked by checkable rules, plus search. */
export function DeskHome({ recs, missing }: { recs: Recommendation[]; missing: string | null }) {
  const { setOpen } = useCommandLine();
  return (
    <div className="flex flex-col gap-5">
      {missing && <p className="type-body text-anomaly">That market isn’t open any more. Pick another below.</p>}

      <section aria-labelledby="recs-h">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="recs-h" className="flex items-center gap-2 type-title text-fg">
              <ShieldCheck className="size-5 text-yes" /> Recommended low-risk markets
            </h2>
            <p className="mt-0.5 type-meta text-fg-2">
              Liquid, tight spreads, not flagged, a clear favourite, and resolving within 90 days. Chosen by rules, not by a model.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-3 font-display text-[14px] font-medium text-fg-2 transition-colors hover:border-fg-3 hover:text-fg"
          >
            <Search className="size-4" /> Analyze any market
          </button>
        </div>

        {recs.length === 0 ? (
          <div className="rounded-md border border-line bg-panel px-6 py-12 text-center">
            <p className="type-title text-fg">Nothing meets the low-risk bar right now</p>
            <p className="mx-auto mt-1 max-w-md type-body text-fg-2">Use “Analyze any market” to pick one yourself, or check back after the next refresh.</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {recs.map((r) => (
              <li key={r.marketId}>
                <Link
                  href={`/desk?market=${encodeURIComponent(r.marketId)}`}
                  className="group flex h-full flex-col gap-3 rounded-md border border-line bg-panel p-4 transition-colors hover:border-fg-3 hover:bg-raised"
                >
                  <div className="flex items-center justify-between gap-3">
                    <VenueMark venue={r.venue} />
                    <span className="type-small text-fg-3">{r.category}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 type-body font-medium text-fg">{r.eventTitle}</p>
                    {r.title !== r.eventTitle && <p className="mt-0.5 line-clamp-2 type-meta text-fg-2">{r.title}</p>}
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <p className="num text-[26px] leading-none font-medium text-fg">
                      {Math.round(r.yesPrice * 100)}¢<span className="ml-1.5 text-[13px] font-normal text-fg-2">yes</span>
                    </p>
                    <span className="inline-flex items-center gap-1 font-display text-[14px] font-medium text-fg-2 transition-colors group-hover:text-fg">
                      Analyze <ArrowRight className="size-4" />
                    </span>
                  </div>
                  <ul className="flex flex-wrap gap-1.5">
                    {r.reasons.map((x) => (
                      <li key={x} className="rounded-sm bg-raised px-2 py-0.5 type-small text-fg-2">
                        {x}
                      </li>
                    ))}
                  </ul>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
