import type { Metadata } from "next";
import { LearnHome } from "@/components/learn/LearnHome";
import { ModuleHeader } from "@/components/shell/ModuleHeader";
import { MODULE_BY_ID } from "@/lib/modules";
import { getConcepts, getGame } from "@/lib/learn";

export const metadata: Metadata = { title: "Learn" };

export default async function LearnPage() {
  const seed = Math.floor(Date.now() / 60000) % 1000;
  const [concepts, game] = await Promise.all([getConcepts(), getGame(seed)]);
  return (
    <>
      <ModuleHeader mod={MODULE_BY_ID.learn} />
      <LearnHome concepts={concepts ?? []} rounds={game?.rounds ?? []} />
    </>
  );
}
