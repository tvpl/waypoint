"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, ListTree, PanelLeftClose, PanelLeftOpen, Pin, Plus, Search, Shapes, X } from "lucide-react";
import { Tooltip } from "@/components/ui/popover";
import type { NodeKind } from "@/domain/plan";
import { SectionLabel } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { KIND_LABEL } from "./defaults";
import { ConnectorIcon, KIND_ICON } from "./icons";
import { ResourceRow, setDragPayload, useResourceSearch } from "./resource-picker";
import { LayersPanel } from "./layers-panel";
import { LibraryPanel } from "./library-panel";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/menu";

const SHELVES = [
  { value: "", label: "Tudo" },
  { value: "favorite", label: "Links" },
  { value: "collection", label: "Coleções" },
  { value: "plan", label: "Plans" },
] as const;
type Shelf = (typeof SHELVES)[number]["value"];

const TILES: (NodeKind | "connector" | "draw")[] = ["block", "container", "note", "link", "section", "image", "text", "connector", "draw"];

type Tab = "insert" | "library" | "layers" | "outline";
const TAB_KEY = "wp-planner-left-tab";
const TABS: { id: Tab; label: string; icon: typeof Plus }[] = [
  { id: "insert", label: "Inserir", icon: Plus },
  { id: "library", label: "Biblioteca", icon: Shapes },
  { id: "layers", label: "Camadas", icon: Layers },
  { id: "outline", label: "Estrutura", icon: ListTree },
];

/** Left panel of the editor: insert elements and resources, library, layers and views, or the outline. */
export function Toolbox() {
  const ed = useEditor();
  const p = ed.panels;
  const [tab, setTabState] = useState<Tab>("insert");
  const [flyout, setFlyout] = useState<Tab | null>(null);
  const many = ed.layers.list.length > 1;
  const stripRef = useRef<HTMLElement>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY) as Tab | null;
      if (saved && TABS.some((t) => t.id === saved)) setTabState(saved);
      else if (many) setTabState("layers");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The drawer closes on a click anywhere else (or Esc).
  useEffect(() => {
    if (!flyout) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (stripRef.current?.contains(t) || t?.closest?.("[role=menu], [role=dialog], [data-radix-popper-content-wrapper]")) return;
      setFlyout(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFlyout(null);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [flyout]);
  useEffect(() => {
    if (!p.leftCollapsed) setFlyout(null);
  }, [p.leftCollapsed]);
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {}
  };

  if (p.focus) return null;

  if (p.leftCollapsed) {
    const open = flyout ? TABS.find((t) => t.id === flyout)! : null;
    return (
      <aside ref={stripRef} aria-label="Ferramentas" className="relative z-30 flex w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-3">
        {TABS.map((t) => (
          <Tooltip key={t.id} content={t.label} side="right">
            <button
              type="button"
              aria-label={t.label}
              aria-expanded={flyout === t.id}
              onClick={() => setFlyout((f) => (f === t.id ? null : t.id))}
              className={cn(
                "relative inline-flex size-9 items-center justify-center rounded-lg transition-colors [&_svg]:size-[18px]",
                flyout === t.id ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              <t.icon strokeWidth={1.75} />
              {t.id === "layers" && many && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-white tabular-nums">{ed.layers.list.length}</span>}
            </button>
          </Tooltip>
        ))}
        <span className="flex-1" />
        <Tooltip content="Fixar o painel" side="right">
          <button type="button" aria-label="Expandir o painel" onClick={() => p.setLeftCollapsed(false)} className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink [&_svg]:size-[18px]">
            <PanelLeftOpen strokeWidth={1.75} />
          </button>
        </Tooltip>
        {open && (
          <div role="dialog" aria-label={open.label} className="absolute bottom-2 left-[calc(100%+8px)] top-2 flex w-[288px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-float animate-in">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-line pl-4 pr-1.5">
              <span className="flex items-center gap-2 text-body font-semibold">
                <open.icon className="size-4 text-muted" strokeWidth={1.75} /> {open.label}
              </span>
              <span className="flex items-center gap-0.5">
                <Tooltip content="Fixar o painel lateral">
                  <button
                    type="button"
                    aria-label="Fixar o painel lateral"
                    onClick={() => {
                      setTab(open.id);
                      p.setLeftCollapsed(false);
                    }}
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink [&_svg]:size-3.5"
                  >
                    <Pin />
                  </button>
                </Tooltip>
                <button type="button" aria-label="Fechar" onClick={() => setFlyout(null)} className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink [&_svg]:size-3.5">
                  <X />
                </button>
              </span>
            </div>
            <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto p-4">
              <TabBody tab={open.id} />
            </div>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside aria-label="Ferramentas" className="flex w-[288px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="mx-3 mt-3 flex shrink-0 items-center gap-1">
        <div role="tablist" aria-label="Painel" className="flex min-w-0 flex-1 gap-0.5 rounded-xl bg-subtle p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              aria-label={t.label}
              title={t.label}
              className={cn(
                // The open tab shows its name; the others only their icon.
                "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-lg text-body font-medium transition-colors [&_svg]:size-3.5 [&_svg]:shrink-0",
                tab === t.id ? "flex-1 bg-surface px-2 text-ink shadow-rest" : "w-8 shrink-0 text-ink-2 hover:bg-surface/60 hover:text-ink",
              )}
            >
              <t.icon strokeWidth={2} />
              {tab === t.id && <span className="truncate">{t.label}</span>}
            </button>
          ))}
        </div>
        <Tooltip content="Recolher o painel" side="right">
          <button type="button" aria-label="Recolher o painel" onClick={() => p.setLeftCollapsed(true)} className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink [&_svg]:size-4">
            <PanelLeftClose strokeWidth={1.75} />
          </button>
        </Tooltip>
      </div>
      <div role="tabpanel" className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto p-4">
        <TabBody tab={tab} />
      </div>
    </aside>
  );
}

function TabBody({ tab }: { tab: Tab }) {
  if (tab === "insert") return <InsertTab />;
  if (tab === "library") return <LibraryPanel />;
  if (tab === "layers") return <LayersPanel />;
  return <Outline />;
}

/** Where new things go: a reminder (and switch) in the insert tab when the plan has layers. */
function InsertTarget() {
  const ed = useEditor();
  const L = ed.layers;
  if (L.list.length < 2) return null;
  const layer = L.list.find((l) => l.id === L.active) ?? L.list[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 text-left text-body hover:border-line-2">
          <span className="text-muted">Inserindo em</span>
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: layer.color ?? "var(--muted)" }} aria-hidden />
          <span className="min-w-0 flex-1 truncate font-medium">{layer.name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        <DropdownMenuLabel>Camada ativa</DropdownMenuLabel>
        {[...L.list].reverse().map((l) => (
          <DropdownMenuItem key={l.id} onSelect={() => L.setActive(l.id)}>
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: l.color ?? "var(--muted)" }} aria-hidden />
            <span className="truncate">{l.name}</span>
            {l.id === L.active && <span className="ml-auto text-caption text-accent-ink">ativa</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InsertTab() {
  const ed = useEditor();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const tiles = TILES.filter((t) => !query || (t === "connector" ? "conexão conexao" : t === "draw" ? "desenhar desenho caneta marca-texto seta" : KIND_LABEL[t].toLowerCase()).includes(query));
  const [shelf, setShelf] = useState<Shelf>("");
  const { items, loading } = useResourceSearch(q.trim(), { limit: shelf ? 12 : 3, exclude: ed.planId, types: shelf || undefined });

  return (
    <>
      <InsertTarget />
      <label className="flex h-[34px] shrink-0 items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 text-muted focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
        <Search className="size-[15px] shrink-0" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar elementos e recursos"
          aria-label="Buscar elementos e recursos"
          className="w-full bg-transparent text-body text-ink outline-none"
        />
      </label>

      <section className="flex flex-col gap-2.5">
        <SectionLabel>Elementos</SectionLabel>
        {tiles.length === 0 ? (
          <p className="text-xs text-muted">Nenhum elemento com “{q}”.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {tiles.map((t) => {
              if (t === "draw") {
                const on = ed.tool === "draw";
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => ed.setTool(on ? "select" : "draw")}
                    title="Desenhar à mão livre, destacar ou fazer setas (P)"
                    className={cn(
                      "flex h-[68px] flex-col items-center justify-center gap-1.5 rounded-control border text-xs transition-colors",
                      on ? "border-accent-line bg-accent-soft text-accent-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    <KIND_ICON.ink className="size-5" strokeWidth={1.75} aria-hidden />
                    <span>Desenhar</span>
                  </button>
                );
              }
              if (t === "connector") {
                const on = ed.tool === "connect";
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => ed.setTool(on ? "select" : "connect")}
                    title="Conectar elementos (C)"
                    className={cn(
                      "flex h-[68px] flex-col items-center justify-center gap-1.5 rounded-control border text-xs transition-colors",
                      on ? "border-accent-line bg-accent-soft text-accent-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    <ConnectorIcon className="size-5" strokeWidth={1.75} aria-hidden />
                    <span>Conexão</span>
                  </button>
                );
              }
              const Icon = KIND_ICON[t];
              return (
                <button
                  key={t}
                  type="button"
                  draggable
                  onDragStart={(e) => setDragPayload(e, { type: "kind", kind: t })}
                  onClick={() => ed.addNode(t)}
                  title={`Arraste para o canvas ou clique para adicionar ${KIND_LABEL[t].toLowerCase()}`}
                  className="flex h-[68px] cursor-grab flex-col items-center justify-center gap-1.5 rounded-control border border-line bg-surface text-xs text-ink-2 transition-colors hover:bg-surface-2 active:cursor-grabbing"
                >
                  <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                  <span>{KIND_LABEL[t]}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-1.5">
        <SectionLabel>Recursos</SectionLabel>
        <Segmented size="sm" label="Tipo de recurso" value={shelf} onChange={setShelf} options={SHELVES.map((o) => ({ ...o }))} className="w-full [&>button]:flex-1 [&>button]:justify-center [&>button]:px-1" />
        <p className="text-xs leading-4 text-muted">Arraste para o canvas — ou cole/solte uma URL direto nele.</p>
        <div className="-mx-2 flex flex-col">
          {items === null && loading && <ResourceSkeleton />}
          {items?.map((it) => (
            <ResourceRow key={`${it.ref.type}:${"id" in it.ref ? it.ref.id : ""}`} item={it} draggable onPick={(i) => ed.addResourceNode(i.ref, i.resource)} />
          ))}
          {items && items.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted">{q ? "Nada encontrado na biblioteca." : shelf ? "Nada deste tipo ainda." : "Sua biblioteca ainda está vazia."}</p>
          )}
        </div>
      </section>
    </>
  );
}

function ResourceSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-2.5 py-1.5">
          <span className="size-[26px] animate-pulse rounded-chip bg-subtle" />
          <span className="h-3 flex-1 animate-pulse rounded bg-subtle" />
        </div>
      ))}
    </div>
  );
}

/** Every element as a tree (areas and what is inside them). */
function Outline() {
  const ed = useEditor();
  const rows = useMemo(() => {
    const kids = new Map<string, typeof ed.nodes>();
    const roots: typeof ed.nodes = [];
    const ids = new Set(ed.nodes.map((n) => n.id));
    for (const n of ed.nodes) {
      if (n.parentId && ids.has(n.parentId)) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n]);
      else roots.push(n);
    }
    const order = (list: typeof ed.nodes) => list;
    const out: { node: (typeof ed.nodes)[number]; depth: number }[] = [];
    const walk = (list: typeof ed.nodes, depth: number) => {
      for (const n of order(list)) {
        out.push({ node: n, depth });
        if (depth < 8) walk(kids.get(n.id) ?? [], depth + 1);
      }
    };
    walk(roots, 0);
    return out;
  }, [ed.nodes]);

  return (
    <section className="flex flex-col gap-1.5" aria-label="Estrutura">
      <SectionLabel>Todos os elementos</SectionLabel>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">Os elementos do canvas aparecem aqui.</p>
      ) : (
        <ul className="-mx-2 flex flex-col gap-px" role="tree" aria-label="Estrutura">
          {rows.map(({ node, depth }) => {
            const Icon = KIND_ICON[node.type as NodeKind] ?? KIND_ICON.block;
            const sel = !!node.selected;
            const label = node.data.title || KIND_LABEL[node.type as NodeKind] || "Elemento";
            return (
              <li key={node.id} role="treeitem" aria-selected={sel} aria-level={depth + 1}>
                <button
                  type="button"
                  onClick={(e) => (e.shiftKey ? ed.select([...ed.selectedNodes.map((n) => n.id), node.id]) : ed.select([node.id]))}
                  onDoubleClick={() => ed.focusNode(node.id)}
                  className={cn(
                    "flex h-7 w-full items-center gap-2 rounded-md pr-2 text-left text-body outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                    sel ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-surface-2",
                    node.hidden && "opacity-55",
                  )}
                  style={{ paddingLeft: 8 + depth * 18 }}
                  title={node.hidden ? `${label} (oculto: camada desligada ou container recolhido)` : label}
                >
                  <Icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                  <span className="truncate">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
