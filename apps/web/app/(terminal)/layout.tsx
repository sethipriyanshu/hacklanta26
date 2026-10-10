import { Rail } from "@/components/shell/Rail";
import { TopBar } from "@/components/shell/TopBar";
import { StatusBar } from "@/components/shell/StatusBar";

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh min-w-[1280px] flex-col bg-bg">
      <div className="flex min-h-0 flex-1">
        <Rail />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1680px] p-5">{children}</div>
          </main>
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
