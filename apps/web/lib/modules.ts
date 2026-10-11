export type ModuleId = "scanner" | "desk" | "sim" | "learn";

export interface ModuleDef {
  id: ModuleId;
  label: string;
  href: `/${ModuleId}`;
  blurb: string;
}

export const MODULES: ModuleDef[] = [
  { id: "scanner", label: "Markets", href: "/scanner", blurb: "Every open market on Kalshi and Polymarket, flagged first." },
  { id: "desk", label: "Analyst Desk", href: "/desk", blurb: "Three AI analysts debate a contract and suggest how much of a stake it deserves." },
  { id: "sim", label: "Simulator", href: "/sim", blurb: "Write a headline and watch a crowd of traders reprice the market. Each dot is one trader." },
  { id: "learn", label: "Learn", href: "/learn", blurb: "Fifteen short modules in three tracks, with live examples, calculators and two games." },
];

export const MODULE_BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m])) as Record<ModuleId, ModuleDef>;

export function moduleForPath(pathname: string): ModuleDef | undefined {
  if (pathname === "/demo") return MODULE_BY_ID.scanner; // the unlisted demo list is the Markets page with frozen flags
  return MODULES.find((m) => pathname === m.href || pathname.startsWith(m.href + "/"));
}
