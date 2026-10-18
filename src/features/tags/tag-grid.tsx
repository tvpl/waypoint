"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Hash, MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/misc";
import { deleteTagAction, renameTagAction, setTagColorAction } from "@/app/(app)/tags/actions";
import { COLLECTION_COLORS, colorOf, tagTint } from "@/features/links/collection-style";
import { cn } from "@/lib/utils";
import { ask } from "@/components/ui/ask";

type Tag = { id: string; name: string; links: number; plans: number; color: string | null };

export function TagGrid({ tags, canEdit }: { tags: Tag[]; canEdit: boolean }) {
  const [q, setQ] = useState("");
  const [, start] = useTransition();
  const shown = useMemo(() => tags.filter((t) => t.name.includes(q.trim().toLowerCase().replace(/^#/, ""))), [tags, q]);
  const max = Math.max(1, ...tags.map((t) => t.links + t.plans));

  if (tags.length === 0) {
    return (
      <EmptyState
        icon={<Hash />}
        title="Nenhuma tag ainda"
        description="Tags são compartilhadas entre Planner e Links. Adicione tags a um link ou a um plan e elas aparecem aqui."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <label data-tour="tags-filter" className="flex h-9 w-full max-w-xs items-center gap-2 rounded-control border border-line-2 bg-surface px-3 text-muted transition-[border,box-shadow] focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
        <Search className="size-4" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar tags…" aria-label="Filtrar tags" className="w-full bg-transparent text-sm text-ink outline-none" />
      </label>
      <div data-tour="tags-grid" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((t, i) => (
          <div key={t.id} data-tour={i === 0 ? "tags-card" : undefined} className="group relative flex flex-col gap-3 rounded-card border border-line bg-surface p-4 transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-raise">
            <Link href={`/tags/${encodeURIComponent(t.name)}`} className="absolute inset-0 rounded-card" aria-label={`Abrir tag ${t.name}`} />
            <div className="flex items-center justify-between gap-2">
              <span className={cn("truncate rounded-full text-lead font-semibold", t.color && "wp-tint -ml-1 px-2.5 py-0.5")} style={tagTint(t.color)}>
                <span className={cn(!t.color && "text-muted")}>#</span>
                {t.name}
              </span>
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Ações da tag ${t.name}`} className="relative z-10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Cor</DropdownMenuLabel>
                    <div className="flex flex-wrap gap-1.5 px-2.5 pb-2" role="radiogroup" aria-label={`Cor da tag ${t.name}`}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!t.color}
                        aria-label="Sem cor"
                        onClick={() => start(async () => void (await setTagColorAction(t.id, null)))}
                        className={cn("size-6 rounded-full border border-line-2 bg-subtle", !t.color && "ring-2 ring-accent ring-offset-2 ring-offset-surface")}
                      />
                      {Object.entries(COLLECTION_COLORS).map(([key, c]) => (
                        <button
                          key={key}
                          type="button"
                          role="radio"
                          aria-checked={t.color === key}
                          aria-label={c.label}
                          title={c.label}
                          onClick={() =>
                            start(async () => {
                              const r = await setTagColorAction(t.id, key);
                              if (!r.ok) toast.error(r.error);
                            })
                          }
                          className={cn("size-6 rounded-full", t.color === key && "ring-2 ring-accent ring-offset-2 ring-offset-surface")}
                          style={{ background: c.tint, boxShadow: `inset 0 0 0 1.5px ${colorOf(key).ink}55` }}
                        />
                      ))}
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={async () => {
                        const name = await ask.prompt({ title: `Renomear #${t.name}`, label: "Novo nome", initial: t.name, confirmLabel: "Renomear" });
                        if (name && name !== t.name)
                          start(async () => {
                            const r = await renameTagAction(t.id, name);
                            if (!r.ok) toast.error(r.error);
                          });
                      }}
                    >
                      <Pencil /> Renomear
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      danger
                      onSelect={async () => {
                        const ok = await ask.confirm({
                          title: `Excluir #${t.name}?`,
                          description: `A tag será removida de ${t.links} ${t.links === 1 ? "link" : "links"} e ${t.plans} ${t.plans === 1 ? "plan" : "plans"}.`,
                          confirmLabel: "Excluir",
                          danger: true,
                        });
                        if (ok)
                          start(async () => {
                            const r = await deleteTagAction(t.id);
                            if (!r.ok) toast.error(r.error);
                          });
                      }}
                    >
                      <Trash2 /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <div className="flex items-center gap-4 text-body text-muted">
              <span>
                <b className="font-semibold text-ink">{t.plans}</b> plans
              </span>
              <span>
                <b className="font-semibold text-ink">{t.links}</b> links
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-subtle" aria-hidden>
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, ((t.links + t.plans) / max) * 100)}%`, ...(t.color ? { background: colorOf(t.color).ink } : {}) }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
