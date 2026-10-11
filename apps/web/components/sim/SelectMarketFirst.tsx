"use client";

import Link from "next/link";
import { Orbit, Search } from "lucide-react";
import { useCommandLine } from "@/components/shell/CommandLine";

/** The simulator needs a real market to run on; say so plainly and offer the two ways to pick one. */
export function SelectMarketFirst({ missing }: { missing: string | null }) {
  const { setOpen } = useCommandLine();
  return (
    <section className="grid place-items-center rounded-md border border-line bg-panel px-6 py-20 text-center">
      <Orbit className="size-8 text-contrarian" aria-hidden />
      <h2 className="mt-4 type-title text-fg">Please select a market before running the simulator</h2>
      <p className="mt-2 max-w-md type-body text-fg-2">
        {missing ? "That market isn’t open any more. " : ""}
        The swarm trades against a real market’s current price, so pick one first. Then write a headline and watch the crowd react.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-md bg-fg px-4 font-display text-[15px] font-medium text-bg hover:bg-fg/85">
          <Search className="size-4" /> Search a market
        </button>
        <Link href="/scanner" className="inline-flex h-10 items-center rounded-md border border-line px-4 font-display text-[15px] font-medium text-fg hover:border-fg-3 hover:bg-raised">
          Browse markets
        </Link>
      </div>
      <p className="mt-4 type-small text-fg-3">Tip: every market page has a “Simulate” button.</p>
    </section>
  );
}
