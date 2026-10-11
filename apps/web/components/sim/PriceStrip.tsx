"use client";
import { etAxis, etTime } from "@/lib/format";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Tick } from "@/lib/sim";

const fmtT = (t: number) => etAxis(t);

export function PriceStrip({ ticks, upto, headlineAt, showReal }: { ticks: Tick[]; upto: number; headlineAt: number; showReal: boolean }) {
  const data = ticks.map((t, i) => ({ t: t.t, sim: i <= upto ? Math.round(t.price * 1000) / 10 : null, real: showReal && t.real != null ? Math.round(t.real * 1000) / 10 : null, vol: i <= upto ? t.volume : 0 }));
  const vals = data.flatMap((d) => [d.sim, d.real]).filter((v): v is number => v != null);
  const min = Math.max(0, Math.floor((Math.min(...vals, 100) - 4) / 5) * 5);
  const max = Math.min(100, Math.ceil((Math.max(...vals, 0) + 4) / 5) * 5);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--tmb-line)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="t" tickFormatter={fmtT} tick={{ fill: "var(--tmb-fg-3)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }} axisLine={{ stroke: "var(--tmb-line)" }} tickLine={false} minTickGap={48} />
        <YAxis domain={[min, max]} tickFormatter={(v) => `${v}¢`} tick={{ fill: "var(--tmb-fg-3)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }} axisLine={false} tickLine={false} width={40} />
        <YAxis yAxisId="vol" orientation="right" hide domain={[0, "dataMax"]} />
        <Tooltip
          contentStyle={{ background: "var(--tmb-raised)", border: "1px solid var(--tmb-line)", borderRadius: 8, fontSize: 11, fontFamily: "var(--font-geist-mono)", color: "var(--tmb-fg)" }}
          labelFormatter={(t) => etTime(Number(t))}
          formatter={(v, name) => [name === "vol" ? `$${Math.round(Number(v))}` : `${v}¢`, name === "sim" ? "simulated" : name === "real" ? "real" : "flow"]}
        />
        <Area yAxisId="vol" dataKey="vol" fill="var(--tmb-fg-3)" fillOpacity={0.12} stroke="none" isAnimationActive={false} />
        <ReferenceLine x={headlineAt} stroke="var(--tmb-mispricing)" strokeDasharray="3 3" label={{ value: "headline", fill: "var(--tmb-mispricing)", fontSize: 10, position: "insideTopRight" }} />
        {showReal && <Line dataKey="real" stroke="var(--tmb-fg-2)" strokeWidth={1.5} dot={false} strokeDasharray="4 3" isAnimationActive={false} connectNulls />}
        <Line dataKey="sim" stroke="var(--tmb-contrarian)" strokeWidth={2.2} dot={false} isAnimationActive={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
