"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ModuleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <span className="grid size-12 place-items-center rounded-lg border border-line bg-raised text-anomaly">
        <AlertTriangle className="size-5" />
      </span>
      <p className="text-[15px] text-fg">This panel hit an error and was contained.</p>
      <p className="num max-w-lg text-[11px] text-fg-3">{error.message}</p>
      <p className="text-[12px] text-fg-2">Fixtures are still loaded. The rest of the terminal keeps working.</p>
      <Button variant="outline" onClick={reset}>
        <RotateCcw /> Try again
      </Button>
    </div>
  );
}
