import type { Metadata } from "next";
import { Orbit } from "lucide-react";
import { ModuleHeader } from "@/components/shell/ModuleHeader";
import { Panel, EmptyState } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import { MODULE_BY_ID } from "@/lib/modules";

export const metadata: Metadata = { title: "Swarm Simulator" };

const SLIDERS = ["Age mix", "Income distribution", "Political lean", "Risk appetite", "Information speed", "Swarm size"];

export default function SimPage() {
  return (
    <>
      <ModuleHeader mod={MODULE_BY_ID.sim} />
      <div className="grid h-[calc(100dvh-13.5rem)] grid-cols-[300px_1fr] grid-rows-[1fr_180px] gap-3">
        <Panel title="Swarm controls" className="row-span-2">
          <div className="flex flex-col gap-4 p-3">
            <div>
              <p className="eyebrow mb-1.5">Headline</p>
              <div className="h-16 rounded-md border border-line bg-bg px-3 py-2 text-[12px] text-fg-3">Pick a contract, then type or choose a headline.</div>
            </div>
            {SLIDERS.map((s) => (
              <div key={s}>
                <div className="mb-1.5 flex justify-between">
                  <span className="text-[12px] text-fg-2">{s}</span>
                  <span className="num text-[11px] text-fg-3">—</span>
                </div>
                <div className="relative h-1 rounded-full bg-raised">
                  <span className="absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line bg-panel" />
                </div>
              </div>
            ))}
            <Button disabled className="mt-1 w-full bg-contrarian text-bg hover:bg-contrarian/90">
              Run swarm
            </Button>
          </div>
        </Panel>
        <Panel title="Swarm" accent="var(--tmb-contrarian)">
          <div className="bg-dotgrid h-full">
            <EmptyState icon={Orbit} title="No swarm running" hint="Choose a contract and a headline. Up to 5,000 agents will react, trade, and move the price." />
          </div>
        </Panel>
        <Panel title="Simulated price · real curve overlay" action={<span className="num text-[11px] text-fg-3">MAE —</span>}>
          <div className="relative h-full">
            <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 40" aria-hidden="true">
              <path d="M0 30 C 20 28, 30 22, 45 20 S 70 14, 100 12" fill="none" stroke="var(--tmb-line)" strokeWidth="0.6" strokeDasharray="1.5 1.5" />
            </svg>
          </div>
        </Panel>
      </div>
    </>
  );
}
