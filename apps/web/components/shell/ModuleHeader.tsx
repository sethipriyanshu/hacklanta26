import type { ModuleDef } from "@/lib/modules";

/** Page opener: the title carries itself, one plain sentence explains the page. No kicker above it. */
export function ModuleHeader({ mod, title, blurb, actions }: { mod: ModuleDef; title?: string; blurb?: string; actions?: React.ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <div className="max-w-3xl">
        <h1 className="type-h1 text-fg">{title ?? mod.label}</h1>
        <p className="mt-1 type-body text-fg-2">{blurb ?? mod.blurb}</p>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
