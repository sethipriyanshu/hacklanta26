import type { Metadata } from "next";
import { LearnHome } from "@/components/learn/LearnHome";
import { ModuleHeader } from "@/components/shell/ModuleHeader";
import { MODULE_BY_ID } from "@/lib/modules";
import { getConcepts, getGame, getMoves } from "@/lib/learn";

export const metadata: Metadata = { title: "Learn" };
export const dynamic = "force-dynamic"; // each visit gets a fresh mix of game rounds

export default async function LearnPage() {
  const [concepts, game, moves] = await Promise.all([getConcepts(), getGame(), getMoves()]);
  return (
    <>
      <ModuleHeader mod={MODULE_BY_ID.learn} />
      <LearnHome concepts={concepts ?? []} rounds={game?.rounds ?? []} moves={moves?.rounds ?? []} />
    </>
  );
}
