"use client";
import * as React from "react";
import { Command } from "cmdk";
import { Check, ChevronDown, Inbox, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CollectionGlyph } from "./collection-style";
import type { TreeNode } from "./types";

export type FlatCollection = { id: string; name: string; parentPath: string; depth: number; icon: string | null; color: string | null };

export function flattenWithPath(nodes: TreeNode[], prefix: string[] = [], depth = 0): FlatCollection[] {
  return nodes.flatMap((n) => [
    { id: n.id, name: n.name, parentPath: prefix.join(" / "), depth, icon: n.icon, color: n.color },
    ...flattenWithPath(n.children, [...prefix, n.name], depth + 1),
  ]);
}

/** Searchable list of collections showing their path. `null` means "Sem coleção". */
export function CollectionList({
  tree,
  value,
  onSelect,
  allowNone = true,
  noneLabel = "Sem coleção",
  exclude,
  autoFocus = true,
}: {
  tree: TreeNode[];
  value?: string | null;
  onSelect: (id: string | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
  exclude?: Set<string>;
  autoFocus?: boolean;
}) {
  const flat = React.useMemo(() => flattenWithPath(tree).filter((f) => !exclude?.has(f.id)), [tree, exclude]);
  const item =
    "flex h-9 cursor-default items-center gap-2 rounded-md px-2 text-body outline-none data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent-ink";
  return (
    <Command loop label="Escolher coleção" className="flex flex-col">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Search className="size-4 text-muted" aria-hidden />
        <Command.Input autoFocus={autoFocus} placeholder="Buscar coleção…" className="h-full flex-1 bg-transparent text-body outline-none" />
      </div>
      <Command.List className="scrollbar-thin max-h-72 overflow-y-auto p-1.5">
        <Command.Empty className="px-2 py-6 text-center text-body text-muted">Nenhuma coleção encontrada.</Command.Empty>
        {allowNone && (
          <Command.Item value={`__none ${noneLabel}`} onSelect={() => onSelect(null)} className={item}>
            <Inbox className="size-[15px] text-muted" aria-hidden />
            <span className="flex-1">{noneLabel}</span>
            {value === null && <Check className="size-4" aria-hidden />}
          </Command.Item>
        )}
        {flat.map((f) => (
          <Command.Item key={f.id} value={`${f.id} ${f.parentPath} ${f.name}`} onSelect={() => onSelect(f.id)} className={item}>
            <CollectionGlyph icon={f.icon} color={f.color} />
            <span className="min-w-0 flex-1 truncate">
              {f.parentPath && <span className="text-muted">{f.parentPath} / </span>}
              {f.name}
            </span>
            {value === f.id && <Check className="size-4" aria-hidden />}
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}

/** Form control: button showing the selected collection path, opening a searchable popover. */
export function CollectionPicker({
  id,
  tree,
  value,
  onChange,
  className,
  noneLabel = "Sem coleção",
}: {
  id?: string;
  tree: TreeNode[];
  value: string | null;
  onChange: (id: string | null) => void;
  className?: string;
  noneLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const flat = React.useMemo(() => flattenWithPath(tree), [tree]);
  const sel = flat.find((f) => f.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          className={cn(
            "flex h-[38px] w-full items-center gap-2 rounded-control border border-line-2 bg-surface px-3 text-left text-body text-ink outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/15",
            className,
          )}
        >
          {sel ? <CollectionGlyph icon={sel.icon} color={sel.color} /> : <Inbox className="size-[15px] text-muted" aria-hidden />}
          <span className="min-w-0 flex-1 truncate">
            {sel ? (
              <>
                {sel.parentPath && <span className="text-muted">{sel.parentPath} / </span>}
                {sel.name}
              </>
            ) : (
              <span className="text-ink-2">{noneLabel}</span>
            )}
          </span>
          <ChevronDown className="size-3.5 text-muted" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0">
        <CollectionList
          tree={tree}
          value={value}
          noneLabel={noneLabel}
          onSelect={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
