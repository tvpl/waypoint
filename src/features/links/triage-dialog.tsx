"use client";
import * as React from "react";
import { Dialog as D } from "radix-ui";
import { Archive, ArrowLeft, ArrowRight, Check, ExternalLink, FolderInput, PartyPopper, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";
import { suggestCollectionsAction } from "@/app/(app)/links/actions";
import type { CollectionSuggestion } from "@/server/services/link-triage";
import { cn, timeAgo } from "@/lib/utils";
import { isTypingTarget } from "@/lib/dom";
import { CollectionList } from "./collection-picker";
import { CollectionGlyph } from "./collection-style";
import { Cover } from "./cover";
import { recordOpen } from "./link-opener";
import type { LinkItem, TreeNode } from "./types";

export type TriageHandlers = {
  file: (link: LinkItem, collectionId: string) => void;
  archive: (link: LinkItem) => void;
  done: (link: LinkItem) => void;
  star: (link: LinkItem) => Promise<boolean | null>;
};

/**
 * Inbox triage, one link at a time and keyboard-first: 1–9 file into a suggested
 * collection, / picks any collection, a archives, ↵ keeps it where it is, → skips.
 */
export function TriageDialog({
  open,
  onClose,
  links,
  tree,
  handlers,
}: {
  open: boolean;
  onClose: () => void;
  links: LinkItem[];
  tree: TreeNode[];
  handlers: TriageHandlers;
}) {
  // The queue is fixed when the session starts; acted-on links leave it.
  const [queue, setQueue] = React.useState<LinkItem[]>([]);
  const [handled, setHandled] = React.useState(0);
  const [index, setIndex] = React.useState(0);
  const [picking, setPicking] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Record<string, CollectionSuggestion[]>>({});
  const [flash, setFlash] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setQueue(links);
    setHandled(0);
    setIndex(0);
    setPicking(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const link = queue[index] ?? null;
  const total = queue.length + handled;

  // Suggestions for the current link and the next one (prefetch).
  React.useEffect(() => {
    if (!open) return;
    for (const l of [queue[index], queue[index + 1]]) {
      if (!l || suggestions[l.id]) continue;
      setSuggestions((s) => ({ ...s, [l.id]: [] }));
      suggestCollectionsAction(l.id).then((r) => r.ok && setSuggestions((s) => ({ ...s, [l.id]: r.data!.suggestions })));
    }
  }, [open, queue, index, suggestions]);

  const advance = React.useCallback(
    (message: string) => {
      setFlash(message);
      setTimeout(() => setFlash(null), 900);
      setQueue((q) => q.filter((_, i) => i !== index));
      setHandled((h) => h + 1);
      setIndex((i) => Math.min(i, queue.length - 2));
      setPicking(false);
    },
    [index, queue.length],
  );

  const sugg = link ? (suggestions[link.id] ?? []) : [];
  const fileInto = React.useCallback(
    (collectionId: string, name: string) => {
      if (!link) return;
      handlers.file(link, collectionId);
      advance(`Movido para “${name}”`);
    },
    [link, handlers, advance],
  );

  React.useEffect(() => {
    if (!open || !link || picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= 9 && sugg[n - 1]) {
        e.preventDefault();
        fileInto(sugg[n - 1].id, sugg[n - 1].name);
      } else if (e.key === "/" || e.key === "m") {
        e.preventDefault();
        setPicking(true);
      } else if (e.key === "a" || e.key === "#") {
        e.preventDefault();
        handlers.archive(link);
        advance("Arquivado");
      } else if (e.key === "Enter" || e.key === "d") {
        e.preventDefault();
        handlers.done(link);
        advance("Fica em “Sem coleção”");
      } else if (e.key === "s") {
        e.preventDefault();
        void handlers.star(link).then((v) => v != null && setQueue((q) => q.map((x) => (x.id === link.id ? { ...x, starred: v } : x))));
      } else if (e.key === "o") {
        e.preventDefault();
        recordOpen(link.id);
        window.open(link.url, "_blank", "noopener,noreferrer");
      } else if (e.key === "ArrowRight" || e.key === "j") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, queue.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "k") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, link, picking, sugg, fileInto, handlers, advance, queue.length]);

  return (
    <D.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
        <D.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[5vh] z-50 flex max-h-[90vh] w-[calc(100vw-24px)] max-w-[760px] -translate-x-1/2 flex-col overflow-hidden rounded-panel bg-surface text-ink shadow-pop outline-none data-[state=open]:animate-in data-[state=closed]:animate-out"
        >
          <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
            <D.Title className="text-title font-semibold">Triar caixa de entrada</D.Title>
            <span className="text-body text-muted" aria-live="polite">
              {link ? `${Math.min(handled + 1, total)} de ${total}` : `${handled} organizados`}
            </span>
            <span className="flex-1" />
            <D.Close className="inline-flex size-8 items-center justify-center rounded-lg text-ink-2 hover:bg-hover" aria-label="Fechar">
              <X className="size-[18px]" />
            </D.Close>
          </header>
          <div className="h-[3px] bg-subtle" aria-hidden>
            <div className="h-full bg-accent transition-[width] duration-300 ease-[var(--ease-out)]" style={{ width: `${total ? (handled / total) * 100 : 100}%` }} />
          </div>

          {!link ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <span className="inline-flex size-12 animate-in items-center justify-center rounded-xl bg-success-bg text-success-ink">
                <PartyPopper className="size-6" aria-hidden />
              </span>
              <p className="font-display text-display-sm leading-none">Caixa zerada</p>
              <p className="text-body text-muted">{handled ? `${handled} ${handled === 1 ? "link organizado" : "links organizados"}. ` : ""}Nada esperando por você.</p>
              <Button variant="primary" onClick={onClose} className="mt-2">
                Fechar
              </Button>
            </div>
          ) : picking ? (
            <div className="flex min-h-0 flex-col">
              <p className="px-5 pt-3 text-body text-muted">Mover “{link.title}” para…</p>
              <CollectionList
                tree={tree}
                allowNone={false}
                onSelect={(id) => {
                  const name = findName(tree, id) ?? "coleção";
                  if (id) fileInto(id, name);
                }}
              />
              <div className="border-t border-line px-5 py-2.5 text-right">
                <Button size="sm" variant="ghost" onClick={() => setPicking(false)}>
                  Voltar
                </Button>
              </div>
            </div>
          ) : (
            <div key={link.id} className="scrollbar-thin flex min-h-0 animate-in flex-col gap-5 overflow-y-auto p-5 sm:flex-row">
              <article className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-line">
                <div className="relative h-[150px] overflow-hidden">
                  <Cover link={link} />
                  {flash && (
                    <span className="absolute inset-x-0 bottom-0 animate-in bg-ink/80 px-3 py-1.5 text-center text-body font-medium text-bg">
                      <Check className="mr-1 inline size-3.5" aria-hidden />
                      {flash}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 p-4">
                  <a href={link.url} target="_blank" rel="noopener noreferrer" onClick={() => recordOpen(link.id)} className="line-clamp-3 text-lead font-semibold hover:underline">
                    {link.title}
                  </a>
                  <span className="font-mono text-caption text-muted">
                    {link.domain} · salvo {timeAgo(link.createdAt)}
                  </span>
                  {link.description && <p className="line-clamp-4 text-body leading-5 text-ink-2">{link.description}</p>}
                  {link.notes && <p className="rounded-control bg-amber-bg/60 px-3 py-2 text-body text-amber-ink">{link.notes}</p>}
                  {link.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {link.tags.map((t) => (
                        <span key={t} className="rounded-full bg-subtle px-2 py-0.5 text-xs text-ink-2">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </article>

              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-[280px]">
                <span className="text-caption font-semibold uppercase tracking-[.06em] text-muted">Mover para</span>
                {sugg.length === 0 && <span className="text-body text-muted">Sem sugestões ainda — escolha uma coleção.</span>}
                {sugg.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => fileInto(s.id, s.name)}
                    className="group flex items-center gap-2.5 rounded-control border border-line px-2.5 py-2 text-left hover:border-accent-line hover:bg-accent-soft"
                  >
                    <Kbd>{String(i + 1)}</Kbd>
                    <CollectionGlyph icon={s.icon} color={s.color} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body font-medium">{s.name}</span>
                      <span className="truncate text-caption text-muted">{s.reason}</span>
                    </span>
                  </button>
                ))}
                <Button variant="secondary" size="sm" className="justify-start" onClick={() => setPicking(true)}>
                  <FolderInput /> Outra coleção… <Kbd className="ml-auto">/</Kbd>
                </Button>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button variant="secondary" size="sm" onClick={() => (handlers.done(link), advance("Fica em “Sem coleção”"))}>
                    <Check /> Pronto <Kbd className="ml-auto">↵</Kbd>
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => (handlers.archive(link), advance("Arquivado"))}>
                    <Archive /> Arquivar <Kbd className="ml-auto">a</Kbd>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handlers.star(link).then((v) => v != null && setQueue((q) => q.map((x) => (x.id === link.id ? { ...x, starred: v } : x))))}>
                    <Star className={cn(link.starred && "fill-amber-ink text-amber-ink")} /> Estrela <Kbd className="ml-auto">s</Kbd>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => (recordOpen(link.id), window.open(link.url, "_blank", "noopener,noreferrer"))}>
                    <ExternalLink /> Abrir <Kbd className="ml-auto">o</Kbd>
                  </Button>
                </div>
                <div className="mt-auto flex items-center justify-between pt-3 text-caption text-muted">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-ink disabled:opacity-40" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
                    <ArrowLeft className="size-3.5" aria-hidden /> anterior
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-ink disabled:opacity-40"
                    disabled={index >= queue.length - 1}
                    onClick={() => setIndex((i) => i + 1)}
                  >
                    pular <ArrowRight className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            </div>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function findName(nodes: TreeNode[], id: string | null): string | null {
  for (const n of nodes) {
    if (n.id === id) return n.name;
    const f = findName(n.children, id);
    if (f) return f;
  }
  return null;
}
