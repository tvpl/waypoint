"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import {
  Search,
  Workflow,
  Link2,
  Folder,
  Hash,
  Plus,
  FolderPlus,
  Moon,
  Home,
  Tag,
  Settings,
  ArrowRightLeft,
  Upload,
  Boxes,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { cycleTheme, OPEN_PALETTE_EVENT } from "@/lib/theme";
import { Kbd, SiteIcon } from "@/components/ui/misc";
import type { SearchResponse } from "@/app/api/search/route";
import { createPlanAction } from "@/app/(app)/plans/actions";
import { switchWorkspaceAction } from "./actions";

type Scope = "all" | "plans" | "links" | "collections" | "tags";
const SCOPES: { value: Scope; label: string }[] = [
  { value: "all", label: "Tudo" },
  { value: "plans", label: "Plans" },
  { value: "links", label: "Links" },
  { value: "collections", label: "Coleções" },
  { value: "tags", label: "Tags" },
];

/** Renders FTS snippets: [[term]] marks a match. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(\[\[.*?\]\])/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("[[") ? (
          <mark key={i} className="bg-transparent font-semibold text-accent-ink">
            {p.slice(2, -2)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().split(/\s+/)[0];
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-transparent font-semibold text-accent-ink">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

const itemCls =
  "flex min-h-10 cursor-default items-center gap-3 rounded-[10px] px-3 py-1.5 text-sm text-ink outline-none data-[selected=true]:bg-accent-soft data-[selected=true]:text-ink";
const groupCls =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[.06em] [&_[cmdk-group-heading]]:text-muted";

function IconTile({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-subtle text-ink-2 [&_svg]:size-[15px]">{children}</span>;
}

export function CommandPalette({ workspaces, currentWorkspaceId }: { workspaces: { id: string; name: string }[]; currentWorkspaceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [, start] = useTransition();
  const metaRef = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = (e: Event) => {
      const q = (e as CustomEvent<{ query?: string }>).detail?.query;
      if (q) setQuery(q);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setScope("all");
      setData(null);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setData(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: SearchResponse | null) => setData(d))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const openLink = useCallback(
    (l: SearchResponse["links"][number]) => {
      setOpen(false);
      fetch(`/api/links/${l.id}/open`, { method: "POST" }).catch(() => {});
      if (metaRef.current || l.openBehavior === "new_tab") window.open(l.url, "_blank", "noopener,noreferrer");
      else router.push(`/links?open=${l.id}`);
    },
    [router],
  );

  const q = query.trim();
  const show = (s: Scope) => scope === "all" || scope === s;
  const actions = [
    { id: "new-plan", label: "Novo plan", icon: <Plus />, run: () => start(async () => { const id = await createPlanAction({}); go(`/plans/${id}/edit`); }) },
    { id: "add-link", label: "Adicionar link", icon: <Link2 />, run: () => go("/links?add=1") },
    { id: "new-col", label: "Nova coleção", icon: <FolderPlus />, run: () => go("/links?newCollection=1") },
    { id: "import", label: "Importar favoritos do navegador", icon: <Upload />, run: () => go("/links/import") },
    { id: "go-home", label: "Ir para Início", icon: <Home />, run: () => go("/") },
    { id: "go-plans", label: "Ir para Planner", icon: <Workflow />, run: () => go("/plans") },
    { id: "go-templates", label: "Ver templates", icon: <Boxes />, run: () => go("/plans?f=templates") },
    { id: "go-links", label: "Ir para Links", icon: <Link2 />, run: () => go("/links") },
    { id: "go-tags", label: "Ir para Tags", icon: <Tag />, run: () => go("/tags") },
    { id: "theme", label: "Alternar tema", icon: <Moon />, run: () => cycleTheme() },
    { id: "settings", label: "Configurações", icon: <Settings />, run: () => go("/settings") },
    ...workspaces
      .filter((w) => w.id !== currentWorkspaceId)
      .map((w) => ({
        id: `ws-${w.id}`,
        label: `Trocar para workspace “${w.name}”`,
        icon: <ArrowRightLeft />,
        run: () => start(async () => { setOpen(false); await switchWorkspaceAction(w.id); router.refresh(); }),
      })),
  ].filter((a) => !q || a.label.toLowerCase().includes(q.toLowerCase()));

  const total =
    (data ? data.plans.length + data.nodes.length + data.links.length + data.collections.length + data.tags.length : 0) + actions.length;

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-scrim" />
        <D.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[10vh] z-50 w-[calc(100vw-32px)] max-w-[680px] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-pop outline-none data-[state=open]:animate-in"
          onKeyDown={(e) => {
            metaRef.current = e.metaKey || e.ctrlKey;
          }}
        >
          <D.Title className="sr-only">Busca e comandos</D.Title>
          <Command shouldFilter={false} loop label="Busca e comandos">
            <div className="flex h-[60px] items-center gap-3 border-b border-line px-[18px]">
              <Search className="size-5 text-muted" />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Buscar plans, blocos, links, coleções, tags…"
                className="h-full flex-1 bg-transparent text-[17px] outline-none"
              />
              {loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-line-2 border-t-accent" aria-label="Buscando" />}
              <Kbd>esc</Kbd>
            </div>
            {q && (
              <div className="flex gap-1.5 border-b border-line px-3.5 py-2.5">
                {SCOPES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setScope(s.value)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs",
                      scope === s.value ? "bg-ink font-semibold text-bg" : "bg-subtle text-muted hover:text-ink",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            <Command.List className="scrollbar-thin max-h-[min(60vh,520px)] overflow-y-auto px-2 pb-2.5 pt-1.5">
              {q && !loading && total === 0 && (
                <Command.Empty className="px-3 py-10 text-center text-sm text-muted">Nada encontrado para “{q}”.</Command.Empty>
              )}
              {data && show("plans") && (data.plans.length > 0 || data.nodes.length > 0) && (
                <Command.Group heading="Plans" className={groupCls}>
                  {data.plans.map((p) => (
                    <Command.Item key={`p-${p.id}`} value={`p-${p.id}`} onSelect={() => go(`/plans/${p.id}`)} className={itemCls}>
                      <IconTile><Workflow /></IconTile>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate"><Highlight text={p.title} query={q} /></span>
                        {p.snippet && <span className="truncate text-xs text-muted"><Snippet text={p.snippet} /></span>}
                      </span>
                    </Command.Item>
                  ))}
                  {data.nodes.map((n) => (
                    <Command.Item key={`n-${n.planId}-${n.nodeId}`} value={`n-${n.planId}-${n.nodeId}`} onSelect={() => go(`/plans/${n.planId}?node=${n.nodeId}`)} className={itemCls}>
                      <IconTile><Boxes /></IconTile>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{n.planTitle} <span className="text-muted">→</span> <Highlight text={n.title} query={q} /></span>
                        {n.snippet && <span className="truncate text-xs text-muted"><Snippet text={n.snippet} /></span>}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {data && show("links") && data.links.length > 0 && (
                <Command.Group heading="Links" className={groupCls}>
                  {data.links.map((l) => (
                    <Command.Item key={`l-${l.id}`} value={`l-${l.id}`} onSelect={() => openLink(l)} className={itemCls}>
                      <SiteIcon src={l.favicon} label={l.title} size={28} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate"><Highlight text={l.title} query={q} /></span>
                        <span className="truncate text-xs text-muted">
                          {l.domain}
                          {l.collectionName ? ` · ${l.collectionName}` : ""}
                        </span>
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {data && show("collections") && data.collections.length > 0 && (
                <Command.Group heading="Coleções" className={groupCls}>
                  {data.collections.map((c) => (
                    <Command.Item key={`c-${c.id}`} value={`c-${c.id}`} onSelect={() => go(`/links?c=${c.id}`)} className={itemCls}>
                      <IconTile><Folder /></IconTile>
                      <span className="truncate"><Highlight text={c.name} query={q} /></span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {data && show("tags") && data.tags.length > 0 && (
                <Command.Group heading="Tags" className={groupCls}>
                  {data.tags.map((t) => (
                    <Command.Item key={`t-${t.name}`} value={`t-${t.name}`} onSelect={() => go(`/tags/${encodeURIComponent(t.name)}`)} className={itemCls}>
                      <IconTile><Hash /></IconTile>
                      <span className="flex-1">#<Highlight text={t.name} query={q} /></span>
                      <span className="text-xs text-muted">
                        {t.links} links · {t.plans} plans
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {scope === "all" && actions.length > 0 && (
                <Command.Group heading="Ações" className={groupCls}>
                  {actions.map((a) => (
                    <Command.Item key={a.id} value={`a-${a.id}`} onSelect={a.run} className={itemCls}>
                      <IconTile>{a.icon}</IconTile>
                      <span>{a.label}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
            <div className="flex items-center gap-4 border-t border-line px-4 py-2.5 text-xs text-muted">
              <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> navegar</span>
              <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> abrir</span>
              <span className="flex items-center gap-1.5"><Kbd>⌘↵</Kbd> nova aba</span>
              <span className="flex-1" />
              {q && data && <span>Busca full-text</span>}
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
