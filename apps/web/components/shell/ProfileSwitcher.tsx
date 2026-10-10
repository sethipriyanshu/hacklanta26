"use client";

import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProfile } from "@/components/shell/ProfileProvider";
import { PROFILES, riskBudget } from "@/lib/profiles";
import { usd } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ProfileSwitcher() {
  const { profile, setProfileId } = useProfile();
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex h-7 items-center gap-2 rounded-full border border-line bg-raised pr-2 pl-1 text-[12px] text-fg-2 transition-colors hover:text-fg aria-expanded:text-fg"
          />
        }
      >
        <span className="num grid size-5 place-items-center rounded-full text-[10px] font-semibold text-bg" style={{ background: profile.accent }}>
          {profile.name[0]}
        </span>
        <span>
          {profile.name} <span className="text-fg-3">· {profile.tier.split(" · ")[0]}</span>
        </span>
        <ChevronDown className="size-3 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 border-line bg-panel p-1.5">
        <p className="eyebrow px-2 py-1.5">Viewing as</p>
        {PROFILES.map((p) => {
          const active = p.id === profile.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setProfileId(p.id)}
              className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-raised", active && "bg-raised")}
            >
              <span className="num grid size-7 place-items-center rounded-full text-[11px] font-semibold text-bg" style={{ background: p.accent }}>
                {p.name[0]}
              </span>
              <span className="flex-1">
                <span className="block text-fg">{p.name}</span>
                <span className="block text-[11px] text-fg-3">{p.tier}</span>
              </span>
              <span className="text-right">
                <span className="num block text-[12px] text-fg">{usd(riskBudget(p))}</span>
                <span className="block text-[10px] text-fg-3">risk budget / mo</span>
              </span>
              {active && <Check className="size-3.5 text-yes" />}
            </button>
          );
        })}
        <p className="px-2 pt-2 pb-1 text-[11px] leading-snug text-fg-3">Fictional profiles. The Analyst Desk sizes every call against the selected budget.</p>
      </PopoverContent>
    </Popover>
  );
}
