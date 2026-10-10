import type { Metadata } from "next";
import { ArrowRight, Gamepad2 } from "lucide-react";
import { ModuleHeader } from "@/components/shell/ModuleHeader";
import { Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import { MODULE_BY_ID } from "@/lib/modules";

export const metadata: Metadata = { title: "Learn" };

const CARDS = [
  { id: "implied-probability", title: "Implied probability", blurb: "Why 62¢ means 62%, and why it's not quite that simple.", accent: "var(--tmb-yes)" },
  { id: "spread-vig", title: "Spread and vig", blurb: "The gap you pay to trade, and who collects it.", accent: "var(--tmb-no)" },
  { id: "liquidity", title: "Liquidity", blurb: "Why a thin book can move 10 points on one order.", accent: "var(--tmb-mispricing)" },
  { id: "wash-trading", title: "Wash trading", blurb: "Volume that looks like interest but is one hand washing the other.", accent: "var(--tmb-anomaly)" },
  { id: "anomaly-patterns", title: "Anomaly patterns", blurb: "The shapes a price makes before news it shouldn't know yet.", accent: "var(--tmb-anomaly)" },
  { id: "cross-venue-arbitrage", title: "Cross-venue arbitrage", blurb: "Same event, two prices, one edge. Minus fees.", accent: "var(--tmb-mispricing)" },
];

export default function LearnPage() {
  return (
    <>
      <ModuleHeader mod={MODULE_BY_ID.learn} />
      <div className="grid grid-cols-[1fr_340px] gap-3">
        <div className="grid grid-cols-3 gap-3">
          {CARDS.map((c) => (
            <Panel key={c.id} accent={c.accent} className="group cursor-pointer transition-colors hover:bg-raised/60">
              <div className="flex h-full flex-col p-4">
                <div className="bg-dotgrid mb-4 h-20 rounded-md border border-line" />
                <p className="text-sm font-medium text-fg">{c.title}</p>
                <p className="mt-1 text-[12px] leading-snug text-fg-3">{c.blurb}</p>
                <span className="mt-auto flex items-center gap-1 pt-3 text-[11px] text-fg-3 group-hover:text-fg-2">
                  Read <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Panel>
          ))}
        </div>
        <Panel title="Spot the Manipulation" accent="var(--tmb-anomaly)">
          <div className="flex h-full flex-col gap-3 p-4">
            <span className="grid size-10 place-items-center rounded-lg bg-anomaly/15 text-anomaly">
              <Gamepad2 className="size-5" />
            </span>
            <p className="text-sm text-fg">Six charts. One of them was rigged.</p>
            <p className="text-[12px] leading-snug text-fg-3">Anonymized real price and volume histories. Pick the suspicious one, then see the receipt.</p>
            <Button disabled className="mt-auto bg-anomaly text-bg hover:bg-anomaly/90">
              Start a round
            </Button>
          </div>
        </Panel>
      </div>
    </>
  );
}
