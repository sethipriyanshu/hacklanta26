import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ConceptIllustration } from "@/components/learn/ConceptIllustration";
import { LiveExample } from "@/components/learn/LiveExample";
import { Quiz } from "@/components/learn/Quiz";
import { TrackNav } from "@/components/learn/TrackNav";
import { FeeCalculator, LockupCalculator, StakeCalculator } from "@/components/learn/Widgets";
import { SIGNAL_META } from "@/components/scanner/SignalBadge";
import { getConcepts, getExample, TRACKS, type Concept, type LiveExample as Ex } from "@/lib/learn";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = ((await getConcepts()) ?? []).find((x) => x.id === id);
  return { title: c ? c.title : "Learn" };
}

function WidgetFor({ c, ex }: { c: Concept; ex: Ex | null }) {
  switch (c.widget) {
    case "fees":
      return <FeeCalculator initialPrice={ex?.yesPrice} />;
    case "stake":
      return <StakeCalculator />;
    case "lockup":
      return <LockupCalculator initialPrice={ex?.yesPrice} initialDays={ex?.daysToClose ?? undefined} />;
    default:
      return null;
  }
}

export default async function ConceptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const concepts = (await getConcepts()) ?? [];
  const c = concepts.find((x) => x.id === id);
  if (!c) notFound();
  const ex = c.live ? await getExample(c.live) : null;
  const inTrack = concepts.filter((x) => x.track === c.track);
  const order = TRACKS.flatMap((t) => concepts.filter((x) => x.track === t.id));
  const at = order.findIndex((x) => x.id === c.id);
  const prev = order[at - 1];
  const next = order[at + 1];
  const track = TRACKS.find((t) => t.id === c.track);
  const flags = c.signalTypes.map((t) => SIGNAL_META[t as keyof typeof SIGNAL_META]).filter(Boolean);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <article className="flex min-w-0 max-w-[760px] flex-col gap-5">
        <header>
          <Link href="/learn" className="mb-3 inline-flex items-center gap-1 type-meta text-fg-2 hover:text-fg">
            <ArrowLeft className="size-3.5" /> Learn · {track?.label}
          </Link>
          <h1 className="type-h1 text-fg">{c.title}</h1>
          <p className="mt-1 type-body text-fg-2">{c.blurb}</p>
        </header>

        <div className="h-28 w-full max-w-[420px] rounded-md border border-line bg-panel px-3">
          <ConceptIllustration id={c.id} accent={c.accent} />
        </div>

        <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-fg">
          {c.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        <aside className="border-l-2 pl-4" style={{ borderColor: c.accent }}>
          <p className="mb-1 type-small font-medium text-fg-3">Worked example</p>
          <p className="type-body leading-relaxed text-fg-2">{c.example}</p>
        </aside>

        {c.live && <LiveExample kind={c.live} ex={ex} />}
        <WidgetFor c={c} ex={ex} />
        {c.quiz.length > 0 && <Quiz moduleId={c.id} items={c.quiz} />}

        <nav aria-label="Module navigation" className="grid grid-cols-2 gap-3 border-t border-line pt-5">
          {prev ? (
            <Link href={`/learn/${prev.id}`} className="group rounded-md border border-line px-4 py-3 hover:bg-raised/60">
              <span className="flex items-center gap-1 type-small text-fg-3"><ArrowLeft className="size-3" /> Previous</span>
              <span className="mt-0.5 block truncate type-body font-medium text-fg">{prev.title}</span>
            </Link>
          ) : <span />}
          {next && (
            <Link href={`/learn/${next.id}`} className="group rounded-md border border-line px-4 py-3 text-right hover:bg-raised/60">
              <span className="flex items-center justify-end gap-1 type-small text-fg-3">Next <ArrowRight className="size-3" /></span>
              <span className="mt-0.5 block truncate type-body font-medium text-fg">{next.title}</span>
            </Link>
          )}
        </nav>
      </article>

      <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        <TrackNav track={c.track} modules={inTrack.map(({ id, title }) => ({ id, title }))} current={c.id} />
        {flags.length > 0 && (
          <section className="rounded-md border border-line bg-panel px-4 py-3">
            <p className="mb-2 type-title text-fg">Where you&apos;ll see it</p>
            <ul className="flex flex-col gap-2">
              {flags.map((m) => (
                <li key={m.label} className="flex items-start gap-2 type-meta text-fg-2">
                  <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: m.color }} />
                  <span>
                    <span className="font-medium text-fg">{m.label}</span> flags in{" "}
                    <Link href="/scanner" className="underline decoration-line underline-offset-2 hover:text-fg">Markets</Link>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
