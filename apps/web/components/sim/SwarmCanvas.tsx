"use client";

import { useEffect, useRef } from "react";
import { readTokens } from "@/lib/theme";

/** Agents as dots on a hex-ish grid. Colored by stance; a short pulse when a stance changes. Pure Canvas 2D, fine for 5,000 dots. */
export function SwarmCanvas({ stances, seenMask, onPick, highlight }: { stances: string; seenMask?: boolean[]; onPick?: (i: number, at: { x: number; y: number }) => void; highlight?: number | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const prev = useRef<string>("");
  const pulse = useRef<Float32Array>(new Float32Array(0));
  const raf = useRef<number | null>(null);
  const layout = useRef<{ cols: number; cell: number; ox: number; oy: number; n: number }>({ cols: 1, cell: 1, ox: 0, oy: 0, n: 0 });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const n = stances.length;
    if (pulse.current.length !== n) pulse.current = new Float32Array(n);
    // mark changed stances for a pulse
    const before = prev.current;
    if (before.length === n) for (let i = 0; i < n; i++) if (before[i] !== stances[i]) pulse.current[i] = 1;
    prev.current = stances;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const t = readTokens();
      const pad = 14;
      const area = (w - pad * 2) * (h - pad * 2);
      const cell = Math.max(4, Math.sqrt(area / Math.max(1, n)) * 0.98);
      const cols = Math.max(1, Math.floor((w - pad * 2) / cell));
      const rows = Math.ceil(n / cols);
      const ox = (w - cols * cell) / 2;
      const oy = (h - rows * cell) / 2;
      layout.current = { cols, cell, ox, oy, n };
      const r = Math.max(1.4, cell * 0.33);
      let anyPulse = false;
      for (let i = 0; i < n; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = ox + col * cell + cell / 2 + (row % 2 ? cell * 0.25 : 0);
        const y = oy + row * cell + cell / 2;
        const s = stances[i];
        const seen = seenMask ? seenMask[i] : true;
        const p = pulse.current[i];
        // y = expects higher, n = expects lower, h = heard but unchanged, - = hasn't heard yet.
        const color = s === "y" ? t.yes : s === "n" ? t.no : s === "h" ? t["fg-2"] : seen ? t["fg-3"] : t.line;
        ctx.beginPath();
        ctx.arc(x, y, r + p * r * 1.4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = s === "-" ? 0.35 : s === "h" ? 0.6 : 0.95;
        ctx.fill();
        if (p > 0) {
          anyPulse = true;
          ctx.beginPath();
          ctx.arc(x, y, r + (1 - p) * r * 3.2, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.globalAlpha = p * 0.6;
          ctx.lineWidth = 1;
          ctx.stroke();
          pulse.current[i] = Math.max(0, p - 0.08);
        }
        if (highlight === i) {
          ctx.beginPath();
          ctx.arc(x, y, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = t.anomaly;
          ctx.globalAlpha = 1;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      if (anyPulse && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) raf.current = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [stances, seenMask, highlight]);

  return (
    <canvas
      ref={ref}
      className="h-full w-full cursor-crosshair"
      onClick={(e) => {
        if (!onPick) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const { cols, cell, ox, oy, n } = layout.current;
        const col = Math.floor((e.clientX - rect.left - ox) / cell);
        const row = Math.floor((e.clientY - rect.top - oy) / cell);
        const i = row * cols + col;
        if (i >= 0 && i < n && col >= 0 && col < cols) onPick(i, { x: e.clientX, y: e.clientY });
      }}
      aria-label="Swarm of simulated traders"
    />
  );
}
