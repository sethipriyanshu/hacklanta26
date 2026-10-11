import { DataStore } from "@/components/shell/DataStore";
import { Logo } from "@/components/shell/Logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 sm:px-6 grid-cols-[auto_1fr] items-center lg:px-10">
        <Logo className="size-6 opacity-80" />
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2">
          <p className="type-meta text-fg-2">Read-only. No orders, no wallets, no bank connections.</p>
          <DataStore />
        </div>
      </div>
    </footer>
  );
}
