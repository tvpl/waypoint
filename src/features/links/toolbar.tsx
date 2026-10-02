"use client";
import * as React from "react";
import { Command } from "cmdk";
import { ArrowDownUp, Check, Eye, Filter, LayoutGrid, List, Minus, MousePointer2, Rows3, Search, SlidersHorizontal, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/menu";
import { Kbd, Segmented } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { SortMode, SummaryMode, TagCount, ViewMode } from "./types";

export const SORT_LABEL: Record<SortMode, string> = {
  manual: "Manual",
  foryou: "Para você",
  recent: "Adicionados",
  visited: "Abertos recentemente",
  opened: "Mais abertos",
  title: "Título",
};

export function Toolbar({
  q,
  onQuery,
  filterRef,
  placeholder,
  activeTags,
  tags,
  onToggleTag,
  sort,
  sortOptions,
  onSort,
  summary,
  onSummary,
  view,
  onView,
}: {
  q: string;
  onQuery: (q: string) => void;
  filterRef: React.RefObject<HTMLInputElement | null>;
  placeholder: string;
  activeTags: string[];
  tags: TagCount[];
  onToggleTag: (tag: string) => void;
  sort: SortMode;
  sortOptions: SortMode[];
  onSort: (s: SortMode) => void;
  summary: SummaryMode;
  onSummary: (s: SummaryMode) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
}) {
  const [draft, setDraft] = React.useState(q);
  const [tagOpen, setTagOpen] = React.useState(false);
  const last = React.useRef(q);

  // Keep the field in sync when the URL changes elsewhere (e.g. "Limpar filtros").
  React.useEffect(() => {
    if (q !== last.current) {
      last.current = q;
      setDraft(q);
    }
  }, [q]);

  React.useEffect(() => {
    if (draft === last.current) return;
    const t = setTimeout(() => {
      last.current = draft;
      onQuery(draft);
    }, 250);
    return () => clearTimeout(t);
  }, [draft, onQuery]);

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <label className="flex h-9 w-full items-center sm:w-[260px] gap-2 rounded-[9px] border border-line-2 bg-surface px-3 text-muted transition-[border,box-shadow] focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
        <Search className="size-4 shrink-0" aria-hidden />
        <input
          ref={filterRef}
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              if (draft) {
                e.stopPropagation();
                setDraft("");
              } else (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {draft ? (
          <button type="button" aria-label="Limpar filtro" onClick={() => setDraft("")} className="rounded p-0.5 hover:text-ink">
            <X className="size-3.5" />
          </button>
        ) : (
          <Kbd className="px-1 py-0 text-[10px]">/</Kbd>
        )}
      </label>

      <div className="flex flex-wrap items-center gap-1.5">
        {activeTags.map((t) => (
          <span key={t} className="inline-flex h-7 items-center gap-1 rounded-full border border-accent-line bg-accent-soft pl-2.5 pr-1 text-xs font-medium text-accent-ink">
            #{t}
            <button type="button" aria-label={`Remover filtro ${t}`} onClick={() => onToggleTag(t)} className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-accent-line/40">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <Popover open={tagOpen} onOpenChange={setTagOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-line-2 px-2.5 text-xs text-ink-2 hover:border-ink-2 hover:text-ink"
            >
              <Filter className="size-[13px]" aria-hidden />
              {activeTags.length ? "Tags" : "Filtrar por tag"}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0">
            <Command loop label="Filtrar por tag">
              <div className="flex h-10 items-center gap-2 border-b border-line px-3">
                <Search className="size-4 text-muted" aria-hidden />
                <Command.Input autoFocus placeholder="Buscar tag…" className="h-full flex-1 bg-transparent text-[13px] outline-none" />
              </div>
              <Command.List className="scrollbar-thin max-h-72 overflow-y-auto p-1.5">
                <Command.Empty className="px-2 py-6 text-center text-[13px] text-muted">{tags.length ? "Nenhuma tag encontrada." : "Ainda não há tags."}</Command.Empty>
                {tags.map((t) => {
                  const on = activeTags.includes(t.name);
                  return (
                    <Command.Item
                      key={t.name}
                      value={t.name}
                      onSelect={() => onToggleTag(t.name)}
                      className="flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-[13px] outline-none data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent-ink"
                    >
                      <span className={cn("inline-flex h-4 w-4 items-center justify-center rounded border", on ? "border-accent bg-accent text-white" : "border-line-2")}>
                        {on && <Check className="size-3" aria-hidden />}
                      </span>
                      <span className="flex-1 truncate">#{t.name}</span>
                      <span className="text-xs text-muted">{t.count}</span>
                    </Command.Item>
                  );
                })}
              </Command.List>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex-1 max-sm:hidden" />

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ink-2 hover:bg-hover hover:text-ink" aria-label={`Ordenar: ${SORT_LABEL[sort]}`}>
            <ArrowDownUp className="size-3.5" aria-hidden />
            {SORT_LABEL[sort]}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[180px]">
          <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
          {sortOptions.map((s) => (
            <DropdownMenuItem key={s} onSelect={() => onSort(s)}>
              <span className="flex-1">{SORT_LABEL[s]}</span>
              {s === sort && <Check />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="hidden text-xs text-muted 2xl:inline">Resumo</span>
      <Segmented<SummaryMode>
        label="Exibir resumo"
        value={summary}
        onChange={onSummary}
        options={[
          { value: "default", label: <span className="sr-only xl:not-sr-only">Padrão</span>, icon: <SlidersHorizontal />, title: "Padrão — usa a configuração de cada link" },
          { value: "always", label: <span className="sr-only xl:not-sr-only">Sempre</span>, icon: <Eye />, title: "Sempre mostrar o resumo" },
          { value: "hover", label: <span className="sr-only xl:not-sr-only">Hover</span>, icon: <MousePointer2 />, title: "Mostrar o resumo ao passar o mouse" },
          { value: "hidden", label: <span className="sr-only xl:not-sr-only">Oculto</span>, icon: <Minus />, title: "Ocultar resumos" },
        ]}
      />
      <Segmented<ViewMode>
        label="Modo de visualização"
        value={view}
        onChange={onView}
        options={[
          { value: "cards", label: <span className="sr-only lg:not-sr-only">Cards</span>, icon: <LayoutGrid />, title: "Cards" },
          { value: "compact", label: <span className="sr-only lg:not-sr-only">Compacto</span>, icon: <Rows3 />, title: "Compacto" },
          { value: "list", label: <span className="sr-only lg:not-sr-only">Lista</span>, icon: <List />, title: "Lista" },
        ]}
      />
    </div>
  );
}
