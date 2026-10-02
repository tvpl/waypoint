"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ChevronRight, Copy, Download, FolderPlus, ImagePlus, MoreHorizontal, PanelLeft, Pencil, Pin, PinOff, Plus, Share2, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import type { CurrentCollection, TreeNode } from "./types";
import { CollectionGlyph } from "./collection-style";

function download(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Text that becomes an input on click (editors only). */
function InlineEdit({
  value,
  placeholder,
  onSave,
  multiline,
  className,
  inputClassName,
  label,
  canEdit,
}: {
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  className?: string;
  inputClassName?: string;
  label: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  if (!canEdit) return value ? <span className={className}>{value}</span> : null;
  if (editing) {
    const finish = (save: boolean) => {
      setEditing(false);
      if (save && draft.trim() !== value) onSave(draft.trim());
      else setDraft(value);
    };
    const common = {
      autoFocus: true,
      "aria-label": label,
      value: draft,
      placeholder,
      onBlur: () => finish(true),
      className: cn("w-full rounded-md bg-surface outline-none ring-2 ring-accent/30", inputClassName),
    };
    return multiline ? (
      <textarea
        {...common}
        rows={2}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            finish(true);
          }
          if (e.key === "Escape") {
            e.stopPropagation();
            finish(false);
          }
        }}
      />
    ) : (
      <input
        {...common}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(true);
          if (e.key === "Escape") {
            e.stopPropagation();
            finish(false);
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Clique para editar"
      className={cn("-mx-1.5 rounded-md px-1.5 text-left hover:bg-hover", !value && "text-muted", className)}
    >
      {value || placeholder}
    </button>
  );
}

export function LibraryHeader({
  current,
  title,
  subtitle,
  canEdit,
  pending,
  onRename,
  onDescribe,
  onShare,
  onEdit,
  onNewSub,
  onTogglePin,
  onArchive,
  onDelete,
  onAdd,
  onCheckHealth,
  onEnrich,
  onDuplicates,
  childrenOf,
  onOpenCollections,
}: {
  current: CurrentCollection | null;
  title: string;
  subtitle: string | null;
  canEdit: boolean;
  pending: boolean;
  onRename: (name: string) => void;
  onDescribe: (d: string) => void;
  onShare: () => void;
  onEdit: () => void;
  onNewSub: () => void;
  onTogglePin: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onAdd: () => void;
  onCheckHealth: () => void;
  onEnrich: () => void;
  onDuplicates: () => void;
  /** Collections directly under a collection (null = top level), for the breadcrumb menus. */
  childrenOf: (id: string | null) => TreeNode[];
  /** Phones: opens the collections drawer. */
  onOpenCollections: () => void;
}) {
  const router = useRouter();
  const exportHref = (format: string) => `/api/export/links?format=${format}${current ? `&c=${current.id}` : ""}`;
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onOpenCollections}
        className="-ml-1 mb-1 inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-line-2 bg-surface px-2.5 text-body font-medium text-ink-2 hover:bg-surface-2 hover:text-ink md:hidden [&_svg]:size-4"
      >
        <PanelLeft aria-hidden />
        Coleções
      </button>
      <nav aria-label="Caminho" className="flex min-h-5 min-w-0 items-center gap-1.5 text-body text-muted">
        <Link href="/links" className="hover:text-ink">
          Links
        </Link>
        {(current?.path ?? []).map((p, i, path) => (
          <React.Fragment key={p.id}>
            <CrumbMenu items={childrenOf(i === 0 ? null : path[i - 1].id)} currentId={p.id} />
            {i === path.length - 1 ? (
              <span className="truncate text-ink" aria-current="page">
                {p.name}
              </span>
            ) : (
              <Link href={`/links?c=${p.id}`} className="truncate hover:text-ink">
                {p.name}
              </Link>
            )}
          </React.Fragment>
        ))}
        {pending && <span className="ml-2 h-3 w-3 animate-spin rounded-full border-2 border-line-2 border-t-accent" aria-label="Carregando" />}
      </nav>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 max-sm:basis-full">
          <h1 className="font-display font-normal text-display-sm leading-[1.05] tracking-[-0.01em] sm:text-display">
            {current ? (
              <InlineEdit
                value={current.name}
                placeholder="Sem nome"
                label="Nome da coleção"
                canEdit={canEdit}
                onSave={(v) => v && onRename(v)}
                inputClassName="font-display text-display-sm sm:text-display leading-[1.05] tracking-[-0.01em] px-1.5 -mx-1.5"
              />
            ) : (
              title
            )}
          </h1>
          {current ? (
            <div className="max-w-[720px] text-sm text-muted">
              <InlineEdit
                value={current.description ?? ""}
                placeholder="Adicionar descrição…"
                label="Descrição da coleção"
                canEdit={canEdit}
                multiline
                onSave={onDescribe}
                inputClassName="px-1.5 py-1 -mx-1.5 text-sm text-ink resize-none"
              />
            </div>
          ) : (
            subtitle && <p className="text-sm text-muted">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 max-sm:w-full max-sm:justify-end">
          {current && canEdit && (
            <Tooltip content="Compartilhar coleção">
              <Button size="icon" variant="ghost" aria-label="Compartilhar coleção" onClick={onShare} className="h-9 w-9">
                <Share2 className="!size-[18px]" />
              </Button>
            </Tooltip>
          )}
          <DropdownMenu modal={false}>
            <Tooltip content="Mais ações">
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="Mais ações" className="h-9 w-9">
                  <MoreHorizontal className="!size-[18px]" />
                </Button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="end" className="min-w-[230px]">
              {current && (
                <>
                  {canEdit && (
                    <>
                      <DropdownMenuItem onSelect={onEdit}>
                        <Pencil />
                        Editar coleção
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={onNewSub}>
                        <FolderPlus />
                        Nova subcoleção
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem onSelect={onTogglePin}>
                    {current.pinned ? <PinOff /> : <Pin />}
                    {current.pinned ? "Desafixar da Início" : "Fixar na Início"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {canEdit && (
                <>
                  <DropdownMenuItem onSelect={onCheckHealth}>
                    <ShieldCheck />
                    {current ? "Verificar links desta coleção" : "Verificar links"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onEnrich}>
                    <ImagePlus />
                    Buscar ícones e capas que faltam
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onDuplicates}>
                    <Copy />
                    Encontrar duplicados
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuLabel>{current ? "Exportar esta coleção" : "Exportar biblioteca"}</DropdownMenuLabel>
              {(["html", "csv", "json"] as const).map((f) => (
                <DropdownMenuItem key={f} onSelect={() => download(exportHref(f))}>
                  <Download />
                  {f === "html" ? "HTML (favoritos do navegador)" : f.toUpperCase()}
                </DropdownMenuItem>
              ))}
              {canEdit && (
                <DropdownMenuItem onSelect={() => router.push("/links/import")}>
                  <Upload />
                  Importar favoritos…
                </DropdownMenuItem>
              )}
              {current && canEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onArchive}>
                    <Archive />
                    Arquivar coleção
                  </DropdownMenuItem>
                  <DropdownMenuItem danger onSelect={onDelete}>
                    <Trash2 />
                    Excluir coleção
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {canEdit && (
            <Button variant="primary" onClick={onAdd} className="ml-1">
              <Plus />
              Adicionar link
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Breadcrumb separator that lists the sibling collections at that level. */
function CrumbMenu({ items, currentId }: { items: TreeNode[]; currentId: string }) {
  if (items.length < 2) return <ChevronRight className="size-3 shrink-0" aria-hidden />;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Outras coleções neste nível"
          className="inline-flex h-5 w-4 shrink-0 items-center justify-center rounded text-muted hover:bg-hover hover:text-ink data-[state=open]:bg-hover data-[state=open]:text-ink"
        >
          <ChevronRight className="size-3 transition-transform [[data-state=open]>&]:rotate-90" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[320px] overflow-y-auto">
        {items.map((c) => (
          <DropdownMenuItem key={c.id} asChild>
            <Link href={`/links?c=${c.id}`} className={cn(c.id === currentId && "font-semibold text-accent-ink")}>
              <CollectionGlyph icon={c.icon} color={c.color} />
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-xs text-muted">{c.totalCount}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
