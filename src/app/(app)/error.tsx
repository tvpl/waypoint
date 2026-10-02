"use client";
import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Errors inside the app shell keep the rail and tab bar around. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-display-sm leading-[1.05] tracking-[-0.01em] sm:text-display">Algo deu errado</h1>
        <p className="text-lead text-muted">Tente novamente. Se persistir, recarregue a página.</p>
        {error.digest && <p className="font-mono text-caption text-muted">Código: {error.digest}</p>}
      </div>
      <Button variant="primary" onClick={reset}>
        <RotateCcw /> Tentar novamente
      </Button>
    </main>
  );
}
