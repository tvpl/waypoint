"use client";
import * as React from "react";
import { Command } from "cmdk";
import {
  ArrowDownUp,
  BookmarkPlus,
  Check,
  Eye,
  Filter,
  Hash,
  LayoutGrid,
  List,
  Minus,
  MousePointer2,
  Rows3,
  Search,
  Settings2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Kbd, Segmented } from "@/components/ui/misc";
import { SectionLabel } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ADDED_VALUES, IS_LABEL, IS_VALUES, OPERATORS, tokenAt, withoutPendingOperator } from "@/domain/link-query";
import type { SortMode, SummaryMode, TagCount, ViewMode } from "./types";

export const SORT_LABEL: Record<SortMode, string> = {
  manual: "Manual",
  foryou: "Para você",
  recent: "Adicionados",
  visited: "Abertos recentemente",
  opened: "Mais abertos",
  title: "Título",
};

const SORT_HINT: Partial<Record<SortMode, string>> = {
  foryou: "O que você abre com frequência e recentemente",
  manual: "A ordem que você arrastou",
};

const VIEW_META: Record<ViewMode, { label: string; icon: React.ReactNode }> = {
  cards: { label: "Cards", icon: <LayoutGrid /> },
  compact: { label: "Compacto", icon: <Rows3 /> },
  list: { label: "Lista", icon: <List /> },
};

export function Toolbar({
  q,
  onQuery,
  onLiveQuery,
  filterRef,
  placeholder,
  activeTags,
  tags,
  collections,
  domains,
  onToggleTag,
  sort,
  sortOptions,
  onSort,
  summary,
  onSummary,
  view,
  onView,
  onSaveSearch,
}: {
  q: string;
  onQuery: (q: string) => void;
  /** Every keystroke, for instant client-side filtering before the server answers. */
  onLiveQuery?: (q: string) => void;
  filterRef: React.RefObject<HTMLInputElement | null>;
  placeholder: string;
  activeTags: string[];
  tags: TagCount[];
  collections: string[];
  domains: string[];
  onToggleTag: (tag: string) => void;
  sort: SortMode;
  sortOptions: SortMode[];
  onSort: (s: SortMode) => void;
  summary: SummaryMode;
  onSummary: (s: SummaryMode) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  /** Shown when there's a query to save. */
  onSaveSearch?: () => void;
}) {
  const [draft, setDraft] = React.useState(q);
  const [tagOpen, setTagOpen] = React.useState(false);
  const last = React.useRef(q);
  const known = React.useMemo(() => ({ tags, collections, domains }), [tags, collections, domains]);
  // What actually filters: the draft minus an operator still being completed ("tag:re").
  const effective = React.useMemo(() => withoutPendingOperator(draft, known), [draft, known]);

  // Keep the field in sync when the URL changes elsewhere (e.g. "Limpar filtros").
  React.useEffect(() => {
    if (q !== last.current) {
      last.current = q;
      setDraft(q);
      onLiveQuery?.(q);
    }
  }, [q, onLiveQuery]);

  React.useEffect(() => {
    if (effective === last.current) return;
    const t = setTimeout(() => {
      last.current = effective;
      onQuery(effective);
    }, 250);
    return () => clearTimeout(t);
  }, [effective, onQuery]);

  React.useEffect(() => onLiveQuery?.(effective), [effective, onLiveQuery]);

  const change = (v: string) => setDraft(v);

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <QueryField
        inputRef={filterRef}
        value={draft}
        onChange={change}
        placeholder={placeholder}
        tags={tags}
        collections={collections}
        domains={domains}
      />

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
                <Command.Input autoFocus placeholder="Buscar tag…" className="h-full flex-1 bg-transparent text-body outline-none" />
              </div>
              <Command.List className="scrollbar-thin max-h-72 overflow-y-auto p-1.5">
                <Command.Empty className="px-2 py-6 text-center text-body text-muted">{tags.length ? "Nenhuma tag encontrada." : "Ainda não há tags."}</Command.Empty>
                {tags.map((t) => {
                  const on = activeTags.includes(t.name);
                  return (
                    <Command.Item
                      key={t.name}
                      value={t.name}
                      onSelect={() => onToggleTag(t.name)}
                      className="flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-body outline-none data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent-ink"
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
        {onSaveSearch && draft.trim() && (
          <button
            type="button"
            onClick={onSaveSearch}
            className="inline-flex h-7 animate-in items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-accent-ink hover:bg-accent-soft"
          >
            <BookmarkPlus className="size-[13px]" aria-hidden />
            Salvar busca
          </button>
        )}
      </div>

      <div className="flex-1 max-sm:hidden" />

      <DisplayOptions sort={sort} sortOptions={sortOptions} onSort={onSort} summary={summary} onSummary={onSummary} view={view} onView={onView} />
    </div>
  );
}

// ------------------------------------------------------------------ display options

function DisplayOptions({
  sort,
  sortOptions,
  onSort,
  summary,
  onSummary,
  view,
  onView,
}: {
  sort: SortMode;
  sortOptions: SortMode[];
  onSort: (s: SortMode) => void;
  summary: SummaryMode;
  onSummary: (s: SummaryMode) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Segmented<ViewMode>
        label="Modo de visualização"
        value={view}
        onChange={onView}
        options={(Object.keys(VIEW_META) as ViewMode[]).map((v) => ({
          value: v,
          label: <span className="sr-only">{VIEW_META[v].label}</span>,
          icon: VIEW_META[v].icon,
          title: VIEW_META[v].label,
        }))}
      />
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-2 bg-surface px-2.5 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink data-[state=open]:bg-surface-2 data-[state=open]:text-ink"
            aria-label={`Ordenar por ${SORT_LABEL[sort]}`}
          >
            <Settings2 className="size-3.5" aria-hidden />
            <span className="max-sm:hidden">Ordenar</span>
            <span className="text-muted max-sm:hidden">·</span>
            <span className="text-muted">{SORT_LABEL[sort]}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="flex w-[340px] max-w-[calc(100vw-24px)] flex-col gap-4 p-3.5"
        >
          <div className="flex flex-col gap-1.5">
            <SectionLabel className="flex items-center gap-1.5">
              <ArrowDownUp className="size-3" aria-hidden /> Ordenar por
            </SectionLabel>
            <div
              role="radiogroup"
              aria-label="Ordenar por"
              className="flex flex-col gap-px"
            >
              {sortOptions.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={s === sort}
                  onClick={() => onSort(s)}
                  className={cn(
                    "flex min-h-8 items-center gap-2 rounded-md px-2 py-1 text-left text-body",
                    s === sort
                      ? "bg-accent-soft text-accent-ink"
                      : "text-ink-2 hover:bg-hover hover:text-ink",
                  )}
                >
                  <span className="flex flex-1 flex-col">
                    <span className={cn(s === sort && "font-medium")}>
                      {SORT_LABEL[s]}
                    </span>
                    {SORT_HINT[s] && (
                      <span className="text-caption text-muted">
                        {SORT_HINT[s]}
                      </span>
                    )}
                  </span>
                  {s === sort && <Check className="size-3.5" aria-hidden />}
                </button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ------------------------------------------------------------------ query field with operator hints

type Hint = { key: string; insert: string; label: React.ReactNode; detail?: string };

const quote = (v: string) => (/\s/.test(v) ? `"${v}"` : v);

function hintsFor(token: string, data: { tags: TagCount[]; collections: string[]; domains: string[] }): Hint[] {
  const lower = token.toLowerCase();
  const op = /^(-?)([a-z]+):(.*)$/.exec(lower);
  const values = (prefix: string, list: { value: string; detail?: string }[], neg = "") =>
    list
      .filter((v) => v.value.toLowerCase().startsWith(prefix.replace(/^"/, "")))
      .slice(0, 8)
      .map((v) => ({ key: v.value, insert: `${neg}${op?.[2]}:${quote(v.value)} `, label: v.value, detail: v.detail }));
  if (op) {
    const [, neg, key, rest] = op;
    if (key === "tag") return values(rest, data.tags.map((t) => ({ value: t.name, detail: `${t.count}` })), neg);
    if (key === "in") return values(rest, data.collections.map((c) => ({ value: c })));
    if (key === "site") return values(rest, data.domains.map((d) => ({ value: d })), neg);
    if (key === "is") return values(rest, IS_VALUES.map((v) => ({ value: v, detail: IS_LABEL[v] })));
    if (key === "added") return values(rest, ADDED_VALUES.map((v) => ({ value: v.value, detail: v.label })));
    return [];
  }
  if (lower.startsWith("#")) {
    return data.tags
      .filter((t) => t.name.startsWith(lower.slice(1)))
      .slice(0, 8)
      .map((t) => ({ key: t.name, insert: `tag:${quote(t.name)} `, label: `#${t.name}`, detail: `${t.count}` }));
  }
  return OPERATORS.filter((o) => !lower || o.key.startsWith(lower)).map((o) => ({ key: o.key, insert: o.key, label: o.key, detail: `${o.hint} · ${o.example}` }));
}

function QueryField({
  inputRef,
  value,
  onChange,
  placeholder,
  tags,
  collections,
  domains,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  tags: TagCount[];
  collections: string[];
  domains: string[];
}) {
  const listId = React.useId();
  const [focused, setFocused] = React.useState(false);
  const [caret, setCaret] = React.useState(0);
  const [active, setActive] = React.useState(0);
  const [dismissed, setDismissed] = React.useState(false);

  const token = tokenAt(value, caret);
  const hints = React.useMemo(() => hintsFor(token.text, { tags, collections, domains }), [token.text, tags, collections, domains]);
  // Operator hints only when the token could become one (empty, "#…", a prefix of an operator, or "op:…").
  const relevant = token.text === "" ? !value.trim() : /^-?[a-z]*:|^#/.test(token.text) || OPERATORS.some((o) => o.key.startsWith(token.text.toLowerCase()));
  const open = focused && !dismissed && relevant && hints.length > 0;

  React.useEffect(() => setActive(0), [token.text]);

  const apply = (h: Hint) => {
    const next = value.slice(0, token.start) + h.insert + value.slice(token.end).replace(/^\s+/, "");
    onChange(next);
    const pos = token.start + h.insert.length;
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  const sync = (el: HTMLInputElement) => setCaret(el.selectionStart ?? el.value.length);

  return (
    <div className="relative w-full sm:w-auto sm:min-w-[300px] sm:flex-[0_1_420px]">
      <label className="flex h-9 items-center gap-2 rounded-control border border-line-2 bg-surface px-3 text-muted transition-[border,box-shadow] focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
        <Search className="size-4 shrink-0" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setDismissed(false);
            sync(e.target);
          }}
          onSelect={(e) => sync(e.currentTarget)}
          onFocus={(e) => {
            setFocused(true);
            sync(e.currentTarget);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              setActive((i) => (i + (e.key === "ArrowDown" ? 1 : hints.length - 1)) % hints.length);
              return;
            }
            if (open && (e.key === "Tab" || (e.key === "Enter" && token.text)) && hints[active]) {
              e.preventDefault();
              apply(hints[active]);
              return;
            }
            if (e.key === "Escape") {
              if (open) {
                e.stopPropagation();
                setDismissed(true);
              } else if (value) {
                e.stopPropagation();
                onChange("");
              } else (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          spellCheck={false}
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-body text-ink outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {value ? (
          <button type="button" aria-label="Limpar filtro" onClick={() => onChange("")} className="rounded p-0.5 hover:text-ink">
            <X className="size-3.5" />
          </button>
        ) : (
          <Kbd className="px-1 py-0 text-micro">/</Kbd>
        )}
      </label>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Sugestões de busca"
          className="absolute left-0 top-full z-30 mt-1.5 w-full min-w-[280px] animate-in overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-pop"
          onMouseDown={(e) => e.preventDefault()}
        >
          {token.text === "" && <li className="px-2 pb-1 pt-0.5 text-caption font-semibold uppercase tracking-[.06em] text-muted">Refine com operadores</li>}
          {hints.map((h, i) => (
            <li
              key={h.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => apply(h)}
              className={cn("flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-body", i === active && "bg-accent-soft text-accent-ink")}
            >
              {typeof h.label === "string" && h.label.startsWith("#") ? <Hash className="size-3.5 text-muted" aria-hidden /> : null}
              <span className="font-mono text-[12.5px]">{h.label}</span>
              {h.detail && <span className="ml-auto truncate pl-3 text-xs text-muted">{h.detail}</span>}
            </li>
          ))}
          <li className="mt-1 flex items-center gap-3 border-t border-line px-2 pt-1.5 text-caption text-muted">
            <span>
              <Kbd>Tab</Kbd> completar
            </span>
            <span>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> navegar
            </span>
            <span>
              <Kbd>-</Kbd> excluir (ex.: -tag:old)
            </span>
          </li>
        </ul>
      )}
    </div>
  );
}
