"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export type SettingsTab = {
  id: string;
  label: string;
  icon: React.ReactNode;
  title: string;
  description: string;
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
  seguranca: "aplicativo",
  aplicativo: "aplicativo",
};

/** Settings split into tabs: a side list on wide screens, a scrollable row on phones. `?tab=` deep-links. */
export function SettingsTabs({ tabs, initial }: { tabs: SettingsTab[]; initial: string }) {
  const valid = (id: string | undefined | null) => (id && tabs.some((t) => t.id === id) ? id : null);
  const [active, setActive] = React.useState(valid(initial) ?? tabs[0].id);
  const listRef = React.useRef<HTMLDivElement>(null);
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

  const onKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === active);
    const next = e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    select(tabs[(next + tabs.length) % tabs.length].id, true);
  };

  const current = tabs.find((t) => t.id === active)!;
  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Seções das configurações"
        aria-orientation="vertical"
        data-tour="settings-tabs"
        onKeyDown={onKey}
        className="scrollbar-none -mx-6 flex shrink-0 gap-1 overflow-x-auto px-6 pb-1 sm:-mx-10 sm:px-10 md:sticky md:top-6 md:mx-0 md:w-56 md:flex-col md:overflow-visible md:px-0"
      >
        {tabs.map((t) => {
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
              tabIndex={on ? 0 : -1}
              onClick={() => select(t.id)}
              className={cn(
                "group relative flex h-9 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 text-body transition-colors [&_svg]:size-4 [&_svg]:shrink-0",
                on ? "bg-surface font-medium text-ink shadow-rest ring-1 ring-line" : "text-ink-2 hover:bg-hover hover:text-ink",
              )}
            >
              <span className={cn("transition-colors", on ? "text-accent-ink" : "text-muted group-hover:text-ink-2")}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
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
        <div className="flex flex-col">{current.content}</div>
      </section>
    </div>
  );
}
