import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ConceptIllustration } from "@/components/learn/ConceptIllustration";
import { SIGNAL_META } from "@/components/scanner/SignalBadge";
import { ModuleHeader } from "@/components/shell/ModuleHeader";
import { Panel } from "@/components/shell/Panel";
import { MODULE_BY_ID } from "@/lib/modules";
import { getConcepts } from "@/lib/learn";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = ((await getConcepts()) ?? []).find((x) => x.id === id);
  return { title: c ? c.title : "Learn" };
}

export default async function ConceptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const concepts = (await getConcepts()) ?? [];
  const c = concepts.find((x) => x.id === id);
  if (!c) notFound();
  const others = concepts.filter((x) => x.id !== id);
  return (
    <>
      <ModuleHeader mod={MODULE_BY_ID.learn} title={c.title} blurb={c.blurb} />
      <div className="grid grid-cols-[1fr_300px] gap-3">
        <Panel accent={c.accent}>
          <div className="p-6">
            <div className="mb-6 h-28 w-80 rounded-md border border-line bg-bg px-3">
              <ConceptIllustration id={c.id} accent={c.accent} />
            </div>
            <div className="flex max-w-2xl flex-col gap-4 text-[14px] leading-relaxed text-fg">
              {c.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <div className="mt-6 max-w-2xl rounded-md border border-line bg-bg p-3">
              <p className="eyebrow mb-1">Example</p>
              <p className="text-[13px] leading-relaxed text-fg-2">{c.example}</p>
            </div>
          </div>
        </Panel>
        <div className="flex flex-col gap-3">
          <Panel title="Where you'll see it">
            <ul className="flex flex-col gap-2 p-3">
              {c.signalTypes.map((t) => {
                const m = SIGNAL_META[t as keyof typeof SIGNAL_META];
                return m ? (
                  <li key={t} className="flex items-center gap-2 text-[12px] text-fg-2">
                    <span className="num rounded-full border px-1.5 text-[10px] tracking-wider" style={{ color: m.color, borderColor: `color-mix(in oklab, ${m.color} 40%, transparent)` }}>{m.short}</span>
                    {m.label} badges in the Scanner
                  </li>
                ) : null;
              })}
            </ul>
          </Panel>
          <Panel title="More concepts">
            <ul className="divide-y divide-line/60">
              {others.map((o) => (
                <li key={o.id}>
                  <Link href={`/learn/${o.id}`} className="block px-3 py-2 text-[12.5px] text-fg hover:bg-raised/60">
                    {o.title}
                    <span className="block text-[11px] text-fg-3">{o.blurb}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
          <Link href="/learn" className="inline-flex items-center gap-1 text-[12px] text-fg-3 hover:text-fg-2">
            <ArrowLeft className="size-3" /> All concepts
          </Link>
        </div>
      </div>
    </>
  );
}
