import type { Metadata } from "next";
import { MarketsPage } from "@/components/scanner/MarketsPage";

export const metadata: Metadata = { title: "Markets" };

export default async function ScannerPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const sp = await searchParams;
  return <MarketsPage category={sp.category} />;
}
