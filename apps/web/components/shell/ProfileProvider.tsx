"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { PROFILES, type Profile } from "@/lib/profiles";

interface ProfileCtx {
  profile: Profile;
  setProfileId: (id: string) => void;
}

const Ctx = createContext<ProfileCtx | null>(null);
const KEY = "tmb-profile";

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [id, setId] = useState(PROFILES[1].id);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored && PROFILES.some((p) => p.id === stored)) setId(stored);
    } catch {}
  }, []);

  const setProfileId = (next: string) => {
    setId(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  };

  const profile = PROFILES.find((p) => p.id === id) ?? PROFILES[1];
  return <Ctx.Provider value={{ profile, setProfileId }}>{children}</Ctx.Provider>;
}

export function useProfile() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProfile outside ProfileProvider");
  return v;
}
