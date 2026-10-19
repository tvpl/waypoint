"use client";
import * as React from "react";
import { CornerDownLeft, Search, X } from "lucide-react";
import { cn, prefersReducedMotion } from "@/lib/utils";
import { useDesktop } from "@/lib/desktop";

export type SettingsTab = {
  id: string;
  label: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  /** Extra words the settings search matches (synonyms, what the tab contains). */
  keywords: string[];
  content: React.ReactNode;
};

/** Old anchors (#backups, #api-tokens…) still land on the right tab and section. */
const ANCHOR_TAB: Record<string, string> = {
  perfil: "conta",
  senha: "conta",
  aparencia: "aparencia",
  workspace: "workspace",
  "api-tokens": "integracoes",
  dados: "backup",
  backups: "backup",
  "pontos-de-restauracao": "backup",
  arquivados: "backup",
  lixeira: "backup",
  seguranca: "aplicativo",
  aplicativo: "aplicativo",
};

/** Sections (cards with these ids) the search can point at, with the words that find them. */
const SECTIONS: { id: string; tab: string; label: string; keywords: string[]; desktopOnly?: boolean }[] = [
  { id: "perfil", tab: "conta", label: "Perfil", keywords: ["nome", "e-mail", "email", "senha", "trocar senha"] },
  { id: "aparencia", tab: "aparencia", label: "Tema e movimento", keywords: ["tema", "claro", "escuro", "sistema", "dark mode", "animações", "movimento", "reduzir"] },
  { id: "workspace", tab: "workspace", label: "Nome e pessoas", keywords: ["convidar", "convite", "membros", "pessoas", "papel", "owner", "editor", "viewer", "equipe"] },
  { id: "api-tokens", tab: "integracoes", label: "Tokens de API", keywords: ["token", "api", "extensão", "navegador", "chave", "revogar"] },
  { id: "pontos-de-restauracao", tab: "backup", label: "Pontos de restauração", keywords: ["backup", "restaurar", "recuperar", "cópia", "snapshot", "baixar"] },
  { id: "backups", tab: "backup", label: "Backups do aplicativo", keywords: ["backup", "pasta", "arquivo", "cópia automática"], desktopOnly: true },
  { id: "dados", tab: "backup", label: "Exportar", keywords: ["exportar", "csv", "json", "html", "markdown", "relatório", "importar", "favoritos"] },
  { id: "arquivados", tab: "backup", label: "Arquivados", keywords: ["arquivo", "arquivar", "desarquivar", "restaurar"] },
  { id: "lixeira", tab: "backup", label: "Lixeira", keywords: ["lixeira", "excluídos", "apagados", "restaurar", "esvaziar"] },
  { id: "seguranca", tab: "aplicativo", label: "Segurança", keywords: ["bloqueio", "bloquear", "senha", "cadeado"], desktopOnly: true },
  { id: "aplicativo", tab: "aplicativo", label: "Aplicativo", keywords: ["captura rápida", "atalho global", "endereço local", "porta", "extensão", "inicialização"], desktopOnly: true },
];

/** Lowercase without accents, so "configuracoes" finds "Configurações". */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Every word of the query appears somewhere in the haystack. */
const matches = (haystack: string[], words: string[]) => {
  const text = fold(haystack.join(" "));
  return words.every((w) => text.includes(w));
};

type Result = { kind: "tab"; tab: string; label: string } | { kind: "section"; tab: string; id: string; label: string; tabLabel: string };

/** Settings split into tabs: a side list on wide screens, a scrollable row on phones. `?tab=` deep-links. */
export function SettingsTabs({ tabs, initial }: { tabs: SettingsTab[]; initial: string }) {
  const valid = (id: string | undefined | null) => (id && tabs.some((t) => t.id === id) ? id : null);
  const [active, setActive] = React.useState(valid(initial) ?? tabs[0].id);
  const [query, setQuery] = React.useState("");
  /** Section to scroll to once its tab has rendered. */
  const [pending, setPending] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const desktop = !!useDesktop();
  // Links to another tab while already here (rail, title bar) only change the search params.
  React.useEffect(() => {
    const tab = valid(initial);
    if (tab) setActive(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const select = React.useCallback(
    (id: string, focus = false) => {
      setActive(id);
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      url.hash = "";
      window.history.replaceState(null, "", url);
      if (focus) listRef.current?.querySelector<HTMLElement>(`[data-tab="${id}"]`)?.focus();
    },
    [],
  );

  React.useEffect(() => {
    const fromHash = () => {
      const anchor = decodeURIComponent(window.location.hash.slice(1));
      const tab = valid(ANCHOR_TAB[anchor]) ?? valid(anchor);
      if (!tab) return;
      setActive(tab);
      requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: "start", behavior: "smooth" }));
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  // ---------------------------------------------------------------- search
  const words = React.useMemo(() => fold(query).split(/\s+/).filter(Boolean), [query]);
  const searching = words.length > 0;
  const results = React.useMemo<Result[]>(() => {
    if (!searching) return [];
    const out: Result[] = [];
    for (const t of tabs) {
      if (matches([t.label, t.title, t.description, ...t.keywords], words)) out.push({ kind: "tab", tab: t.id, label: t.label });
      for (const s of SECTIONS) {
        if (s.tab !== t.id || (s.desktopOnly && !desktop)) continue;
        if (matches([s.label, ...s.keywords], words)) out.push({ kind: "section", tab: t.id, id: s.id, label: s.label, tabLabel: t.label });
      }
    }
    return out;
  }, [tabs, words, searching, desktop]);
  const hitTabs = React.useMemo(() => new Set(results.map((r) => r.tab)), [results]);
  const hitSections = React.useMemo(() => results.flatMap((r) => (r.kind === "section" ? [r.id] : [])), [results]);
  const visibleTabs = searching ? tabs.filter((t) => hitTabs.has(t.id)) : tabs;

  const open = (r: Result) => {
    select(r.tab);
    if (r.kind === "section") setPending(r.id);
  };

  // Scroll to the chosen section once its tab's panel is on screen.
  React.useEffect(() => {
    if (!pending) return;
    const el = document.getElementById(pending);
    setPending(null);
    el?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [pending, active]);

  // Mark the matching sections of the open tab (outlined while the search lasts).
  React.useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.querySelectorAll("[data-search-hit]").forEach((el) => el.removeAttribute("data-search-hit"));
    for (const id of hitSections) {
      const el = document.getElementById(id);
      if (el && panel.contains(el)) el.setAttribute("data-search-hit", "");
    }
  }, [hitSections, active]);

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && results[0]) {
      e.preventDefault();
      open(results[0]);
    } else if (e.key === "Escape" && query) {
      e.preventDefault();
      e.stopPropagation();
      setQuery("");
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    const list = visibleTabs.length ? visibleTabs : tabs;
    const i = list.findIndex((t) => t.id === active);
    const next = e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    select(list[(next + list.length) % list.length].id, true);
  };

  const current = tabs.find((t) => t.id === active)!;
  const sectionResults = results.filter((r): r is Extract<Result, { kind: "section" }> => r.kind === "section");
  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
      <div className="flex shrink-0 flex-col gap-3 md:sticky md:top-6 md:w-56">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Buscar nas configurações"
            aria-label="Buscar nas configurações"
            aria-describedby="settings-search-status"
            className="h-9 w-full rounded-control border border-line-2 bg-surface pl-8 pr-8 text-body text-ink outline-none transition-[border,box-shadow] placeholder:text-muted focus:border-accent focus:ring-3 focus:ring-accent/15 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpar busca"
              className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <p id="settings-search-status" className={cn("px-1 text-caption text-muted", !searching && "sr-only")} aria-live="polite">
          {!searching ? "Digite para filtrar as seções. Enter abre o primeiro resultado." : results.length ? (
            <span className="inline-flex items-center gap-1">
              Enter abre <strong className="font-medium text-ink-2">{results[0].label}</strong> <CornerDownLeft className="size-3" aria-hidden />
            </span>
          ) : (
            `Nada encontrado para “${query.trim()}”.`
          )}
        </p>
        <div
          ref={listRef}
          role="tablist"
          aria-label="Seções das configurações"
          aria-orientation="vertical"
          data-tour="settings-tabs"
          onKeyDown={onKey}
          className="scrollbar-none -mx-6 flex shrink-0 gap-1 overflow-x-auto px-6 pb-1 sm:-mx-10 sm:px-10 md:mx-0 md:flex-col md:overflow-visible md:px-0"
        >
          {visibleTabs.map((t) => {
            const on = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                data-tab={t.id}
                data-tour={`settings-tab-${t.id}`}
                aria-selected={on}
                aria-controls={`panel-${t.id}`}
                tabIndex={on || (searching && !visibleTabs.some((v) => v.id === active) && t === visibleTabs[0]) ? 0 : -1}
                onClick={() => select(t.id)}
                className={cn(
                  "group relative flex h-9 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 text-body transition-colors [&_svg]:size-4 [&_svg]:shrink-0",
                  on ? "bg-surface font-medium text-ink shadow-rest ring-1 ring-line" : "text-ink-2 hover:bg-hover hover:text-ink",
                  searching && !on && "bg-accent-soft/60 text-accent-ink",
                )}
              >
                <span className={cn("transition-colors", on || searching ? "text-accent-ink" : "text-muted group-hover:text-ink-2")}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
        {sectionResults.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="px-1 pb-0.5 text-micro font-semibold uppercase tracking-[.08em] text-muted">Seções</span>
            {sectionResults.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => open(r)}
                className={cn(
                  "flex min-h-8 items-center gap-2 rounded-lg px-3 py-1 text-left text-body hover:bg-hover",
                  r === results[0] ? "text-ink ring-1 ring-accent/40" : "text-ink-2",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                <span className="shrink-0 text-caption text-muted">{r.tabLabel}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <section
        key={current.id}
        role="tabpanel"
        id={`panel-${current.id}`}
        aria-labelledby={`tab-${current.id}`}
        className="min-w-0 flex-1 animate-in"
      >
        <header className="flex flex-col gap-1 pb-2">
          <h2 className="text-title font-semibold tracking-tight">{current.title}</h2>
          <p className="max-w-2xl text-body leading-5 text-muted">{current.description}</p>
        </header>
        <div
          ref={panelRef}
          className="flex flex-col [&_[data-search-hit]]:rounded-xl [&_[data-search-hit]]:outline-2 [&_[data-search-hit]]:outline-offset-8 [&_[data-search-hit]]:outline-accent/40 [&_[data-search-hit]>div:first-child>h2]:text-accent-ink"
        >
          {current.content}
        </div>
      </section>
    </div>
  );
}
