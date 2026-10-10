import { Wallet } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { WalletPanel as WalletPanelData } from "@/lib/api";
import { usd } from "@/lib/format";

const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;

export function WalletPanel({ data }: { data: WalletPanelData | null }) {
  if (!data || data.wallets.length === 0) {
    return <p className="px-3 py-4 text-[12px] text-fg-3">No wallet-level trades in this window.</p>;
  }
  const freshPct = Math.round(data.freshShare * 100);
  const top = data.wallets[0];
  return (
    <div className="p-3">
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label="YES bought" value={usd(data.totalBuySize)} />
        <Stat label="Top wallet" value={`${Math.round(top.share * 100)}%`} hint="share of YES buying" />
        <Stat label="Fresh wallets" value={`${freshPct}%`} hint="of buying, new or <5 prior trades" accent={freshPct >= 30 ? "var(--tmb-anomaly)" : undefined} />
      </div>
      <ul className="flex flex-col gap-1.5">
        {data.wallets.slice(0, 8).map((w) => (
          <li key={w.wallet} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-[12px]">
            <span className="flex min-w-0 items-center gap-2">
              <span className="num truncate text-fg">{w.label ? `${w.label}` : short(w.wallet)}</span>
              <span className="num hidden truncate text-[10px] text-fg-3 xl:inline">{short(w.wallet)}</span>
              {w.fresh && (
                <Tooltip>
                  <TooltipTrigger render={<span className="num rounded-sm border border-anomaly/40 bg-anomaly/10 px-1 text-[9px] tracking-wider text-anomaly" />}>FRESH</TooltipTrigger>
                  <TooltipContent>{w.priorTrades != null ? `${w.priorTrades} prior trades on record` : "First seen within 7 days"}</TooltipContent>
                </Tooltip>
              )}
              {w.priorTrades == null && w.firstSeen == null && <span className="num text-[9px] text-fg-3" title="Activity feed truncated; age unknown">est.</span>}
            </span>
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-raised">
              <span className="block h-full rounded-full" style={{ width: `${Math.max(3, Math.round(w.share * 100))}%`, background: w.fresh ? "var(--tmb-anomaly)" : "var(--tmb-fg-3)" }} />
            </span>
            <span className="num w-14 text-right text-fg-2">{usd(w.buySize)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-start gap-1.5 text-[10.5px] leading-snug text-fg-3">
        <Wallet className="mt-px size-3 shrink-0" />
        Pseudonyms are the venue&apos;s own. Concentration is a pattern, not an accusation. &ldquo;est.&rdquo; means the wallet&apos;s history was too long to fetch, so it is treated as established.
      </p>
    </div>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="rounded-md border border-line bg-bg px-2.5 py-2">
      <p className="eyebrow">{label}</p>
      <p className="num mt-0.5 text-[16px] leading-none text-fg" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
      {hint && <p className="mt-1 text-[10px] text-fg-3">{hint}</p>}
    </div>
  );
}
