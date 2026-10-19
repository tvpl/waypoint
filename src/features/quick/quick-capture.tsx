"use client";
import { QuickTaskItem, quickTaskText } from "@/features/tasks/quick-task-item";
import * as React from "react";
import { Command } from "cmdk";
import { ArrowUpRight, Boxes, CheckCircle2, ClipboardPaste, FolderClosed, Inbox, Search, Tag, Workflow } from "lucide-react";
import { quickCaptureAction } from "@/app/(app)/links/actions";
import type { SearchResponse } from "@/app/api/search/route";
import { Kbd, SiteIcon } from "@/components/ui/misc";
import { getDesktop } from "@/lib/desktop";
import { cn } from "@/lib/utils";
import { pastedUrl } from "@/lib/url";

const itemCls =
  "flex min-h-11 cursor-default items-center gap-3 rounded-control px-3 py-1.5 text-body text-ink outline-none data-[selected=true]:bg-accent-soft data-[selected=true]:text-ink";
const groupCls =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[.06em] [&_[cmdk-group-heading]]:text-muted";

function Tile({ children }: { children: React.ReactNode }) {
  return <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-subtle text-ink-2 [&_svg]:size-[15px]">{children}</span>;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

type Saved = { id: string; title: string; duplicate: boolean };

/**
 * Floating capture window of the desktop app: paste a link to save it to the inbox, or type to
 * search everything. Opens with the global shortcut and hides itself when it loses focus.
 */
export function QuickCapture({ workspaceName, canEdit }: { workspaceName: string; canEdit: boolean }) {
  const [query, setQuery] = React.useState("");
  const [clip, setClip] = React.useState<string | null>(null);
  const [data, setData] = React.useState<SearchResponse | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<Saved | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const hideTimer = React.useRef<number | undefined>(undefined);

  const hide = React.useCallback(() => getDesktop()?.run("quick-hide"), []);
  const openInApp = React.useCallback((path: string) => getDesktop()?.openInMain(path), []);

  // Every time the window is shown: start over and offer the link on the clipboard.
  React.useEffect(() => {
    const reset = async () => {
      window.clearTimeout(hideTimer.current);
      setQuery("");
      setSaved(null);
      setError(null);
      setData(null);
      input.current?.focus();
      try {
        setClip(pastedUrl(await navigator.clipboard.readText()));
      } catch {
        setClip(null);
      }
    };
    void reset();
    // The shell says when it shows the window (the focus event can come before the page may read the clipboard).
    return getDesktop()?.onCommand((id) => id === "app:quick-show" && void reset());
  }, []);

  const typedUrl = pastedUrl(query);
  const taskText = quickTaskText(query);
  const q = typedUrl || taskText !== null ? "" : query.trim();

  React.useEffect(() => {
    if (!q) return setData(null);
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: SearchResponse | null) => setData(d))
        .catch(() => {});
    }, 120);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const save = async (url: string) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const res = await quickCaptureAction(url).catch(() => ({ ok: false as const, error: "Não foi possível salvar." }));
    setSaving(false);
    if (!res.ok) return setError(res.error);
    setSaved(res.data ?? null);
    hideTimer.current = window.setTimeout(hide, 1800);
  };

  const ctrlKey = React.useRef(false);
  const openLink = (l: SearchResponse["links"][number]) => {
    fetch(`/api/links/${l.id}/open`, { method: "POST" }).catch(() => {});
    if (ctrlKey.current) openInApp(`/links?open=${l.id}`);
    else window.open(l.url, "_blank", "noopener,noreferrer");
    hide();
  };
  const go = (path: string) => {
    openInApp(path);
    hide();
  };

  const saveUrl = typedUrl ?? (!query.trim() ? clip : null);

  return (
    <main
      className="wp-quick flex h-dvh flex-col overflow-hidden border border-line-2 bg-surface text-ink"
      onKeyDown={(e) => {
        ctrlKey.current = e.ctrlKey || e.metaKey;
        if (e.key === "Escape") {
          e.preventDefault();
          hide();
        }
      }}
    >
      {saved ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <CheckCircle2 className="size-9 text-success-ink" strokeWidth={1.75} />
          <p className="text-lead font-semibold">{saved.duplicate ? "Esse link já estava salvo" : "Salvo na Caixa de entrada"}</p>
          <p className="max-w-full truncate text-body text-muted">{saved.title}</p>
          <button
            type="button"
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-body text-accent-ink hover:bg-accent-soft"
            onClick={() => go(`/links?open=${saved.id}`)}
          >
            Abrir no Waypoint <ArrowUpRight className="size-[14px]" />
          </button>
        </div>
      ) : (
        <Command shouldFilter={false} loop label="Captura rápida" className="flex min-h-0 flex-1 flex-col">
          <div className="drag flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
            <Search className="size-5 shrink-0 text-muted" />
            <Command.Input
              ref={input}
              autoFocus
              value={query}
              onValueChange={(v) => {
                setQuery(v);
                setError(null);
              }}
              placeholder="Cole um link, digite para buscar ou + para criar tarefa…"
              className="no-drag h-full flex-1 bg-transparent text-lead outline-none placeholder:text-muted"
            />
            {saving && <span className="size-3 animate-spin rounded-full border-2 border-line-2 border-t-accent" aria-label="Salvando" />}
            <Kbd className="no-drag">esc</Kbd>
          </div>
          <Command.List className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-1.5">
            {error && <p className="mx-1 mb-1 rounded-control bg-danger-soft px-3 py-2 text-body text-danger">{error}</p>}
            {taskText && canEdit && (
              <Command.Group heading="Criar" className={groupCls}>
                <QuickTaskItem text={taskText} className={itemCls} onDone={() => {
                    setQuery("");
                    hideTimer.current = window.setTimeout(hide, 1200);
                  }} />
              </Command.Group>
            )}
            {saveUrl && canEdit && (
              <Command.Group heading={typedUrl ? "Salvar" : "Na área de transferência"} className={groupCls}>
                <Command.Item value="save" onSelect={() => void save(saveUrl)} className={itemCls}>
                  <Tile>{typedUrl ? <Inbox /> : <ClipboardPaste />}</Tile>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">Salvar na Caixa de entrada</span>
                    <span className="truncate text-caption text-muted">{hostOf(saveUrl)}</span>
                  </span>
                  <Kbd>↵</Kbd>
                </Command.Item>
              </Command.Group>
            )}
            {saveUrl && !canEdit && <p className="px-3 py-3 text-body text-muted">Você só pode consultar o workspace “{workspaceName}”.</p>}
            {data && (data.plans.length > 0 || data.nodes.length > 0) && (
              <Command.Group heading="Plans" className={groupCls}>
                {data.plans.slice(0, 5).map((p) => (
                  <Command.Item key={`p-${p.id}`} value={`p-${p.id}`} onSelect={() => go(`/plans/${p.id}`)} className={itemCls}>
                    <Tile><Workflow /></Tile>
                    <span className="truncate">{p.title}</span>
                  </Command.Item>
                ))}
                {data.nodes.slice(0, 4).map((n) => (
                  <Command.Item key={`n-${n.planId}-${n.nodeId}`} value={`n-${n.planId}-${n.nodeId}`} onSelect={() => go(`/plans/${n.planId}?node=${n.nodeId}`)} className={itemCls}>
                    <Tile><Boxes /></Tile>
                    <span className="truncate">
                      {n.planTitle} <span className="text-muted">→</span> {n.title}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {data && data.links.length > 0 && (
              <Command.Group heading="Links" className={groupCls}>
                {data.links.slice(0, 6).map((l) => (
                  <Command.Item key={`l-${l.id}`} value={`l-${l.id}`} onSelect={() => openLink(l)} className={itemCls}>
                    <SiteIcon src={l.favicon} label={l.title} size={28} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{l.title}</span>
                      <span className="truncate text-caption text-muted">{l.domain}{l.collectionName ? ` · ${l.collectionName}` : ""}</span>
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {data && (data.collections.length > 0 || data.tags.length > 0) && (
              <Command.Group heading="Coleções e tags" className={groupCls}>
                {data.collections.slice(0, 4).map((c) => (
                  <Command.Item key={`c-${c.id}`} value={`c-${c.id}`} onSelect={() => go(`/links?c=${c.id}`)} className={itemCls}>
                    <Tile><FolderClosed /></Tile>
                    <span className="truncate">{c.name}</span>
                  </Command.Item>
                ))}
                {data.tags.slice(0, 4).map((t) => (
                  <Command.Item key={`t-${t.name}`} value={`t-${t.name}`} onSelect={() => go(`/tags/${encodeURIComponent(t.name)}`)} className={itemCls}>
                    <Tile><Tag /></Tile>
                    <span className="truncate">#{t.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {q && data && data.plans.length + data.nodes.length + data.links.length + data.collections.length + data.tags.length === 0 && (
              <p className="px-3 py-8 text-center text-body text-muted">Nada encontrado para “{q}”.</p>
            )}
            {!q && !saveUrl && taskText === null && (
              <div className="flex flex-col items-center gap-1.5 px-6 py-8 text-center">
                <p className="text-body font-medium text-ink-2">Guarde um link sem sair do que está fazendo</p>
                <p className="text-body text-muted">Copie o endereço e abra esta janela: ele aparece aqui pronto para salvar. Ou digite + e o título para criar uma tarefa.</p>
              </div>
            )}
          </Command.List>
          <footer className={cn("flex h-9 shrink-0 items-center gap-3 border-t border-line px-4 text-caption text-muted")}>
            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navegar</span>
            <span className="flex items-center gap-1"><Kbd>↵</Kbd> abrir</span>
            <span className="flex items-center gap-1"><Kbd>⌘</Kbd><Kbd>↵</Kbd> abrir no Waypoint</span>
            <span className="ml-auto truncate">{workspaceName}</span>
          </footer>
        </Command>
      )}
    </main>
  );
}
