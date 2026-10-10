import type { Metadata } from "next";
import { ModuleHeader } from "@/components/shell/ModuleHeader";
import { KpiStrip } from "@/components/scanner/KpiStrip";
import { MarketTable } from "@/components/scanner/MarketTable";
import { PairsTable } from "@/components/scanner/PairsTable";
import { ScenarioBanner } from "@/components/scanner/ScenarioBanner";
import { MODULE_BY_ID } from "@/lib/modules";
import { Panel } from "@/components/shell/Panel";
import { getHealth, getMarkets, getPairResults, getScenarios } from "@/lib/api";

export const metadata: Metadata = { title: "Scanner" };

export default async function ScannerPage({ searchParams }: { searchParams: Promise<{ view?: string; scenario?: string; category?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === "flags" || sp.view === "gaps" ? sp.view : "all";
  const [markets, pairs, health, scenarios] = await Promise.all([getMarkets(), getPairResults(), getHealth(), getScenarios()]);
  const rows = markets?.markets ?? [];
  const flagged = new Set(rows.filter((m) => m.flags.length > 0).map((m) => m.id)).size;
  const gaps = Object.values(pairs ?? {}).map((r) => ({ cents: r.gap.gap * 100, title: r.pair.title, flagged: r.gap.flagged }));
  const biggest = gaps.sort((a, b) => b.cents - a.cents)[0] ?? null;
  const scenario = sp.scenario ? (scenarios ?? []).find((s) => String(s.id) === sp.scenario) ?? null : null;
  const title = view === "flags" ? "Anomalies" : view === "gaps" ? "Mispricing" : undefined;
  const blurb = view === "flags" ? "Markets whose last hour looks nothing like their last week." : view === "gaps" ? "Cross-venue gaps and outcome sets that do not add up." : undefined;

  return (
    <div className="flex h-full flex-col">
      <ModuleHeader mod={MODULE_BY_ID.scanner} title={title} blurb={blurb} code={view === "gaps" ? "ARB" : "FLAG"} />
      {scenario && <ScenarioBanner scenario={scenario} />}
      <KpiStrip tracked={markets?.snapshot.marketCount ?? 0} venues={markets?.snapshot.venues ?? {}} flags={flagged} biggestGap={biggest} recordedAt={markets?.snapshot.recordedAt ?? null} mode={health ? health.mode : "offline"} />
      {view === "gaps" && <div className="mb-3"><PairsTable rows={Object.values(pairs ?? {})} /></div>}
      {view === "gaps" ? (
        <Panel title="Outcome sets that do not add up">
          <MarketTable rows={rows.filter((m) => m.flags.some((f) => f.type === "inconsistency"))} view="all" initialCategory={sp.category} bare />
        </Panel>
      ) : (
        <MarketTable rows={rows} view={view} initialCategory={sp.category} />
      )}
    </div>
  );
}
