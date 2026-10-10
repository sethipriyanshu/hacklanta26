"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Gamepad2 } from "lucide-react";
import { ConceptIllustration } from "@/components/learn/ConceptIllustration";
import { SpotGame } from "@/components/learn/SpotGame";
import { Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import type { Concept, GameRound } from "@/lib/learn";

export function LearnHome({ concepts, rounds }: { concepts: Concept[]; rounds: GameRound[] }) {
  const [playing, setPlaying] = useState(false);
  if (playing) {
    return (
      <div className="h-[calc(100dvh-12rem)]">
        <SpotGame rounds={rounds} onExit={() => setPlaying(false)} />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[1fr_340px] gap-3">
      <div className="grid grid-cols-3 gap-3">
        {concepts.map((c) => (
          <Link key={c.id} href={`/learn/${c.id}`} id={c.id} className="group">
            <Panel accent={c.accent} className="h-full transition-colors hover:bg-raised/60">
              <div className="flex h-full flex-col p-4">
                <div className="mb-4 h-20 rounded-md border border-line bg-bg px-2">
                  <ConceptIllustration id={c.id} accent={c.accent} />
                </div>
                <p className="text-sm font-medium text-fg">{c.title}</p>
                <p className="mt-1 text-[12px] leading-snug text-fg-3">{c.blurb}</p>
                <span className="mt-auto flex items-center gap-1 pt-3 text-[11px] text-fg-3 group-hover:text-fg-2">
                  Read <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Panel>
          </Link>
        ))}
      </div>
      <Panel title="Spot the Manipulation" accent="var(--tmb-anomaly)">
        <div className="flex h-full flex-col gap-3 p-4">
          <span className="grid size-10 place-items-center rounded-lg bg-anomaly/15 text-anomaly">
            <Gamepad2 className="size-5" />
          </span>
          <p className="text-sm text-fg">Four charts. One of them is rigged.</p>
          <p className="text-[12px] leading-snug text-fg-3">Anonymized real price and volume histories from this snapshot, mixed with one real pre-news spike and two synthetic patterns. Pick the suspicious one, then see the receipt.</p>
          <ul className="text-[11.5px] leading-relaxed text-fg-2">
            <li>· Volume without price movement</li>
            <li>· Moves that precede the headline</li>
            <li>· Pumps that fade on no news</li>
          </ul>
          <Button onClick={() => setPlaying(true)} disabled={rounds.length === 0} className="mt-auto bg-anomaly text-bg hover:bg-anomaly/90">
            Start a round · {rounds.length} rounds
          </Button>
        </div>
      </Panel>
    </div>
  );
}
