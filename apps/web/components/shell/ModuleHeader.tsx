import type { ModuleDef } from "@/lib/modules";

export function ModuleHeader({ mod, title, blurb, actions, code }: { mod: ModuleDef; title?: string; blurb?: string; actions?: React.ReactNode; code?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <p className="eyebrow mb-1 flex items-center gap-2">
          <span className="inline-block size-1.5 rounded-full" style={{ background: mod.accent }} />
          {mod.label} · {code ?? mod.code} &lt;GO&gt;
        </p>
        <h1 className="text-[22px] font-semibold tracking-tight text-fg">{title ?? mod.label}</h1>
        <p className="mt-0.5 text-[13px] text-fg-2">{blurb ?? mod.blurb}</p>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
