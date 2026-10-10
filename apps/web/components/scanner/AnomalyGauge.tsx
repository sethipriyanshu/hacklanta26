"use client";

import { motion } from "motion/react";

export function AnomalyGauge({ score, size = 148 }: { score: number; size?: number }) {
  const r = (size - 14) / 2;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = score >= 70 ? "var(--tmb-no)" : score >= 40 ? "var(--tmb-anomaly)" : "var(--tmb-yes)";
  const label = score >= 70 ? "High" : score >= 40 ? "Elevated" : "Quiet";
  const d = `M7 ${size / 2} A ${r} ${r} 0 0 1 ${size - 7} ${size / 2}`;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size / 2 + 28 }}>
      <svg width={size} height={size / 2 + 8} viewBox={`0 0 ${size} ${size / 2 + 8}`} aria-hidden="true">
        <path d={d} fill="none" stroke="var(--tmb-raised)" strokeWidth="10" strokeLinecap="round" />
        <motion.path d={d} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: Math.max(0.015, pct) }} transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <motion.div key={Math.round(score)} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} className="num text-[34px] leading-none font-medium text-fg">
          {Math.round(score)}
        </motion.div>
        <div className="num mt-1 text-[10px] tracking-widest uppercase" style={{ color }}>
          {label} · anomaly
        </div>
      </div>
    </div>
  );
}
