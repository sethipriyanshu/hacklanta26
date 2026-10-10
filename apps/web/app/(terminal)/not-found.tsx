import Link from "next/link";
import { Radar } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <span className="grid size-12 place-items-center rounded-lg border border-line bg-raised text-fg-3">
        <Radar className="size-5" />
      </span>
      <p className="text-[15px] text-fg">No such contract in this snapshot.</p>
      <p className="text-[12px] text-fg-2">Tickers come and go. The Scanner has everything that is loaded.</p>
      <Link href="/scanner" className="text-[12px] text-mispricing hover:underline">
        Back to the Scanner →
      </Link>
    </div>
  );
}
