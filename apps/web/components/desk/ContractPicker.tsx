import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { VenueMark } from "@/components/scanner/SignalBadge";
import { EmptyState, Panel } from "@/components/shell/Panel";
import type { MarketRow } from "@/lib/api";
import { cents, usd } from "@/lib/format";

export function ContractPicker({ rows }: { rows: MarketRow[] }) {
  if (rows.length === 0) {
    return (
      <Panel className="h-64">
        <EmptyState icon={MessagesSquare} title="No contracts loaded" hint="Start the API, then pick any market from the Scanner." />
      </Panel>
    );
  }
  return (
    <Panel title="Pick a contract for the desk" action={<span className="num text-[11px] text-fg-3">top by volume</span>}>
      <ul className="grid grid-cols-2 gap-x-6 divide-y divide-line/60">
        {rows.slice(0, 16).map((m) => (
          <li key={m.id}>
            <Link href={`/desk?market=${encodeURIComponent(m.id)}`} className="flex items-center gap-3 px-3 py-2 text-[12.5px] hover:bg-raised/60">
              <VenueMark venue={m.venue} />
              <span className="flex-1 truncate text-fg">{m.subtitle && m.subtitle !== m.eventTitle ? `${m.eventTitle} · ${m.subtitle}` : m.title}</span>
              <span className="num text-fg">{cents(m.yesPrice)}</span>
              <span className="num w-16 text-right text-fg-3">{usd(m.volume24h)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
