"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="flex min-h-app flex-col items-center justify-center gap-5 bg-bg px-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-display-lg leading-none tracking-[-0.01em]">Algo deu errado</h1>
        <p className="text-lead text-muted">Tente novamente. Se persistir, recarregue a página.</p>
      </div>
      <Button variant="primary" onClick={reset}>
        Tentar novamente
      </Button>
    </main>
  );
}
