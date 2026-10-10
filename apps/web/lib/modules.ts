import { GraduationCap, MessagesSquare, Orbit, Radar, type LucideIcon } from "lucide-react";

export type ModuleId = "scanner" | "desk" | "sim" | "learn";

export interface ModuleDef {
  id: ModuleId;
  label: string;
  code: string;
  href: `/${ModuleId}`;
  icon: LucideIcon;
  /** CSS color expression; never a raw hex in components. */
  accent: string;
  blurb: string;
}

export const MODULES: ModuleDef[] = [
  { id: "scanner", label: "Scanner", code: "FLAG", href: "/scanner", icon: Radar, accent: "var(--tmb-anomaly)", blurb: "Anomalies and mispricing across Kalshi and Polymarket." },
  { id: "desk", label: "Analyst Desk", code: "DESK", href: "/desk", icon: MessagesSquare, accent: "var(--tmb-quant)", blurb: "Three analysts argue a contract against your risk budget." },
  { id: "sim", label: "Swarm Simulator", code: "SIM", href: "/sim", icon: Orbit, accent: "var(--tmb-contrarian)", blurb: "A crowd of AI traders reacts to a headline. Compare it to what really happened." },
  { id: "learn", label: "Learn", code: "LEARN", href: "/learn", icon: GraduationCap, accent: "var(--tmb-riskmgr)", blurb: "Every flag explained in plain language, plus a game." },
];

export const MODULE_BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m])) as Record<ModuleId, ModuleDef>;

export function moduleForPath(pathname: string): ModuleDef | undefined {
  return MODULES.find((m) => pathname === m.href || pathname.startsWith(m.href + "/"));
}
