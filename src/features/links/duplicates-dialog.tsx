"use client";
import * as React from "react";
import { toast } from "sonner";
import { Copy, Loader2, Merge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState, SiteIcon } from "@/components/ui/misc";
import { listDuplicatesAction, mergeLinksAction } from "@/app/(app)/links/actions";
import type { DuplicateGroup } from "@/server/services/link-dedupe";
import { cn, domainOf, timeAgo } from "@/lib/utils";

/** Finds links of the same page (ignoring www., http/https, utm_…) and merges them. */
export function DuplicatesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [groups, setGroups] = React.useState<DuplicateGroup[] | null>(null);
  const [keepers, setKeepers] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setGroups(null);
    listDuplicatesAction().then((r) => {
      if (!r.ok) return void toast.error(r.error);
      setGroups(r.data!.groups);
      setKeepers(Object.fromEntries(r.data!.groups.map((g) => [g.key, g.links[0].id])));
    });
  }, [open]);

  const merge = async (list: DuplicateGroup[]) => {
    setBusy(list.length === 1 ? list[0].key : "all");
    let merged = 0;
    for (const g of list) {
      const keeperId = keepers[g.key] ?? g.links[0].id;
      const r = await mergeLinksAction({ keeperId, otherIds: g.links.filter((l) => l.id !== keeperId).map((l) => l.id) });
      if (!r.ok) {
        toast.error(r.error);
        break;
      }
      merged += r.data!.merged;
      setGroups((gs) => gs?.filter((x) => x.key !== g.key) ?? null);
    }
    setBusy(null);
    if (merged) toast.success(`${merged} ${merged === 1 ? "cópia mesclada" : "cópias mescladas"}`, { description: "As cópias foram arquivadas; tags, notas e estrelas ficaram no link mantido." });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent
        title="Links duplicados"
        description="Mesma página salva mais de uma vez. Escolha qual manter: as cópias são arquivadas e tudo o que elas tinham passa para ele."
        className="max-w-[720px]"
      >
        <DialogBody className="gap-3">
          {!groups ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted" aria-label="Procurando duplicados" />
            </div>
          ) : groups.length === 0 ? (
            <EmptyState icon={<Copy />} title="Nenhum duplicado" description="Cada página aparece uma vez só na biblioteca." />
          ) : (
            groups.map((g) => (
              <fieldset key={g.key} className="flex flex-col gap-1.5 rounded-card border border-line p-3">
                <legend className="px-1 font-mono text-caption text-muted">{g.key}</legend>
                {g.links.map((l) => {
                  const on = keepers[g.key] === l.id;
                  return (
                    <label
                      key={l.id}
                      className={cn("flex cursor-pointer items-center gap-3 rounded-control px-2.5 py-2", on ? "bg-accent-soft" : "hover:bg-hover")}
                    >
                      <input type="radio" name={g.key} checked={on} onChange={() => setKeepers((k) => ({ ...k, [g.key]: l.id }))} className="m-0 accent-[var(--accent)]" />
                      <SiteIcon label={domainOf(l.url) || l.title} size={24} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-body font-medium">{l.title}</span>
                        <span className="truncate text-caption text-muted">
                          {l.collectionName ?? "Sem coleção"} · adicionado {timeAgo(l.createdAt)}
                          {l.openCount ? ` · aberto ${l.openCount}×` : ""}
                          {l.tags.length ? ` · ${l.tags.map((t) => `#${t}`).join(" ")}` : ""}
                        </span>
                      </span>
                      {on && <span className="text-caption font-medium text-accent-ink">manter</span>}
                    </label>
                  );
                })}
                <Button size="sm" variant="soft" className="self-end" disabled={!!busy} onClick={() => merge([g])}>
                  {busy === g.key ? <Loader2 className="animate-spin" /> : <Merge />}
                  Mesclar
                </Button>
              </fieldset>
            ))
          )}
        </DialogBody>
        {groups && groups.length > 1 && (
          <DialogFooter className="justify-between">
            <span className="text-body text-muted">{groups.length} páginas com cópias</span>
            <Button variant="primary" disabled={!!busy} onClick={() => merge(groups)}>
              {busy === "all" ? <Loader2 className="animate-spin" /> : <Merge />}
              Mesclar todas
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
