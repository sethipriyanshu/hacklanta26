"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MODULES, moduleForPath } from "@/lib/modules";
import { useTheme } from "@/components/shell/ThemeProvider";
import { Logo } from "@/components/shell/Logo";
import { cn } from "@/lib/utils";

const THEME_ICON = { dark: Moon, light: Sun, classic: Monitor } as const;

export function Rail() {
  const pathname = usePathname();
  const active = moduleForPath(pathname)?.id;
  const { theme, cycle } = useTheme();
  const ThemeIcon = THEME_ICON[theme];

  return (
    <aside className="flex h-full w-16 flex-col items-center border-r border-line bg-panel py-3">
      <Tooltip>
        <TooltipTrigger render={<Link href="/scanner" className="mb-4 grid size-10 place-items-center rounded-lg transition-transform hover:scale-105 active:scale-95" aria-label="Trust Me Bro" />}>
          <Logo className="size-7" />
        </TooltipTrigger>
        <TooltipContent side="right">Trust Me Bro · the part where you check</TooltipContent>
      </Tooltip>

      <nav className="flex flex-col gap-1" aria-label="Modules">
        {MODULES.map((m) => {
          const isActive = m.id === active;
          return (
            <Tooltip key={m.id}>
              <TooltipTrigger
                render={
                  <Link
                    href={m.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative grid size-11 place-items-center rounded-lg text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                      isActive && "text-fg",
                    )}
                    style={isActive ? { color: m.accent } : undefined}
                  />
                }
              >
                {isActive && (
                  <motion.span
                    layoutId="rail-active"
                    className="absolute inset-y-2 -left-2.5 w-[3px] rounded-full"
                    style={{ background: m.accent }}
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                {isActive && <span className="absolute inset-0 rounded-lg opacity-[0.12]" style={{ background: m.accent }} />}
                <m.icon className="relative size-[19px]" strokeWidth={isActive ? 2.2 : 1.8} />
              </TooltipTrigger>
              <TooltipContent side="right">
                {m.label} <kbd className="num ml-1 text-[10px] opacity-70">{m.code}</kbd>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={<button type="button" onClick={cycle} className="grid size-10 place-items-center rounded-lg text-fg-3 transition-colors hover:bg-raised hover:text-fg" aria-label="Cycle theme" />}
          >
            <ThemeIcon className="size-[17px]" strokeWidth={1.8} />
          </TooltipTrigger>
          <TooltipContent side="right">Theme · {theme}</TooltipContent>
        </Tooltip>
        <span className="eyebrow mt-1 text-[9px]">v0.1</span>
      </div>
    </aside>
  );
}
