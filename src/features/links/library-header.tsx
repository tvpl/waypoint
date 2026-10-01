"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ChevronRight,
  Download,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import type { CurrentCollection } from "./types";

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
}) {
  const router = useRouter();
  const exportHref = (format: string) => `/api/export/links?format=${format}${current ? `&c=${current.id}` : ""}`;
  return (
    <div className="flex flex-col gap-1.5">
      <nav aria-label="Caminho" className="flex min-h-5 items-center gap-1.5 text-[13px] text-muted">
        <Link href="/links" className="hover:text-ink">
          Links
        </Link>
        {current?.path.map((p, i) => (
          <React.Fragment key={p.id}>
            <ChevronRight className="size-3 shrink-0" aria-hidden />
            {i === current.path.length - 1 ? (
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
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="font-display text-[40px] font-normal leading-[1.05] tracking-[-0.005em]">
            {current ? (
              <InlineEdit
                value={current.name}
                placeholder="Sem nome"
                label="Nome da coleção"
                canEdit={canEdit}
                onSave={(v) => v && onRename(v)}
                inputClassName="font-display text-[40px] leading-[1.05] px-1.5 -mx-1.5"
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
        <div className="flex items-center gap-1.5">
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
