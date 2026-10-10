"use client";

import { usePathname } from "next/navigation";
import { useCommandLine } from "@/components/shell/CommandLine";
import { Clock } from "@/components/shell/Clock";
import { ModeIndicator } from "@/components/shell/ModeIndicator";
import { ProfileSwitcher } from "@/components/shell/ProfileSwitcher";
import { moduleForPath } from "@/lib/modules";

export function TopBar() {
  const pathname = usePathname();
  const mod = moduleForPath(pathname);
  const { setOpen } = useCommandLine();

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line bg-panel px-4">
      <div className="flex min-w-44 items-center gap-2">
        <span className="num text-[12px] tracking-widest text-fg-2 uppercase">{mod?.label ?? "Trust Me Bro"}</span>
        {mod && (
          <kbd className="num rounded-sm border border-line bg-raised px-1.5 py-px text-[10px] text-fg-3">
            {mod.code} &lt;GO&gt;
          </kbd>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex h-8 flex-1 items-center gap-2.5 rounded-md border border-line bg-bg px-3 text-left transition-colors hover:border-fg-3 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
        aria-label="Open command line"
      >
        <span className="num text-[13px] text-anomaly">&gt;</span>
        <span className="num caret-blink h-[15px] w-[7px] bg-fg-2" />
        <span className="num flex-1 truncate text-[12px] text-fg-3 group-hover:text-fg-2">
          FLAG &lt;GO&gt; <span className="mx-1.5 opacity-40">·</span> ARB &lt;GO&gt; <span className="mx-1.5 opacity-40">·</span> SIM &lt;GO&gt; <span className="mx-1.5 opacity-40">·</span> or type a market ticker
        </span>
        <kbd className="num rounded-sm border border-line bg-raised px-1.5 py-px text-[10px] text-fg-3">⌘K</kbd>
      </button>

      <div className="flex items-center gap-3">
        <ModeIndicator />
        <ProfileSwitcher />
        <Clock />
      </div>
    </header>
  );
}
