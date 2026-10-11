"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MessagesSquare, Minus } from "lucide-react";
import { PERSONAS, type PersonaId, type Stance } from "@/lib/desk";
import { cn } from "@/lib/utils";

export type Tone = "concede" | "push_back" | "close";
export interface Reply {
  persona: PersonaId;
  replyTo: PersonaId | "both" | null;
  quote: string | null;
  tone: Tone | null;
  text: string;
  revisedStance: Stance | null;
  revisedConfidence: number | null;
}
export interface Opening {
  stance?: Stance;
  confidence?: number;
}

const ORDER: PersonaId[] = ["quant", "contrarian", "riskmgr"];
// The chat floats above the page as a lighter, neutral graphite layer: separated by elevation (surface, hairline,
// shadow), not by a tint. Text and stance colours stay the app's dark-theme values.
const CHAT_VARS = {
  "--chat-bg": "#1f2228",
  "--chat-head": "#272b32",
  "--chat-bubble": "#2c3038",
  "--chat-quote": "#1a1d22",
  "--chat-edge": "rgba(255, 255, 255, 0.16)",
  "--tmb-fg-3": "#a1a7b1", // meta text, brightened to hold AA on the lighter chat surfaces
} as React.CSSProperties;
const TONE: Record<Tone, { label: string; color: string }> = {
  concede: { label: "concedes", color: "var(--tmb-yes)" },
  push_back: { label: "pushes back", color: "var(--tmb-anomaly)" },
  close: { label: "closes", color: "var(--tmb-mispricing)" },
};

export const stanceLabel = (s: Stance) => (s === "yes" ? "Buy yes" : s === "no" ? "Buy no" : "Stay out");
export const stanceColor = (s: Stance) => (s === "yes" ? "var(--tmb-yes)" : s === "no" ? "var(--tmb-no)" : "var(--tmb-fg-2)");

export function Avatar({ pid, size = 32 }: { pid: PersonaId; size?: number }) {
  const p = PERSONAS[pid];
  return (
    <span
      aria-hidden
      className="num grid shrink-0 place-items-center rounded-full font-semibold text-on-color"
      style={{ background: p.accent, width: size, height: size, fontSize: Math.round(size * 0.45) }}
    >
      {p.glyph}
    </span>
  );
}

/** Round two of the desk as a floating chat: opens itself when the debate starts, minimizes to a launcher pill. */
export function DebateChat({ thread, typing, openings, finished }: { thread: Reply[]; typing: PersonaId | null; openings: Record<PersonaId, Opening>; finished: boolean }) {
  // Open by default the moment the debate starts; once the reader minimizes it, they decide.
  const [minimized, setMinimized] = useState(false);
  const [seenAtMinimize, setSeenAtMinimize] = useState(0);
  const started = thread.length > 0 || typing != null;
  const open = started && !minimized;
  const body = useRef<HTMLDivElement>(null);
  const setOpen = (v: boolean) => {
    if (!v) setSeenAtMinimize(thread.length);
    setMinimized(!v);
  };

  // Keep the newest message in view while the chat is open.
  useEffect(() => {
    if (!open) return;
    const el = body.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [open, thread.length, typing]);

  if (!started) return null;
  const unread = Math.max(0, thread.length - seenAtMinimize);

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6" style={CHAT_VARS}>
      <AnimatePresence>
        {open && (
          <motion.section
            key="chat"
            role="dialog"
            aria-label="The desk debate"
            initial={{ y: 24, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            style={{ transformOrigin: "bottom right" }}
            className="flex h-[min(640px,calc(100dvh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-[var(--chat-edge)] bg-[var(--chat-bg)] shadow-[0_28px_70px_-14px_rgb(0_0_0/0.8),0_6px_18px_-6px_rgb(0_0_0/0.55)]"
          >
            <header className="flex items-center gap-3 border-b border-[var(--chat-edge)] bg-[var(--chat-head)] px-4 py-3">
              <AvatarStack />
              <div className="min-w-0 flex-1">
                <p className="font-display text-[15px] font-medium text-fg">The debate</p>
                <p className="type-small text-fg-3">{finished ? "Finished · the verdict is on the page" : typing ? `${PERSONAS[typing].label} is typing…` : "Three analysts, two replies each"}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-md text-fg-2 transition-colors hover:bg-white/10 hover:text-fg" aria-label="Minimize the debate">
                <Minus className="size-4" />
              </button>
            </header>

            <div ref={body} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
              {withPrevious(thread, openings).map(({ r, prev }, i) => (
                <Message key={`${r.persona}-${i}`} r={r} opening={prev} />
              ))}
              {typing && <TypingBubble pid={typing} />}
              {finished && <p className="mx-auto mt-1 rounded-full bg-[var(--chat-bubble)] px-3 py-1 type-small text-fg-2">Debate over · scroll the page for the verdict</p>}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {!open && (
        <motion.button
          type="button"
          onClick={() => setOpen(true)}
          initial={{ y: 8 }}
          animate={{ y: 0 }}
          className="flex items-center gap-3 rounded-full border border-[var(--chat-edge)] bg-[var(--chat-head)] py-2 pr-4 pl-2 shadow-[0_14px_34px_-8px_rgb(0_0_0/0.7)] transition-colors hover:border-fg-3"
          aria-label="Open the debate"
        >
          <AvatarStack size={28} />
          <span className="font-display text-[14px] font-medium text-fg">The debate</span>
          {unread > 0 ? (
            <span className="num grid min-w-5 place-items-center rounded-full bg-mispricing px-1.5 text-[12px] font-semibold text-on-color">{unread}</span>
          ) : (
            <MessagesSquare className="size-4 text-fg-2" />
          )}
        </motion.button>
      )}
    </div>
  );
}

/** Pair each message with its author's position just before it: their opening take, or their last reply. */
function withPrevious(thread: Reply[], openings: Record<PersonaId, Opening>) {
  const pos: Record<string, Opening> = { ...openings };
  return thread.map((r) => {
    const prev = pos[r.persona] ?? {};
    pos[r.persona] = { stance: r.revisedStance ?? prev.stance, confidence: r.revisedConfidence ?? prev.confidence };
    return { r, prev };
  });
}

function AvatarStack({ size = 30 }: { size?: number }) {
  return (
    <span className="flex -space-x-2">
      {ORDER.map((pid) => (
        <span key={pid} className="rounded-full ring-2 ring-[var(--chat-head)]">
          <Avatar pid={pid} size={size} />
        </span>
      ))}
    </span>
  );
}

function Message({ r, opening }: { r: Reply; opening: Opening }) {
  const p = PERSONAS[r.persona];
  const tone = r.tone ? TONE[r.tone] : null;
  return (
    <motion.article initial={{ y: 8 }} animate={{ y: 0 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} className="flex gap-2.5">
      <Avatar pid={r.persona} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="font-display text-[14px] font-medium text-fg">{p.label.replace(/^The /, "")}</span>
          {tone && (
            <span className="font-display text-[12px] font-medium" style={{ color: tone.color }}>
              {tone.label}
            </span>
          )}
        </div>
        <div className="rounded-2xl rounded-tl-md bg-[var(--chat-bubble)] px-3.5 py-2.5">
          {r.replyTo && r.replyTo !== "both" && r.quote && (
            <div className="mb-2 flex items-start gap-2 rounded-lg bg-[var(--chat-quote)] px-2.5 py-1.5">
              <Avatar pid={r.replyTo} size={16} />
              <p className="min-w-0 type-small text-fg-2">
                <span className="font-medium text-fg">{PERSONAS[r.replyTo].label.replace(/^The /, "")}</span> “{r.quote.replace(/^["“]|["”]$/g, "")}”
              </p>
            </div>
          )}
          {r.replyTo === "both" && <p className="mb-1.5 type-small text-fg-3">to both of them</p>}
          <p className="type-body leading-relaxed text-fg">{r.text}</p>
        </div>
        <Shift r={r} opening={opening} />
      </div>
    </motion.article>
  );
}

/** A changed stance, or a confidence move of 5+ points, against the analyst's opening take. */
function Shift({ r, opening }: { r: Reply; opening: Opening }) {
  const before = opening.stance;
  const after = r.revisedStance ?? before;
  if (!before || !after) return null;
  const c0 = Math.round((opening.confidence ?? 0) * 100);
  const c1 = r.revisedConfidence != null ? Math.round(r.revisedConfidence * 100) : c0;
  if (after !== before) {
    return (
      <p className={cn("mt-1.5 type-small font-medium text-fg")}>
        Changed mind: <span style={{ color: stanceColor(before) }}>{stanceLabel(before)}</span> → <span style={{ color: stanceColor(after) }}>{stanceLabel(after)}</span>
      </p>
    );
  }
  if (Math.abs(c1 - c0) < 5) return null;
  return <p className="num mt-1.5 type-small text-fg-2">Confidence {c0}% → {c1}%</p>;
}

function TypingBubble({ pid }: { pid: PersonaId }) {
  return (
    <div className="flex items-end gap-2.5" aria-live="polite">
      <Avatar pid={pid} />
      <span className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-[var(--chat-bubble)] px-3.5 py-3" aria-label={`${PERSONAS[pid].label} is typing`}>
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="size-1.5 rounded-full bg-fg-2" animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
        ))}
      </span>
    </div>
  );
}
