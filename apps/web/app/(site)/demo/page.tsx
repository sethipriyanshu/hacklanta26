import type { Metadata } from "next";
import { MarketsPage } from "@/components/scanner/MarketsPage";

// Unlisted: nothing links here. Same Markets page, with real past anomalies and gaps frozen on top, so a live demo
// never depends on today's market producing a flag. Kept out of search engines.
export const metadata: Metadata = { title: "Markets", robots: { index: false, follow: false } };

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const sp = await searchParams;
  return <MarketsPage category={sp.category} demo />;
}
