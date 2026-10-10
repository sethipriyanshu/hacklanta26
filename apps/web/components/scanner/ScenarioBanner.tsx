import Link from "next/link";
import { PlayCircle } from "lucide-react";
import type { Scenario } from "@/lib/api";

export function ScenarioBanner({ scenario }: { scenario: Scenario }) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-anomaly/40 bg-anomaly/10 px-3 py-2">
      <PlayCircle className="size-4 text-anomaly" />
      <span className="num text-[11px] tracking-wider text-anomaly">{scenario.code}</span>
      <span className="text-[13px] text-fg">{scenario.title}</span>
      <span className="text-[12px] text-fg-2">— {scenario.proves}</span>
      {scenario.marketId && scenario.module === "scanner" && (
        <Link href={`/scanner/${encodeURIComponent(scenario.marketId)}?scenario=${scenario.id}`} className="ml-auto rounded-md bg-anomaly px-2.5 py-1 text-[12px] font-medium text-bg hover:bg-anomaly/90">
          Open the contract
        </Link>
      )}
    </div>
  );
}
