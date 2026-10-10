"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command as CommandPrimitive } from "cmdk";
import { ArrowRight, BookOpen, Flag, GitCompareArrows, MessagesSquare, Orbit, Palette, PlayCircle, type LucideIcon } from "lucide-react";
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
  code: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  group: "Function codes" | "Demo scenarios" | "Terminal";
  run: (ctx: { push: (href: string) => void; setTheme: (t: ThemeName) => void }) => void;
  accent?: string;
}

const COMMANDS: Cmd[] = [
  { code: "FLAG", label: "Scanner · anomalies", hint: "Markets with unusual volume or price action", icon: Flag, group: "Function codes", accent: "var(--tmb-anomaly)", run: ({ push }) => push("/scanner?view=flags") },
  { code: "ARB", label: "Scanner · cross-venue gaps", hint: "Same event, different price on Kalshi vs Polymarket", icon: GitCompareArrows, group: "Function codes", accent: "var(--tmb-mispricing)", run: ({ push }) => push("/scanner?view=gaps") },
  { code: "DESK", label: "Analyst Desk", hint: "Three analysts debate a contract", icon: MessagesSquare, group: "Function codes", accent: "var(--tmb-quant)", run: ({ push }) => push("/desk") },
  { code: "SIM", label: "Swarm Simulator", hint: "Run a crowd of AI traders against a headline", icon: Orbit, group: "Function codes", accent: "var(--tmb-contrarian)", run: ({ push }) => push("/sim") },
  { code: "LEARN", label: "Learn", hint: "Concept cards and Spot the Manipulation", icon: BookOpen, group: "Function codes", accent: "var(--tmb-riskmgr)", run: ({ push }) => push("/learn") },
  { code: "SCENARIO 1", label: "Live scanner with flags", icon: PlayCircle, group: "Demo scenarios", run: ({ push }) => push("/scanner?scenario=1") },
  { code: "SCENARIO 2", label: "Pre-news spike replay", icon: PlayCircle, group: "Demo scenarios", run: ({ push }) => push("/scanner?scenario=2") },
  { code: "SCENARIO 3", label: "Cross-venue gap", icon: PlayCircle, group: "Demo scenarios", run: ({ push }) => push("/scanner?scenario=3") },
  { code: "SCENARIO 4", label: "Same contract, two profiles", icon: PlayCircle, group: "Demo scenarios", run: ({ push }) => push("/desk?scenario=4") },
  { code: "SCENARIO 5", label: "Backtest on a resolved event", icon: PlayCircle, group: "Demo scenarios", run: ({ push }) => push("/sim?scenario=5") },
  { code: "SCENARIO 6", label: "Demographic what-if", icon: PlayCircle, group: "Demo scenarios", run: ({ push }) => push("/sim?scenario=6") },
  { code: "THEME DARK", label: "Dark terminal", icon: Palette, group: "Terminal", run: ({ setTheme }) => setTheme("dark") },
  { code: "THEME LIGHT", label: "Light", icon: Palette, group: "Terminal", run: ({ setTheme }) => setTheme("light") },
  { code: "THEME CLASSIC", label: "Classic amber on black", icon: Palette, group: "Terminal", run: ({ setTheme }) => setTheme("classic") },
];

const GROUPS = ["Function codes", "Demo scenarios", "Terminal"] as const;

function CommandLineDialog() {
  const { open, setOpen } = useCommandLine();
  const router = useRouter();
  const { setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [markets, setMarkets] = useState<MarketRow[]>([]);

  useEffect(() => {
    if (!open) setQuery("");
    else if (markets.length === 0) getMarkets({ limit: 400 }).then((r) => r && setMarkets(r.markets));
  }, [open, markets.length]);

  const marketHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return markets.filter((m) => m.ticker.toLowerCase().includes(q) || m.title.toLowerCase().includes(q) || m.eventTitle.toLowerCase().includes(q)).slice(0, 8);
  }, [markets, query]);

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogHeader className="sr-only">
        <DialogTitle>Command line</DialogTitle>
        <DialogDescription>Type a function code and press GO.</DialogDescription>
      </DialogHeader>
      <DialogContent showCloseButton={false} className="top-[18%] translate-y-0 overflow-hidden rounded-xl! border-line bg-panel p-0 shadow-2xl sm:max-w-xl">
        <CommandPrimitive label="Command line" className="flex flex-col" loop>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <span className="num text-sm text-anomaly select-none">&gt;</span>
            <CommandPrimitive.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="FLAG, ARB, DESK, SIM, LEARN, or a scenario number"
              className="num h-12 w-full bg-transparent text-sm tracking-wide uppercase text-fg outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-fg-3"
            />
            <kbd className="num rounded-sm border border-line bg-raised px-1.5 py-0.5 text-[10px] text-fg-2">&lt;GO&gt;</kbd>
          </div>
          <CommandPrimitive.List className="max-h-[360px] overflow-y-auto p-1.5">
            <CommandPrimitive.Empty className="px-3 py-8 text-center text-sm text-fg-3">
              No function by that name. Try <span className="num text-fg-2">FLAG</span> or <span className="num text-fg-2">SIM</span>.
            </CommandPrimitive.Empty>
            {marketHits.length > 0 && (
              <CommandPrimitive.Group heading="Markets" className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {marketHits.map((m) => (
                  <CommandPrimitive.Item
                    key={m.id}
                    value={`${m.ticker} ${m.title} ${m.eventTitle}`}
                    onSelect={() => { setOpen(false); router.push(`/scanner/${encodeURIComponent(m.id)}`); }}
                    className="group flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-fg-2 outline-none data-[selected=true]:bg-raised data-[selected=true]:text-fg"
                  >
                    <span className="num grid h-7 w-14 shrink-0 place-items-center rounded-sm border border-line bg-bg text-[9px] tracking-wider" style={{ color: m.venue === "kalshi" ? "var(--tmb-yes)" : "var(--tmb-mispricing)" }}>{m.venue === "kalshi" ? "KALSHI" : "POLY"}</span>
                    <span className="flex-1 truncate">{m.subtitle && m.subtitle !== m.eventTitle ? `${m.eventTitle} · ${m.subtitle}` : m.title}</span>
                    <span className="num text-[12px] text-fg">{cents(m.yesPrice)}</span>
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            )}
            {GROUPS.map((g) => (
              <CommandPrimitive.Group key={g} heading={g} className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {COMMANDS.filter((c) => c.group === g).map((c) => (
                  <CommandPrimitive.Item
                    key={c.code}
                    value={`${c.code} ${c.label}`}
                    onSelect={() => execute(c)}
                    className="group flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-fg-2 outline-none data-[selected=true]:bg-raised data-[selected=true]:text-fg"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-sm border border-line bg-bg" style={{ color: c.accent ?? "var(--tmb-fg-2)" }}>
                      <c.icon className="size-3.5" />
                    </span>
                    <span className="num w-28 shrink-0 text-[12.5px] tracking-wide text-fg">{c.code}</span>
                    <span className="flex-1 truncate">
                      {c.label}
                      {c.hint && <span className="ml-2 hidden text-fg-3 group-data-[selected=true]:inline">{c.hint}</span>}
                    </span>
                    <ArrowRight className="size-3.5 opacity-0 transition-opacity group-data-[selected=true]:opacity-60" />
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            ))}
          </CommandPrimitive.List>
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[11px] text-fg-3">
            <span>Any market ticker opens that contract once the feed is live.</span>
            <span className="num">↑↓ move · ⏎ go · esc close</span>
          </div>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
