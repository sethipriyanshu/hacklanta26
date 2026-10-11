"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Command as CommandPrimitive } from "cmdk";
import { ArrowRight, BookOpen, Flag, MessagesSquare, Orbit, Search, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTheme } from "@/components/shell/ThemeProvider";
import type { ThemeName } from "@/lib/theme";
import { getMarkets, type MarketRow } from "@/lib/api";
import { cents } from "@/lib/format";

interface CommandLineCtx {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}
const Ctx = createContext<CommandLineCtx | null>(null);

export function CommandLineProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    <Ctx.Provider value={{ open, setOpen, toggle }}>
      {children}
      <CommandLineDialog />
    </Ctx.Provider>
  );
}

export function useCommandLine() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCommandLine outside CommandLineProvider");
  return v;
}

interface Cmd {
  /** Old terminal code, kept only as a hidden search keyword so a presenter's muscle memory still works. */
  code: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  group: "Go to";
  run: (ctx: { push: (href: string) => void; setTheme: (t: ThemeName) => void }) => void;
}

const COMMANDS: Cmd[] = [
  { code: "FLAG ARB MARKETS", label: "Markets", hint: "Flagged first", icon: Flag, group: "Go to", run: ({ push }) => push("/scanner") },
  { code: "DESK", label: "Analyst Desk", icon: MessagesSquare, group: "Go to", run: ({ push }) => push("/desk") },
  { code: "SIM", label: "Simulator", icon: Orbit, group: "Go to", run: ({ push }) => push("/sim") },
  { code: "LEARN", label: "Learn", icon: BookOpen, group: "Go to", run: ({ push }) => push("/learn") },
];

const GROUPS = ["Go to"] as const;

function CommandLineDialog() {
  const { open, setOpen } = useCommandLine();
  const router = useRouter();
  const pathname = usePathname();
  // On the Simulator and the Analyst Desk, picking a market loads it into that tool; elsewhere it opens the market page.
  const tool = pathname.startsWith("/sim") ? "/sim" : pathname.startsWith("/desk") ? "/desk" : null;
  const openMarket = (id: string) => router.push(tool ? `${tool}?market=${encodeURIComponent(id)}` : `/scanner/${encodeURIComponent(id)}`);
  const { setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [hits, setMarketHits] = useState<MarketRow[]>([]);
  // Short queries show no market hits without clearing state inside the effect.
  const marketHits = query.trim().length >= 2 ? hits : [];

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Search runs on the server across every open market, not a local slice.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let alive = true;
    const t = setTimeout(async () => {
      const r = await getMarkets({ q, limit: 8 });
      if (alive) setMarketHits(r?.markets ?? []);
    }, 180);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  const ctx = useMemo(
    () => ({
      push: (href: string) => router.push(href),
      setTheme,
    }),
    [router, setTheme],
  );

  const execute = (cmd: Cmd) => {
    setOpen(false);
    cmd.run(ctx);
  };

  const itemCls = "group flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2.5 type-body text-fg-2 outline-none data-[selected=true]:bg-raised data-[selected=true]:text-fg";
  const groupCls = "[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogHeader className="sr-only">
        <DialogTitle>Search</DialogTitle>
        <DialogDescription>Search any market, or jump to a page.</DialogDescription>
      </DialogHeader>
      <DialogContent showCloseButton={false} className="top-[14%] translate-y-0 overflow-hidden rounded-md! border-line bg-panel p-0 shadow-[0_18px_50px_-12px_rgb(0_0_0/0.28)] sm:max-w-xl">
        <CommandPrimitive label="Search" className="flex flex-col" loop shouldFilter={false}>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="size-[18px] shrink-0 text-fg-3" />
            <CommandPrimitive.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder={tool === "/sim" ? "Search a market to simulate" : tool === "/desk" ? "Search a market for the desk" : "Search a market, or jump to a page"}
              className="h-14 w-full bg-transparent type-lead text-fg outline-none placeholder:text-fg-3"
            />
          </div>
          <CommandPrimitive.List className="max-h-[400px] overflow-y-auto p-1.5">
            {marketHits.length > 0 && (
              <CommandPrimitive.Group heading="Markets" className={groupCls}>
                {marketHits.map((m) => (
                  <CommandPrimitive.Item key={m.id} value={m.id} onSelect={() => { setOpen(false); openMarket(m.id); }} className={itemCls}>
                    <VenueDot venue={m.venue} />
                    <span className="flex-1 truncate">{m.subtitle && m.subtitle !== m.eventTitle ? `${m.eventTitle} · ${m.subtitle}` : m.title}</span>
                    <span className="num text-fg">{cents(m.yesPrice)}</span>
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            )}
            {GROUPS.map((g) => {
              const q = query.trim().toLowerCase();
              const cmds = COMMANDS.filter((c) => c.group === g && (!q || `${c.code} ${c.label} ${c.hint ?? ""}`.toLowerCase().includes(q)));
              if (cmds.length === 0) return null;
              return (
                <CommandPrimitive.Group key={g} heading={g} className={groupCls}>
                  {cmds.map((c) => (
                    <CommandPrimitive.Item key={c.code} value={c.code} onSelect={() => execute(c)} className={itemCls}>
                      <c.icon className="size-4 shrink-0 text-fg-3" />
                      <span className="flex-1 truncate">
                        <span className="text-fg">{c.label}</span>
                        {c.hint && <span className="ml-2 text-fg-3">{c.hint}</span>}
                      </span>
                      <ArrowRight className="size-4 opacity-0 transition-opacity group-data-[selected=true]:opacity-60" />
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              );
            })}
            {query.trim().length >= 2 && marketHits.length === 0 && (
              <p className="px-3 py-6 text-center type-meta text-fg-2">No market matches “{query.trim()}” yet. Try a team, a person, or a topic.</p>
            )}
          </CommandPrimitive.List>
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 type-small text-fg-2">
            <span>Searches every open market on both venues.</span>
            <span>↑↓ to move · Enter to open · Esc to close</span>
          </div>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}

function VenueDot({ venue }: { venue: string }) {
  return (
    <span className="flex w-24 shrink-0 items-center gap-1.5 type-small text-fg-2">
      <span aria-hidden className="size-2 rounded-full" style={{ background: venue === "kalshi" ? "var(--tmb-fg)" : "var(--tmb-mispricing)" }} />
      {venue === "kalshi" ? "Kalshi" : "Polymarket"}
    </span>
  );
}
