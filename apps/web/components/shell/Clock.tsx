"use client";

import { useEffect, useState } from "react";

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const text = now ? now.toISOString().slice(11, 19) : "--:--:--";
  return (
    <span className="num text-[12px] text-fg-2" title="UTC">
      {text} <span className="text-fg-3">UTC</span>
    </span>
  );
}
