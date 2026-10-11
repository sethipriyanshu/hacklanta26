import type { Metadata } from "next";
import { Suspense } from "react";
import { ModuleHeader } from "@/components/shell/ModuleHeader";
import { Simulator } from "@/components/sim/Simulator";
import { SelectMarketFirst } from "@/components/sim/SelectMarketFirst";
import { MODULE_BY_ID } from "@/lib/modules";
import { getMarket } from "@/lib/api";

export const metadata: Metadata = { title: "Simulator" };

/** A live simulator: it always runs on a real market picked by the reader, never on a preset. */
export default async function SimPage({ searchParams }: { searchParams: Promise<{ market?: string }> }) {
  const sp = await searchParams;
  const market = sp.market ? await getMarket(sp.market) : null;
  return (
    <>
      <ModuleHeader mod={MODULE_BY_ID.sim} />
      {market ? (
        <Suspense>
          <Simulator market={market} />
        </Suspense>
      ) : (
        <SelectMarketFirst missing={sp.market ?? null} />
      )}
    </>
  );
}
