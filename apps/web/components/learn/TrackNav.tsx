"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import type { Concept, Track } from "@/lib/learn";
import { TRACKS } from "@/lib/learn";
import { isDone, useProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";

/** The modules in this track, in order, with done marks from this browser's progress. */
export function TrackNav({ track, modules, current }: { track: Track; modules: Pick<Concept, "id" | "title">[]; current: string }) {
  const progress = useProgress();
  const done = modules.filter((m) => isDone(progress[m.id])).length;
  const label = TRACKS.find((t) => t.id === track)?.label ?? track;
  return (
    <nav aria-label={`${label} modules`} className="rounded-md border border-line bg-panel">
      <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <p className="type-title text-fg">{label}</p>
        <p className="num type-small text-fg-3">
          {done}/{modules.length} done
        </p>
      </div>
      <ol className="py-1.5">
        {modules.map((m, i) => {
          const d = isDone(progress[m.id]);
          const here = m.id === current;
          return (
            <li key={m.id}>
              <Link
                href={`/learn/${m.id}`}
                aria-current={here ? "page" : undefined}
                className={cn("flex items-center gap-3 px-4 py-2 type-meta transition-colors", here ? "bg-raised text-fg" : "text-fg-2 hover:bg-raised/60 hover:text-fg")}
              >
                <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded-full border num text-[11px]", d ? "border-yes bg-yes text-bg" : "border-line text-fg-3")}>
                  {d ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className="min-w-0 truncate">{m.title}</span>
                {d && <span className="sr-only">(done)</span>}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
