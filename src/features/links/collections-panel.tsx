"use client";
import * as React from "react";
import Link from "next/link";
import {
  Archive,
  ChevronRight,
  Clock,
  FolderMinus,
  FolderPlus,
  Inbox,
  LayoutGrid,
  Link2,
  Lock,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  ScanSearch,
  Share2,
  ShieldCheck,
  Star,
  Trash2,
  Type,
  Unlink,
  Upload,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/popover";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { CollectionGlyph, tagTint } from "./collection-style";
import { dropPosition, endDrag, getDrag, startDrag } from "./dnd";
import { getJson, PREF_EXPANDED, setJson } from "./prefs";
import { savedSearchHref, type LibraryCounts, type SavedSearchItem, type Scope, type TagCount, type TreeNode } from "./types";

export type PanelHandlers = {
  newCollection: (parent: TreeNode | null) => void;
  edit: (node: TreeNode) => void;
  rename: (node: TreeNode, name: string) => void;
  share: (node: TreeNode) => void;
  togglePin: (node: TreeNode) => void;
  archive: (node: TreeNode) => void;
  remove: (node: TreeNode) => void;
  moveCollection: (id: string, parentId: string | null, index?: number) => void;
  moveLinks: (ids: string[], collectionId: string | null) => void;
  tagHref: (tag: string) => string;
  /** Checks the links of a collection (with subcollections) or of the whole library (null). */
  checkHealth: (node: TreeNode | null) => void;
  renameSaved: (s: SavedSearchItem) => void;
  deleteSaved: (s: SavedSearchItem) => void;
};

function parentMap(nodes: TreeNode[], parent: string | null = null, out = new Map<string, string | null>()) {
  for (const n of nodes) {
    out.set(n.id, parent);
    parentMap(n.children, n.id, out);
  }
  return out;
}

function isDescendant(nodes: TreeNode[], ancestorId: string, id: string): boolean {
  const find = (ns: TreeNode[]): TreeNode | undefined => {
    for (const n of ns) {
      if (n.id === ancestorId) return n;
      const f = find(n.children);
      if (f) return f;
    }
  };
  const anc = find(nodes);
  if (!anc) return false;
  const walk = (ns: TreeNode[]): boolean => ns.some((n) => n.id === id || walk(n.children));
  return walk(anc.children);
}

const rowBase = "group relative flex h-[30px] items-center gap-1.5 rounded-chip pr-1.5 text-body transition-colors";

export function CollectionsPanel({
  tree,
  currentId,
  scope,
  counts,
  tags,
  activeTags,
  pinned,
  canEdit,
  handlers,
  className,
  saved,
  savedId,
}: {
  className?: string;
  tree: TreeNode[];
  currentId: string | null;
  saved: SavedSearchItem[];
  savedId: string | null;
  scope: Scope;
  counts: LibraryCounts;
  tags: TagCount[];
  activeTags: string[];
  pinned: Set<string>;
  canEdit: boolean;
  handlers: PanelHandlers;
}) {
  const parents = React.useMemo(() => parentMap(tree), [tree]);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    const s = new Set<string>();
    let p = currentId ? parents.get(currentId) : null;
    while (p) {
      s.add(p);
      p = parents.get(p) ?? null;
    }
    return s;
  });
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [rootOver, setRootOver] = React.useState(false);
  const [unsortedOver, setUnsortedOver] = React.useState(false);
  const loaded = React.useRef(false);

  // Restore expanded state and always reveal the current collection.
  React.useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(loaded.current ? prev : getJson<string[]>(PREF_EXPANDED, []));
      loaded.current = true;
      let p = currentId ? parents.get(currentId) : null;
      while (p) {
        next.add(p);
        p = parents.get(p) ?? null;
      }
      return next;
    });
  }, [currentId, parents]);

  const toggle = React.useCallback((id: string, open?: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open ?? !next.has(id)) next.add(id);
      else next.delete(id);
      setJson(PREF_EXPANDED, [...next]);
      return next;
    });
  }, []);

  const quick: { scope: Scope; label: string; icon: React.ReactNode; count?: number; href: string }[] = [
    { scope: "all", label: "Todos", icon: <LayoutGrid />, count: counts.all, href: "/links" },
    { scope: "inbox", label: "Caixa de entrada", icon: <Inbox />, count: counts.inbox || undefined, href: "/links?scope=inbox" },
    { scope: "recent", label: "Recentes", icon: <Clock />, href: "/links?scope=recent" },
    { scope: "starred", label: "Com estrela", icon: <Star />, count: counts.starred, href: "/links?scope=starred" },
    { scope: "unsorted", label: "Sem coleção", icon: <FolderMinus />, count: counts.unsorted, href: "/links?scope=unsorted" },
    { scope: "broken", label: "Quebrados", icon: <Unlink />, count: counts.broken || undefined, href: "/links?scope=broken" },
    { scope: "shared", label: "Compartilhados", icon: <Users />, count: counts.shared || undefined, href: "/links?scope=shared" },
    { scope: "archived", label: "Arquivados", icon: <Archive />, count: counts.archived || undefined, href: "/links?scope=archived" },
  ];

  return (
    <aside aria-label="Coleções" className={cn("flex w-[272px] shrink-0 flex-col border-r border-line bg-surface-2", className)}>
      <div className="flex items-center justify-between px-[18px] pb-3 pt-[18px]">
        <h2 className="text-lead font-semibold">Links</h2>
        {canEdit && (
          <Tooltip content="Nova coleção">
            <Button size="icon-sm" variant="ghost" aria-label="Nova coleção" onClick={() => handlers.newCollection(null)}>
              <Plus />
            </Button>
          </Tooltip>
        )}
      </div>
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3.5 pb-4">
        <nav aria-label="Filtros rápidos" className="flex flex-col gap-px">
          {quick.map((q) => {
            const on = !currentId && !savedId && scope === q.scope;
            const droppable = q.scope === "unsorted" && canEdit;
            return (
              <Link
                key={q.scope}
                href={q.href}
                aria-current={on ? "page" : undefined}
                onDragOver={
                  droppable
                    ? (e) => {
                        if (getDrag()?.kind !== "links") return;
                        e.preventDefault();
                        setUnsortedOver(true);
                      }
                    : undefined
                }
                onDragLeave={droppable ? () => setUnsortedOver(false) : undefined}
                onDrop={
                  droppable
                    ? (e) => {
                        const d = getDrag();
                        setUnsortedOver(false);
                        if (d?.kind !== "links") return;
                        e.preventDefault();
                        handlers.moveLinks(d.ids, null);
                      }
                    : undefined
                }
                className={cn(
                  "flex h-[30px] items-center gap-2.5 rounded-chip px-2 text-body [&_svg]:size-4",
                  on ? "bg-accent-soft font-semibold text-accent-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
                  q.scope === "unsorted" && unsortedOver && "bg-accent-soft ring-2 ring-accent",
                )}
              >
                {q.icon}
                <span className="flex-1">{q.label}</span>
                {q.count != null && (
                  <span
                    className={cn(
                      "text-xs font-normal",
                      q.scope === "broken" ? "font-medium text-danger" : q.scope === "inbox" ? "rounded-full bg-accent px-1.5 font-semibold text-white" : "text-muted",
                    )}
                  >
                    {q.scope === "broken" && <span className="sr-only">: </span>}
                    {q.count}
                  </span>
                )}
              </Link>
            );
          })}
          {canEdit && counts.all > 0 && (
            <button
              type="button"
              onClick={() => handlers.checkHealth(null)}
              className="mt-1 flex h-[30px] items-center gap-2.5 rounded-chip px-2 text-left text-body text-ink-2 hover:bg-hover hover:text-ink [&_svg]:size-4"
            >
              <ShieldCheck aria-hidden />
              <span className="flex-1">Verificar links</span>
            </button>
          )}
        </nav>

        {saved.length > 0 && (
          <nav aria-label="Buscas salvas" className="flex flex-col gap-1.5">
            <SectionLabel className="px-2">Buscas salvas</SectionLabel>
            <ul className="flex flex-col gap-px">
              {saved.map((s) => {
                const on = s.id === savedId;
                return (
                  <li key={s.id} className="group relative">
                    <Link
                      href={savedSearchHref(s)}
                      aria-current={on ? "page" : undefined}
                      title={s.query}
                      className={cn(
                        "flex h-[30px] items-center gap-2.5 rounded-chip px-2 pr-8 text-body [&_svg]:size-4",
                        on ? "bg-accent-soft font-semibold text-accent-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
                      )}
                    >
                      <ScanSearch aria-hidden />
                      <span className="flex-1 truncate">{s.name}</span>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Ações da busca ${s.name}`}
                          className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted opacity-0 hover:bg-hover hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100 [&_svg]:size-4"
                        >
                          <MoreHorizontal />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onSelect={() => handlers.renameSaved(s)}>
                          <Pencil /> Renomear
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem danger onSelect={() => handlers.deleteSaved(s)}>
                          <Trash2 /> Excluir busca
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <div className="flex flex-col gap-1.5">
          <div
            className={cn("flex h-6 items-center justify-between rounded-md px-2", rootOver && "bg-accent-soft ring-2 ring-accent")}
            onDragOver={(e) => {
              const d = getDrag();
              if (!canEdit || d?.kind !== "collection" || !parents.get(d.id)) return;
              e.preventDefault();
              setRootOver(true);
            }}
            onDragLeave={() => setRootOver(false)}
            onDrop={(e) => {
              const d = getDrag();
              setRootOver(false);
              if (d?.kind !== "collection") return;
              e.preventDefault();
              handlers.moveCollection(d.id, null);
            }}
          >
            <SectionLabel>Coleções</SectionLabel>
            {rootOver && <span className="text-caption text-accent-ink">Mover para o topo</span>}
          </div>
          {tree.length === 0 ? (
            <div className="flex flex-col items-start gap-2 px-2 py-1">
              <p className="text-xs leading-5 text-muted">Organize seus links em coleções e subcoleções, como pastas.</p>
              {canEdit && (
                <Button size="sm" variant="soft" onClick={() => handlers.newCollection(null)}>
                  <FolderPlus />
                  Criar coleção
                </Button>
              )}
            </div>
          ) : (
            <ul
              role="tree"
              aria-label="Coleções"
              className="flex flex-col gap-px"
              onKeyDown={(e) => treeKey(e, toggle, canEdit ? (id) => setRenaming(id) : undefined)}
            >
              {tree.map((n) => (
                <TreeRow
                  key={n.id}
                  node={n}
                  depth={0}
                  siblings={tree}
                  tree={tree}
                  currentId={currentId}
                  expanded={expanded}
                  toggle={toggle}
                  renaming={renaming}
                  setRenaming={setRenaming}
                  pinned={pinned}
                  canEdit={canEdit}
                  handlers={handlers}
                />
              ))}
            </ul>
          )}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-col gap-2">
            <SectionLabel className="px-2">Tags</SectionLabel>
            <div className="flex flex-wrap gap-1.5 px-2">
              {tags.slice(0, 14).map((t) => {
                const on = activeTags.includes(t.name);
                return (
                  <Link
                    key={t.name}
                    href={handlers.tagHref(t.name)}
                    aria-pressed={on}
                    title={`${t.count} ${t.count === 1 ? "link" : "links"}`}
                    style={on ? undefined : tagTint(t.color)}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      on
                        ? "border border-accent-line bg-accent-soft font-medium text-accent-ink"
                        : t.color
                          ? "wp-tint font-medium hover:brightness-95"
                          : "bg-subtle text-ink-2 hover:bg-hover hover:text-ink",
                    )}
                  >
                    #{t.name}
                  </Link>
                );
              })}
            </div>
            {tags.length > 14 && (
              <Link href="/tags" className="px-2 text-xs text-muted hover:text-ink">
                Ver todas as {tags.length} tags
              </Link>
            )}
          </div>
        )}
      </div>
      {canEdit && (
        <div className="border-t border-line px-3.5 py-2.5">
          <Link href="/links/import" className="flex h-[34px] items-center gap-2.5 rounded-lg px-2 text-body text-ink-2 hover:bg-hover hover:text-ink">
            <Upload className="size-4" aria-hidden />
            Importar favoritos do navegador
          </Link>
        </div>
      )}
    </aside>
  );
}

type RowProps = {
  node: TreeNode;
  depth: number;
  siblings: TreeNode[];
  tree: TreeNode[];
  currentId: string | null;
  expanded: Set<string>;
  toggle: (id: string, open?: boolean) => void;
  renaming: string | null;
  setRenaming: (id: string | null) => void;
  pinned: Set<string>;
  canEdit: boolean;
  handlers: PanelHandlers;
};

function TreeRow(props: RowProps) {
  const { node, depth, siblings, tree, currentId, expanded, toggle, renaming, setRenaming, pinned, canEdit, handlers } = props;
  const on = node.id === currentId;
  const open = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const [drop, setDrop] = React.useState<"before" | "after" | "inside" | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const hoverTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };

  const onDragOver = (e: React.DragEvent) => {
    const d = getDrag();
    if (!canEdit || !d) return;
    if (d.kind === "collection") {
      if (d.id === node.id || isDescendant(tree, d.id, node.id)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDrop(dropPosition(e, "y", true));
    } else {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDrop("inside");
    }
    if (hasChildren && !open && !hoverTimer.current) hoverTimer.current = setTimeout(() => toggle(node.id, true), 650);
  };
  const onDrop = (e: React.DragEvent) => {
    const d = getDrag();
    const pos = drop;
    setDrop(null);
    clearHover();
    if (!d || !pos) return;
    e.preventDefault();
    if (d.kind === "links") return handlers.moveLinks(d.ids, node.id);
    if (pos === "inside") {
      handlers.moveCollection(d.id, node.id);
      toggle(node.id, true);
      return;
    }
    const rest = siblings.filter((s) => s.id !== d.id);
    const idx = rest.findIndex((s) => s.id === node.id);
    handlers.moveCollection(d.id, node.parentId, pos === "before" ? idx : idx + 1);
  };

  const items = (Item: typeof ContextMenuItem | typeof DropdownMenuItem, Sep: () => React.ReactNode) => (
    <>
      {canEdit && (
        <>
          <Item onSelect={() => handlers.newCollection(node)}>
            <FolderPlus />
            Nova subcoleção
          </Item>
          <Item onSelect={() => setTimeout(() => setRenaming(node.id), 0)}>
            <Type />
            Renomear
          </Item>
          <Item onSelect={() => handlers.edit(node)}>
            <Pencil />
            Editar
          </Item>
        </>
      )}
      <Item onSelect={() => handlers.togglePin(node)}>
        {pinned.has(node.id) ? <PinOff /> : <Pin />}
        {pinned.has(node.id) ? "Desafixar da Início" : "Fixar na Início"}
      </Item>
      {canEdit && (
        <>
          <Item onSelect={() => handlers.share(node)}>
            <Share2 />
            Compartilhar
          </Item>
          <Item onSelect={() => handlers.checkHealth(node)}>
            <ShieldCheck />
            Verificar links
          </Item>
          <Sep />
          <Item onSelect={() => handlers.archive(node)}>
            <Archive />
            Arquivar
          </Item>
          <Item danger onSelect={() => handlers.remove(node)}>
            <Trash2 />
            Excluir
          </Item>
        </>
      )}
    </>
  );

  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-selected={on} aria-level={depth + 1} className="relative">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            draggable={canEdit && renaming !== node.id}
            onDragStart={(e) => {
              e.stopPropagation();
              startDrag(e, { kind: "collection", id: node.id }, { label: node.name });
              setDragging(true);
            }}
            onDragEnd={() => {
              endDrag();
              setDragging(false);
            }}
            onDragOver={onDragOver}
            onDragLeave={() => {
              setDrop(null);
              clearHover();
            }}
            onDrop={onDrop}
            style={{ paddingLeft: 6 + depth * 16 }}
            className={cn(
              rowBase,
              on ? "bg-accent-soft font-semibold text-accent-ink" : "text-ink hover:bg-hover",
              drop === "inside" && "bg-accent-soft ring-2 ring-accent",
              dragging && "opacity-50",
            )}
          >
            {drop === "before" && <span aria-hidden className="absolute -top-px left-2 right-2 h-[2px] rounded bg-accent" />}
            {drop === "after" && <span aria-hidden className="absolute -bottom-px left-2 right-2 h-[2px] rounded bg-accent" />}
            {hasChildren ? (
              <button
                type="button"
                aria-label={open ? `Recolher ${node.name}` : `Expandir ${node.name}`}
                onClick={() => toggle(node.id)}
                className="relative z-10 -ml-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-subtle hover:text-ink"
              >
                <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
              </button>
            ) : (
              <span className="w-[18px] shrink-0" />
            )}
            <CollectionGlyph icon={node.icon} color={node.color} />
            {renaming === node.id ? (
              <RenameInput
                initial={node.name}
                onDone={(name) => {
                  setRenaming(null);
                  if (name && name !== node.name) handlers.rename(node, name);
                }}
              />
            ) : (
              <Link
                href={`/links?c=${node.id}`}
                draggable={false}
                aria-current={on ? "page" : undefined}
                data-tree-id={node.id}
                data-tree-parent={node.parentId ?? ""}
                data-tree-state={hasChildren ? (open ? "open" : "closed") : "leaf"}
                className="min-w-0 flex-1 truncate outline-none after:absolute after:inset-0 after:rounded-chip after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-accent"
                onDoubleClick={(e) => {
                  if (!canEdit) return;
                  e.preventDefault();
                  setRenaming(node.id);
                }}
              >
                {node.name}
              </Link>
            )}
            {node.visibility === "private" && <Lock className="size-3 shrink-0 text-muted" aria-label="Privada" />}
            {(node.visibility === "link" || node.visibility === "public") && <Link2 className="size-3 shrink-0 text-muted" aria-label="Compartilhada" />}
            <span className="shrink-0 text-xs font-normal text-muted group-hover:hidden group-has-[[data-state=open]]:hidden">{node.totalCount || ""}</span>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Ações de ${node.name}`}
                  className="relative z-10 hidden h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-subtle hover:text-ink group-hover:inline-flex focus-visible:inline-flex data-[state=open]:inline-flex"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">{items(DropdownMenuItem, DropdownMenuSeparator)}</DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>{items(ContextMenuItem, ContextMenuSeparator)}</ContextMenuContent>
      </ContextMenu>
      {hasChildren && open && (
        <ul role="group" className="flex flex-col gap-px pt-px">
          {node.children.map((c) => (
            <TreeRow key={c.id} {...props} node={c} depth={depth + 1} siblings={node.children} />
          ))}
        </ul>
      )}
    </li>
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [v, setV] = React.useState(initial);
  const done = React.useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      autoFocus
      aria-label="Novo nome da coleção"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => finish(v.trim())}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(v.trim());
        if (e.key === "Escape") finish(null);
      }}
      className="relative z-10 h-6 min-w-0 flex-1 rounded-md border border-accent bg-surface px-1.5 text-body font-normal text-ink outline-none"
      maxLength={120}
    />
  );
}

/** Arrow-key navigation of the collections tree (WAI-ARIA tree pattern, over the row links). */
function treeKey(e: React.KeyboardEvent<HTMLUListElement>, toggle: (id: string, open?: boolean) => void, rename?: (id: string) => void) {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tree-id]");
  if (!el || e.altKey || e.metaKey || e.ctrlKey) return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-tree-id]"));
  const i = items.indexOf(el);
  const id = el.dataset.treeId!;
  const state = el.dataset.treeState;
  const focus = (t?: HTMLElement | null) => {
    if (!t) return;
    e.preventDefault();
    t.focus();
  };
  switch (e.key) {
    case "ArrowDown":
      return focus(items[i + 1]);
    case "ArrowUp":
      return focus(items[i - 1]);
    case "Home":
      return focus(items[0]);
    case "End":
      return focus(items.at(-1));
    case "ArrowRight":
      e.preventDefault();
      if (state === "closed") toggle(id, true);
      else if (state === "open") items[i + 1]?.focus();
      return;
    case "ArrowLeft":
      e.preventDefault();
      if (state === "open") toggle(id, false);
      else items.find((t) => t.dataset.treeId === el.dataset.treeParent)?.focus();
      return;
    case "F2":
      if (rename) {
        e.preventDefault();
        rename(id);
      }
      return;
  }
}
