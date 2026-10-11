"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { THEMES, type ThemeName } from "@/lib/theme";

interface ThemeCtx {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  cycle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const KEY = "tmb-theme";

function apply(t: ThemeName) {
  const el = document.documentElement;
  el.dataset.theme = t;
  el.classList.toggle("dark", t === "dark");
  try {
    localStorage.setItem(KEY, t);
  } catch {}
}

/** Inline script for <head> so the first paint already has the stored theme. */
export const THEME_BOOT_SCRIPT = `(function(){try{document.documentElement.dataset.theme='dark';document.documentElement.classList.add('dark');}catch(e){}})();`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("dark");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY) as ThemeName | null;
      if (stored && THEMES.includes(stored)) setThemeState(stored);
    } catch {}
  }, []);

  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t);
    apply(t);
  }, []);

  const cycle = useCallback(() => {
    setThemeState((cur) => {
      const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
      apply(next);
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ theme, setTheme, cycle }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme outside ThemeProvider");
  return v;
}
