import type { Metadata } from "next";
import { ModuleHeader } from "@/components/shell/ModuleHeader";
import { ContractPicker } from "@/components/desk/ContractPicker";
import { Debate } from "@/components/desk/Debate";
import { ScenarioBanner } from "@/components/scanner/ScenarioBanner";
import { MODULE_BY_ID } from "@/lib/modules";
import { getMarket, getMarkets, getScenarios } from "@/lib/api";
import { getDeskProfiles } from "@/lib/desk";

export const metadata: Metadata = { title: "Analyst Desk" };

export default async function DeskPage({ searchParams }: { searchParams: Promise<{ market?: string; scenario?: string }> }) {
  const sp = await searchParams;
  const scenarios = (await getScenarios()) ?? [];
  const scenarioId = sp.scenario ? Number(sp.scenario) : null;
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? null;
  const marketId = sp.market ?? scenario?.marketId ?? null;
  const [market, profiles] = await Promise.all([marketId ? getMarket(marketId) : Promise.resolve(null), getDeskProfiles()]);
  if (!market || !profiles) {
    const list = await getMarkets({ limit: 40 });
    return (
      <>
        <ModuleHeader mod={MODULE_BY_ID.desk} />
        <ContractPicker rows={(list?.markets ?? []).filter((m) => m.category !== "Sports")} />
      </>
    );
  }
  return (
    <>
      <ModuleHeader mod={MODULE_BY_ID.desk} />
      {scenario && <ScenarioBanner scenario={scenario} />}
      <Debate market={market} profiles={profiles} scenarioId={scenarioId} />
    </>
  );
}
