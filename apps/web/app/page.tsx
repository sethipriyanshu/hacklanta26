import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/shell/Logo";
import { Splash } from "@/components/shell/Splash";

export default function Home() {
  return (
    <main className="relative flex h-dvh flex-col items-center justify-center overflow-hidden bg-bg px-6">
      <div className="bg-dotgrid absolute inset-0 opacity-70" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 50% at 50% 40%, color-mix(in oklab, var(--tmb-anomaly) 10%, transparent), transparent 70%)" }} aria-hidden="true" />
      <Splash>
        <div className="relative flex max-w-3xl flex-col items-center text-center">
          <Logo className="size-14" />
          <p className="eyebrow mt-6">A terminal for prediction markets</p>
          <h1 className="mt-3 text-[56px] leading-[1.02] font-semibold tracking-tight text-fg">Trust Me Bro</h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-fg-2">
            Prediction markets give you a number and say <span className="text-fg">trust me bro</span>. We show you the receipts: anomalies, mispricing, three analysts that argue, and a crowd of AI traders you can run against history.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Link href="/scanner" className="group flex h-10 items-center gap-2 rounded-md bg-fg px-4 text-[13px] font-medium text-bg transition-transform hover:scale-[1.02] active:scale-[0.98]">
              Open the terminal <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link href="/learn" className="flex h-10 items-center rounded-md border border-line px-4 text-[13px] text-fg-2 hover:bg-raised hover:text-fg">
              Start with Learn
            </Link>
          </div>
          <p className="num mt-10 text-[10.5px] tracking-wider text-fg-3 uppercase">Read-only · no orders · no wallets · Kalshi + Polymarket public data</p>
        </div>
      </Splash>
    </main>
  );
}
