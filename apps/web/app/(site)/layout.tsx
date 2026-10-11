import { Masthead } from "@/components/shell/Masthead";
import { SiteFooter } from "@/components/shell/SiteFooter";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <Masthead />
      <main className="flex-1">
        <div className="mx-auto max-w-[1600px] px-4 pt-6 pb-12 sm:px-6 lg:px-10">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
