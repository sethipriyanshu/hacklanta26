import type { Metadata } from "next";
import { Suspense } from "react";
import { ModuleHeader } from "@/components/shell/ModuleHeader";
import { Simulator } from "@/components/sim/Simulator";
import { MODULE_BY_ID } from "@/lib/modules";
import { getMarket } from "@/lib/api";
import { getPresets } from "@/lib/sim";

export const metadata: Metadata = { title: "Swarm Simulator" };

export default async function SimPage({ searchParams }: { searchParams: Promise<{ market?: string; scenario?: string }> }) {
  const sp = await searchParams;
  const presets = (await getPresets()) ?? [];
  const scenarioId = sp.scenario ? Number(sp.scenario) : null;
  const preset = presets.find((p) => p.scenario === scenarioId) ?? null;
  const marketId = sp.market ?? preset?.marketId ?? null;
  const market = marketId ? await getMarket(marketId) : null;
  return (
    <>
      <ModuleHeader mod={MODULE_BY_ID.sim} />
      <Suspense>
        <Simulator presets={presets} market={market} scenarioId={scenarioId} />
      </Suspense>
    </>
  );
}
