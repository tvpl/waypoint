"use client";
import * as React from "react";
import { Archive, ArchiveRestore, FolderInput, Hash, ShieldCheck, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { normalizeTag } from "@/lib/utils";
import { CollectionList } from "./collection-picker";
import type { TagCount, TreeNode } from "./types";

export function MoveDialog({
  ids,
  tree,
  onClose,
  onMove,
}: {
  ids: string[] | null;
  tree: TreeNode[];
  onClose: () => void;
  onMove: (ids: string[], collectionId: string | null) => void;
}) {
  return (
    <Dialog open={!!ids} onOpenChange={(o) => !o && onClose()}>
      {ids && (
        <DialogContent title={ids.length === 1 ? "Mover link" : `Mover ${ids.length} links`} description="Escolha a coleção de destino." className="max-w-[460px]">
          <div className="border-t border-line">
            <CollectionList
              tree={tree}
              onSelect={(c) => {
                onMove(ids, c);
                onClose();
              }}
            />
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

export function BulkBar({
  count,
  archivedScope,
  tags,
  onMove,
  onTag,
  onArchive,
  onDelete,
  onClear,
  onSelectAll,
  allSelected,
  onCheck,
}: {
  count: number;
  archivedScope: boolean;
  tags: TagCount[];
  onMove: () => void;
  onTag: (tag: string) => void;
  onArchive: () => void;
  onDelete: () => void;
  onClear: () => void;
  onSelectAll: () => void;
  allSelected: boolean;
  onCheck?: () => void;
}) {
  const [tagOpen, setTagOpen] = React.useState(false);
  const [tag, setTag] = React.useState("");
  if (count === 0) return null;
  const submitTag = (t: string) => {
    const n = normalizeTag(t);
    if (!n) return;
    onTag(n);
    setTag("");
    setTagOpen(false);
  };
  const sugg = tags.filter((t) => !tag || t.name.includes(normalizeTag(tag))).slice(0, 6);
  return (
    <div
      role="toolbar"
      aria-label="Ações em lote"
      className="fixed bottom-6 left-1/2 z-40 flex max-w-[calc(100vw-16px)] -translate-x-1/2 items-center gap-1 rounded-2xl border border-line bg-surface p-1.5 pl-4 text-ink shadow-pop animate-in max-sm:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-sm:gap-0 max-sm:pl-3"
    >
      <span className="mr-2 whitespace-nowrap text-body font-medium" aria-live="polite">
        {count}
        <span className="max-sm:sr-only"> {count === 1 ? "selecionado" : "selecionados"}</span>
      </span>
      {!allSelected && (
        <Button size="sm" variant="ghost" onClick={onSelectAll} className="max-sm:px-2">
          <span className="max-sm:hidden">Selecionar todos</span>
          <span className="sm:hidden">Todos</span>
        </Button>
      )}
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <Button size="sm" variant="ghost" onClick={onMove} aria-label="Mover" className="max-sm:px-2">
        <FolderInput />
        <span className="max-sm:hidden">Mover</span>
      </Button>
      <Popover open={tagOpen} onOpenChange={setTagOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" aria-label="Adicionar tag" className="max-sm:px-2">
            <Hash />
            <span className="max-sm:hidden">Adicionar tag</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-60 p-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitTag(tag);
            }}
          >
            <input
              autoFocus
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Nome da tag…"
              aria-label="Nome da tag"
              className="h-8 w-full rounded-md border border-line-2 bg-surface px-2.5 text-body outline-none focus:border-accent"
            />
          </form>
          {sugg.length > 0 && (
            <ul className="mt-1.5 flex flex-col">
              {sugg.map((t) => (
                <li key={t.name}>
                  <button type="button" onClick={() => submitTag(t.name)} className="flex h-7 w-full items-center justify-between rounded-md px-2 text-body hover:bg-hover">
                    #{t.name}
                    <span className="text-xs text-muted">{t.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
      {onCheck && !archivedScope && (
        <Button size="sm" variant="ghost" onClick={onCheck} aria-label="Verificar links selecionados" className="max-sm:px-2">
          <ShieldCheck />
          <span className="max-sm:hidden">Verificar</span>
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={onArchive} aria-label={archivedScope ? "Restaurar" : "Arquivar"} className="max-sm:px-2">
        {archivedScope ? <ArchiveRestore /> : <Archive />}
        <span className="max-sm:hidden">{archivedScope ? "Restaurar" : "Arquivar"}</span>
      </Button>
      <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Excluir" className="text-danger hover:bg-danger-soft hover:text-danger max-sm:px-2">
        <Trash2 />
        <span className="max-sm:hidden">Excluir</span>
      </Button>
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <Button size="icon" variant="ghost" aria-label="Limpar seleção" onClick={onClear}>
        <X />
      </Button>
    </div>
  );
}
