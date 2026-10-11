import type { Metadata } from "next";
import { ModuleHeader } from "@/components/shell/ModuleHeader";
import { DeskHome } from "@/components/desk/DeskHome";
import { DeskIntake } from "@/components/desk/DeskIntake";
import { MODULE_BY_ID } from "@/lib/modules";
import { getMarket } from "@/lib/api";
import { getRecommendations } from "@/lib/desk";

export const metadata: Metadata = { title: "Analyst Desk" };

/** No market: suggest low-risk markets to start with. A market: ask two questions, then run the desk on the answers. */
export default async function DeskPage({ searchParams }: { searchParams: Promise<{ market?: string }> }) {
  const sp = await searchParams;
  const market = sp.market ? await getMarket(sp.market) : null;
  if (!market) {
    const recs = await getRecommendations(6);
    return (
      <>
        <ModuleHeader mod={MODULE_BY_ID.desk} />
        <DeskHome recs={recs ?? []} missing={sp.market ? sp.market : null} />
      </>
    );
  }
  return (
    <>
      <ModuleHeader mod={MODULE_BY_ID.desk} />
      <DeskIntake market={market} />
    </>
  );
}
