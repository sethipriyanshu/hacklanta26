"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { AgentState, Persona, SimRun } from "@/lib/sim";
import { cents, usd } from "@/lib/format";

const GAP = 14; // distance from the clicked dot
const EDGE = 12; // minimum distance from the viewport edge

/** The agent's details float above the page next to the clicked dot, flipped and clamped so they never leave the viewport. */
export function AgentCard({ run, agent, at, onClose }: { run: SimRun; agent: AgentState; at: { x: number; y: number } | null; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = at?.x ?? vw - width - EDGE;
    const y = at?.y ?? EDGE;
    // Prefer right of and below the dot; flip to the other side when it would overflow, then clamp.
    let left = x + GAP + width > vw - EDGE ? x - GAP - width : x + GAP;
    let top = y + GAP + height > vh - EDGE ? y - GAP - height : y + GAP;
    left = Math.max(EDGE, Math.min(left, vw - width - EDGE));
    top = Math.max(EDGE, Math.min(top, vh - height - EDGE));
    setPos({ left, top });
  }, [at, agent.i]);

  // Escape closes it; scrolling the page would detach it from its dot, so that closes it too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  const persona: Persona | undefined = run.personas.find((p) => p.id === agent.personaId);
  const reaction = run.reactions.find((r) => r.personaId === agent.personaId);
  const stanceColor = agent.stance === "yes" ? "var(--tmb-yes)" : agent.stance === "no" ? "var(--tmb-no)" : "var(--tmb-fg-3)";
  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label={`Agent ${agent.i}`}
      className="fixed z-[60] max-h-[calc(100dvh-24px)] w-72 overflow-y-auto rounded-md border border-line bg-raised p-3 shadow-[0_18px_44px_-10px_rgb(0_0_0/0.7)]"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0, visibility: "hidden" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="eyebrow">Agent #{agent.i}</p>
          <p className="type-body font-medium text-fg">{persona?.label ?? agent.personaId}</p>
          <p className="type-small text-fg-3">{persona?.job}</p>
        </div>
        <button type="button" onClick={onClose} className="text-fg-3 hover:text-fg" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      {persona && (
        <p className="num mt-2 type-small text-fg-3">
          {persona.ageBand} · {persona.incomeBand} income · leans {persona.lean} · info speed {Math.round(persona.infoSpeed * 100)}
        </p>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="belief" value={agent.seen ? `${cents(agent.prior)} → ${cents(agent.belief)}` : cents(agent.prior)} />
        <Stat label="last trade" value={agent.stance === "flat" ? "none" : `bought ${agent.stance}`} color={stanceColor} />
        <Stat label="at risk" value={`${usd(agent.spent)} / ${usd(agent.bankroll)}`} />
      </div>
      <p className="mt-3 type-meta leading-snug text-fg-2">
        <span className="text-fg-3">{agent.seen ? "After the headline: " : "Has not seen the news yet. Would say: "}</span>
        {reaction ? `“${reaction.reason}”` : "—"}
      </p>
      {persona && <p className="mt-2 type-small text-fg-3">Media diet: {persona.mediaDiet}</p>}
    </div>,
    document.body,
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-md border border-line bg-bg px-1.5 py-1.5">
      <p className="eyebrow">{label}</p>
      <p className="num mt-0.5 type-meta text-fg" style={color ? { color } : undefined}>
        {value}
      </p>
    </div>
  );
}
