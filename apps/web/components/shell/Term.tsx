"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GLOSSARY, type GlossaryTerm } from "@/lib/glossary";
import { cn } from "@/lib/utils";

/** A label with a dotted underline; hover or focus shows a one-line definition and a link to the Learn module. */
export function Term({ term, children, className }: { term: GlossaryTerm; children?: React.ReactNode; className?: string }) {
  const g = GLOSSARY[term];
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span tabIndex={0} />}
        className={cn("cursor-help underline decoration-fg-3/70 decoration-dotted underline-offset-[3px] outline-none focus-visible:decoration-fg", className)}
      >
        {children ?? term}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] flex-col items-start gap-1.5 border border-line bg-raised px-3 py-2.5 text-left text-fg shadow-lg [&>*:last-child]:hidden">
        <span className="type-meta leading-snug text-fg">{g.def}</span>
        <Link href={`/learn/${g.module}`} className="inline-flex items-center gap-1 type-small font-medium text-mispricing hover:underline">
          Learn more <ArrowRight className="size-3" />
        </Link>
      </TooltipContent>
    </Tooltip>
  );
}
