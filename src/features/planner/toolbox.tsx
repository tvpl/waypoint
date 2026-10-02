"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { NodeKind } from "@/domain/plan";
import { SectionLabel } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { KIND_LABEL } from "./defaults";
import { ConnectorIcon, KIND_ICON } from "./icons";
import { ResourceRow, setDragPayload, useResourceSearch } from "./resource-picker";

const SHELVES = [
  { value: "", label: "Tudo" },
  { value: "favorite", label: "Links" },
  { value: "collection", label: "Coleções" },
  { value: "plan", label: "Plans" },
] as const;
type Shelf = (typeof SHELVES)[number]["value"];

const TILES: (NodeKind | "connector")[] = ["block", "container", "note", "link", "section", "image", "connector", "text"];

export function Toolbox() {
  const ed = useEditor();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const tiles = TILES.filter((t) => !query || (t === "connector" ? "conexão conexao" : KIND_LABEL[t].toLowerCase()).includes(query));
  const [shelf, setShelf] = useState<Shelf>("");
  const { items, loading } = useResourceSearch(q.trim(), { limit: shelf ? 12 : 3, exclude: ed.planId, types: shelf || undefined });

  return (
    <aside aria-label="Ferramentas" className="scrollbar-thin flex w-[248px] shrink-0 flex-col gap-[22px] overflow-y-auto border-r border-line bg-surface p-4">
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

      <Layers />
    </aside>
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

function Layers() {
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
    <section className="flex flex-col gap-1.5">
      <SectionLabel>Camadas</SectionLabel>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">Os elementos do canvas aparecem aqui.</p>
      ) : (
        <ul className="-mx-2 flex flex-col gap-px" role="tree" aria-label="Camadas">
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
                  title={node.hidden ? `${label} (dentro de um container recolhido)` : label}
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
