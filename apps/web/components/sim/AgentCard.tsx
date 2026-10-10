"use client";

import { X } from "lucide-react";
import type { AgentState, Persona, SimRun } from "@/lib/sim";
import { cents, usd } from "@/lib/format";

export function AgentCard({ run, agent, onClose }: { run: SimRun; agent: AgentState; onClose: () => void }) {
  const persona: Persona | undefined = run.personas.find((p) => p.id === agent.personaId);
  const reaction = run.reactions.find((r) => r.personaId === agent.personaId);
  const stanceColor = agent.stance === "yes" ? "var(--tmb-yes)" : agent.stance === "no" ? "var(--tmb-no)" : "var(--tmb-fg-3)";
  return (
    <div className="absolute top-3 right-3 z-10 w-72 rounded-lg border border-line bg-raised p-3 shadow-2xl">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="eyebrow">Agent #{agent.i}</p>
          <p className="text-[13px] font-medium text-fg">{persona?.label ?? agent.personaId}</p>
          <p className="text-[11px] text-fg-3">{persona?.job}</p>
        </div>
        <button type="button" onClick={onClose} className="text-fg-3 hover:text-fg" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      {persona && (
        <p className="num mt-2 text-[10px] tracking-wider text-fg-3 uppercase">
          {persona.ageBand} · {persona.incomeBand} income · leans {persona.lean} · info speed {Math.round(persona.infoSpeed * 100)}
        </p>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="belief" value={cents(agent.belief)} />
        <Stat label="stance" value={agent.stance.toUpperCase()} color={stanceColor} />
        <Stat label="at risk" value={`${usd(agent.spent)} / ${usd(agent.bankroll)}`} />
      </div>
      <p className="mt-3 text-[12px] leading-snug text-fg-2">
        <span className="text-fg-3">{agent.seen ? "After the headline: " : "Has not seen the news yet. Would say: "}</span>
        {reaction ? `“${reaction.reason}”` : "—"}
      </p>
      {persona && <p className="mt-2 text-[10.5px] text-fg-3">Media diet: {persona.mediaDiet}</p>}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-md border border-line bg-bg px-1.5 py-1.5">
      <p className="eyebrow text-[9px]">{label}</p>
      <p className="num mt-0.5 text-[12px] text-fg" style={color ? { color } : undefined}>
        {value}
      </p>
    </div>
  );
}
