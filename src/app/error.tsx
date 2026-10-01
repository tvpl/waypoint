"use client";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-bg px-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-5xl leading-none">Algo deu errado</h1>
        <p className="text-[15px] text-muted">Tente novamente. Se persistir, recarregue a página.</p>
      </div>
      <button type="button" onClick={reset} className="inline-flex h-9 items-center rounded-[9px] bg-accent px-4 text-sm font-medium text-white">
        Tentar novamente
      </button>
    </main>
  );
}
