import type { Metadata } from "next";
import { ModuleHeader } from "@/components/shell/ModuleHeader";
import { Panel, SkeletonLines } from "@/components/shell/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { MODULE_BY_ID } from "@/lib/modules";

export const metadata: Metadata = { title: "Analyst Desk" };

const ANALYSTS = [
  { id: "quant", name: "The Quant", tagline: "Base rates, spreads, arbitrage math.", accent: "var(--tmb-quant)", glyph: "Σ" },
  { id: "contrarian", name: "The Contrarian", tagline: "Fades hype. Distrusts crowds.", accent: "var(--tmb-contrarian)", glyph: "↯" },
  { id: "riskmgr", name: "The Risk Manager", tagline: "Sizing. Veto power. Says no.", accent: "var(--tmb-riskmgr)", glyph: "⌀" },
];

export default function DeskPage() {
  return (
    <>
      <ModuleHeader mod={MODULE_BY_ID.desk} />
      <Panel title="Contract under review" className="mb-3">
        <div className="flex items-center gap-4 p-3">
          <Skeleton className="h-4 w-80 rounded-sm bg-raised" />
          <Skeleton className="num ml-auto h-7 w-16 rounded-sm bg-raised" />
        </div>
      </Panel>
      <div className="grid grid-cols-3 gap-3">
        {ANALYSTS.map((a) => (
          <Panel key={a.id} accent={a.accent}>
            <div className="flex items-center gap-3 border-b border-line px-3 py-3">
              <span className="num grid size-9 place-items-center rounded-lg text-base font-semibold text-bg" style={{ background: a.accent }}>
                {a.glyph}
              </span>
              <div>
                <p className="text-sm font-medium text-fg">{a.name}</p>
                <p className="text-[11px] text-fg-3">{a.tagline}</p>
              </div>
            </div>
            <SkeletonLines n={5} />
            <div className="flex items-center gap-1.5 px-3 pb-3 text-[11px] text-fg-3">
              <span className="size-1 animate-bounce rounded-full bg-fg-3 [animation-delay:0ms]" />
              <span className="size-1 animate-bounce rounded-full bg-fg-3 [animation-delay:120ms]" />
              <span className="size-1 animate-bounce rounded-full bg-fg-3 [animation-delay:240ms]" />
              <span className="ml-1">waiting for a contract</span>
            </div>
          </Panel>
        ))}
      </div>
      <Panel title="Consensus" className="mt-3">
        <div className="grid grid-cols-[1fr_280px] items-center gap-6 p-4">
          <SkeletonLines n={2} className="p-0" />
          <div>
            <p className="eyebrow mb-1.5">Position vs risk budget</p>
            <div className="h-2 overflow-hidden rounded-full bg-raised">
              <div className="h-full w-0 rounded-full bg-yes" />
            </div>
          </div>
        </div>
      </Panel>
    </>
  );
}
