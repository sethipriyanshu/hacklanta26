"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Search } from "lucide-react";
import { MODULES, moduleForPath } from "@/lib/modules";
import { useCommandLine } from "@/components/shell/CommandLine";
import { Logo } from "@/components/shell/Logo";
import { FeedStatus } from "@/components/shell/FeedStatus";
import { cn } from "@/lib/utils";

export function Masthead() {
  const pathname = usePathname();
  const active = moduleForPath(pathname)?.id;
  const { setOpen } = useCommandLine();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4 sm:px-6 lg:px-10">
        <Link href="/scanner" className="flex shrink-0 items-center gap-2.5 rounded-sm" aria-label="Trust Me Bro, markets">
          <Logo className="size-7" />
          <span className="font-display text-[19px] font-semibold tracking-[-0.01em] text-fg">Trust Me Bro</span>
        </Link>

        <nav aria-label="Main" className="-mb-px hidden h-full items-stretch gap-1 md:flex">
          {MODULES.map((m) => {
            const isActive = m.id === active;
            return (
              <Link
                key={m.id}
                href={m.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex items-center px-3 font-display text-[15px] font-medium transition-colors",
                  isActive ? "text-fg" : "text-fg-2 hover:text-fg",
                )}
              >
                {m.label}
                {isActive && <motion.span layoutId="nav-active" className="absolute inset-x-3 bottom-0 h-[3px] bg-fg" transition={{ type: "spring", stiffness: 520, damping: 42 }} />}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-3 text-fg-2 transition-colors hover:border-fg-3 hover:text-fg"
            aria-label="Search markets"
          >
            <Search className="size-4" />
            <span className="hidden type-meta lg:inline">Search markets</span>
            <kbd className="hidden rounded-sm bg-raised px-1.5 font-display text-[12px] text-fg-2 lg:inline">⌘K</kbd>
          </button>
          <FeedStatus />
        </div>
      </div>

      <nav aria-label="Main" className="flex gap-1 overflow-x-auto border-t border-line px-2 md:hidden">
        {MODULES.map((m) => (
          <Link
            key={m.id}
            href={m.href}
            aria-current={m.id === active ? "page" : undefined}
            className={cn("shrink-0 border-b-[3px] px-3 py-2.5 font-display text-[15px] font-medium", m.id === active ? "border-fg text-fg" : "border-transparent text-fg-2")}
          >
            {m.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
