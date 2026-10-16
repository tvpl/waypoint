"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Summary = { processed: number; enriched: number; remaining: number };
type Target = { ids?: string[]; collectionId?: string | null; name?: string };

const BATCH = 12;
let running = false;

async function call(target: Target, extra: { dryRun?: boolean } = {}): Promise<Summary> {
  const res = await fetch("/api/links/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: target.ids, collectionId: target.collectionId ?? undefined, limit: BATCH, ...extra }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? "Não foi possível completar os metadados.");
  return json as Summary;
}

/** How many links still lack favicon, cover and description (editors). */
export function pendingEnrichment(target: Target = {}): Promise<number> {
  return call(target, { dryRun: true }).then((s) => s.remaining);
}

/**
 * Fetches metadata for bare links (e.g. right after an import) in small batches,
 * with a cancellable progress toast. Covers and icons appear as the list refreshes.
 */
export function useEnrichRun() {
  const router = useRouter();
  return React.useCallback(
    async (target: Target = {}, opts: { quietWhenNothing?: boolean } = {}) => {
      if (running || target.ids?.length === 0) return;
      running = true;
      const id = `enrich-${Date.now()}`;
      let cancelled = false;
      let done = 0;
      let enriched = 0;
      let total: number | null = null;
      const where = target.name ? ` em “${target.name}”` : "";
      try {
        const chunks = target.ids ? Array.from({ length: Math.ceil(target.ids.length / BATCH) }, (_, i) => target.ids!.slice(i * BATCH, (i + 1) * BATCH)) : [undefined];
        for (const ids of chunks) {
          if (cancelled) break;
          while (!cancelled) {
            const s = await call({ ...target, ids });
            done += s.processed;
            enriched += s.enriched;
            total = target.ids?.length ?? Math.max(total ?? 0, done + s.remaining);
            if (total === 0) break;
            toast.loading(`Buscando ícones e capas${where}… ${done} de ${total}`, {
              id,
              description: "Você pode continuar usando o Waypoint.",
              duration: Infinity,
              action: { label: "Parar", onClick: () => (cancelled = true) },
            });
            if (done % 36 < BATCH) router.refresh();
            if (s.remaining === 0 || s.processed === 0) break;
          }
        }
      } catch (e) {
        toast.error((e as Error).message, { id, duration: 6000, action: undefined, description: undefined });
        running = false;
        return;
      }
      running = false;
      router.refresh();
      if (!total) {
        if (!opts.quietWhenNothing) toast.success("Todos os links já têm metadados", { id });
        else toast.dismiss(id);
        return;
      }
      toast.success(`${enriched} ${enriched === 1 ? "link ganhou" : "links ganharam"} ícone, capa ou descrição`, {
        id,
        duration: 6000,
        action: undefined,
        description: done > enriched ? `${done - enriched} sem metadados disponíveis no site.` : undefined,
      });
    },
    [router],
  );
}
