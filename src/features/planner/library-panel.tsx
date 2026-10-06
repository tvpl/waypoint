"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileUp, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { LibraryContent, LibraryItem } from "@/domain/library";
import type { PlanNode } from "@/domain/plan";
import { addToLibraryAction, deleteLibraryItemsAction, listLibraryAction, renameLibraryItemAction } from "@/app/(app)/plans/library-actions";
import { ask } from "@/components/ui/ask";
import { SectionLabel } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/popover";
import { cn, slugify } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { fromExcalidraw, parseLibrary, toExcalidrawLib } from "./excalidraw";
import { GlyphSvg } from "./glyph";
import { toPick, useIconSearch, type IconResult } from "./icon-library";
import { inkPaths } from "./ink-geometry";
import { setDragPayload } from "./resource-picker";
import { seedOf, shapePaths } from "./shape-geometry";

type Shelf = "" | "ui" | "brand" | "mine";
const SHELVES: { value: Shelf; label: string }[] = [
  { value: "", label: "Tudo" },
  { value: "ui", label: "Ícones" },
  { value: "brand", label: "Marcas" },
  { value: "mine", label: "Minha" },
];

/** The library tab: icons (interface and brands) and "Minha biblioteca", to click or drag onto the canvas. */
export function LibraryPanel() {
  const ed = useEditor();
  const [q, setQ] = useState("");
  const [shelf, setShelf] = useState<Shelf>("");
  const query = q.trim();
  const { icons, loading } = useIconSearch(query, shelf === "ui" || shelf === "brand" ? shelf : undefined, shelf !== "mine");
  const lib = useLibrary();
  const mine = useMemo(() => (lib.items ?? []).filter((i) => !query || i.name.toLowerCase().includes(query.toLowerCase())), [lib.items, query]);

  return (
    <>
      <label className="flex h-[34px] shrink-0 items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 text-muted focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
        <Search className="size-[15px] shrink-0" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar ícones: banco, usuário, postgres…"
          aria-label="Buscar ícones e itens da biblioteca"
          className="w-full bg-transparent text-body text-ink outline-none"
        />
      </label>
      <Segmented size="sm" label="Mostrar" value={shelf} onChange={setShelf} options={SHELVES} className="w-full [&>button]:flex-1 [&>button]:justify-center [&>button]:px-1" />

      {(shelf === "" || shelf === "mine") && <MyLibrary lib={lib} items={mine} filtered={!!query} />}

      {shelf !== "mine" && (
        <section className="flex flex-col gap-2" aria-label="Ícones">
          <div className="flex items-center justify-between">
            <SectionLabel>{query ? "Ícones encontrados" : shelf === "brand" ? "Marcas" : "Sugeridos"}</SectionLabel>
            {loading && <span className="text-caption text-muted">Buscando…</span>}
          </div>
          {icons && icons.length === 0 ? (
            <p className="text-xs text-muted">Nenhum ícone com “{q}”. Tente em inglês (ex.: “database”).</p>
          ) : (
            <div className="grid grid-cols-6 gap-1">
              {(icons ?? []).map((i) => (
                <IconButton key={i.id} icon={i} onPick={() => ed.addIcon(toPick(i))} />
              ))}
              {!icons && Array.from({ length: 24 }, (_, k) => <span key={k} className="aspect-square animate-pulse rounded-lg bg-subtle" />)}
            </div>
          )}
          <p className="text-caption leading-4 text-muted">Clique ou arraste para o canvas. Ícones de interface: Lucide; marcas: Simple Icons.</p>
        </section>
      )}
    </>
  );
}

function IconButton({ icon, onPick }: { icon: IconResult; onPick: () => void }) {
  return (
    <Tooltip content={icon.name}>
      <button
        type="button"
        draggable
        onDragStart={(e) => setDragPayload(e, { type: "icon", icon: toPick(icon) })}
        onClick={onPick}
        aria-label={`Inserir ícone ${icon.name}`}
        className="flex aspect-square cursor-grab items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink active:cursor-grabbing"
      >
        <GlyphSvg glyph={icon.glyph} size={20} color={icon.set === "brand" ? (icon.color ?? "currentColor") : "currentColor"} strokeWidth={1.75} />
      </button>
    </Tooltip>
  );
}

// ------------------------------------------------------------------ Minha biblioteca

type Lib = ReturnType<typeof useLibrary>;

function useLibrary() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const reload = useCallback(async () => {
    const r = await listLibraryAction();
    if (r.ok) setItems(r.items);
    else setItems([]);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const add = useCallback(
    async (list: { name?: string; content: unknown }[]) => {
      let added = 0;
      for (let i = 0; i < list.length; i += 200) {
        const r = await addToLibraryAction(list.slice(i, i + 200));
        if (!r.ok) {
          toast.error(r.error);
          break;
        }
        added += r.ids.length;
      }
      await reload();
      return added;
    },
    [reload],
  );
  const rename = useCallback(
    async (id: string, name: string) => {
      setItems((l) => l?.map((i) => (i.id === id ? { ...i, name } : i)) ?? l);
      const r = await renameLibraryItemAction(id, name);
      if (!r.ok) toast.error(r.error);
    },
    [],
  );
  const remove = useCallback(async (ids: string[]) => {
    setItems((l) => l?.filter((i) => !ids.includes(i.id)) ?? l);
    const r = await deleteLibraryItemsAction(ids);
    if (!r.ok) toast.error(r.error);
  }, []);
  return { items, reload, add, rename, remove };
}

function MyLibrary({ lib, items, filtered }: { lib: Lib; items: LibraryItem[]; filtered: boolean }) {
  const ed = useEditor();
  const fileRef = useRef<HTMLInputElement>(null);
  const hasSelection = ed.selectedNodes.length > 0;

  const addSelection = async () => {
    const content = ed.selectionFragment();
    if (!content) return void toast.error("Selecione o que quer guardar na biblioteca.");
    const name = await ask.prompt({ title: "Adicionar à biblioteca", description: "Fica disponível em todos os plans deste workspace.", label: "Nome", placeholder: "Ex.: Serviço com fila", confirmLabel: "Adicionar" });
    if (name === null) return;
    if (await lib.add([{ name: name.trim(), content }])) toast.success("Adicionado à biblioteca");
  };

  const importLib = async (file: File) => {
    let parsed: ReturnType<typeof parseLibrary> = null;
    try {
      parsed = parseLibrary(JSON.parse(await file.text()));
    } catch {}
    if (!parsed?.length) return void toast.error("Arquivo não reconhecido. Use uma biblioteca do Excalidraw (.excalidrawlib).");
    const list = parsed.flatMap((it, i) => {
      const r = fromExcalidraw({ ...it.scene, files: {} });
      return r.nodes.length ? [{ name: it.name ?? `${file.name.replace(/\.excalidrawlib$/i, "")} ${i + 1}`, content: { nodes: r.nodes, edges: r.edges } }] : [];
    });
    const added = await lib.add(list);
    if (added) toast.success(`${added} ${added === 1 ? "item importado" : "itens importados"} para a biblioteca`);
  };

  const exportLib = () => {
    const all = lib.items ?? [];
    if (!all.length) return void toast.error("A biblioteca está vazia.");
    const json = toExcalidrawLib(all.map((i) => ({ id: i.id, name: i.name, nodes: i.content.nodes, edges: i.content.edges })));
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(ed.meta.title || "biblioteca")}-biblioteca.excalidrawlib`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <section className="flex flex-col gap-2" aria-label="Minha biblioteca">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Minha biblioteca</SectionLabel>
        <div className="flex items-center gap-0.5">
          <Tooltip content={hasSelection ? "Adicionar a seleção à biblioteca" : "Selecione elementos para guardar"}>
            <button type="button" onClick={() => void addSelection()} disabled={!hasSelection} aria-label="Adicionar seleção à biblioteca" className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40 [&_svg]:size-4">
              <Plus />
            </button>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Opções da biblioteca" className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink [&_svg]:size-4">
                <MoreHorizontal />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                <FileUp /> Importar biblioteca do Excalidraw…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={exportLib}>
                <Download /> Exportar como .excalidrawlib
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".excalidrawlib,application/json,.json"
        className="hidden"
        aria-label="Importar biblioteca do Excalidraw"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void importLib(file);
        }}
      />
      {lib.items === null ? (
        <div className="grid grid-cols-2 gap-2" aria-hidden>
          {[0, 1].map((k) => (
            <span key={k} className="h-[92px] animate-pulse rounded-lg bg-subtle" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-2.5 text-xs leading-4 text-muted">
          {filtered ? "Nenhum item com esse nome." : "Selecione elementos e toque em + para reutilizar em qualquer plan — ou importe uma biblioteca do Excalidraw (libraries.excalidraw.com)."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2" role="list">
          {items.map((it) => (
            <LibraryCard key={it.id} item={it} lib={lib} />
          ))}
        </div>
      )}
    </section>
  );
}

function LibraryCard({ item, lib }: { item: LibraryItem; lib: Lib }) {
  const ed = useEditor();
  return (
    <div role="listitem" className="group relative">
      <button
        type="button"
        draggable
        onDragStart={(e) => setDragPayload(e, { type: "fragment", content: item.content })}
        onClick={() => ed.insertFragment(item.content)}
        title={item.name ? `${item.name} — clique ou arraste para o canvas` : "Clique ou arraste para o canvas"}
        className="flex w-full cursor-grab flex-col overflow-hidden rounded-lg border border-line bg-surface text-left transition-colors hover:border-line-2 hover:bg-surface-2 active:cursor-grabbing"
      >
        <span className="flex h-16 items-center justify-center p-2 text-ink">
          <FragmentThumb content={item.content} />
        </span>
        <span className={cn("truncate border-t border-line px-2 py-1 text-caption", item.name ? "text-ink-2" : "text-muted")}>{item.name || "Sem nome"}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`Opções de ${item.name || "item"}`} className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded-md bg-surface/90 text-muted shadow-thumb hover:text-ink group-hover:inline-flex data-[state=open]:inline-flex [&_svg]:size-3.5">
            <MoreHorizontal />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={async () => {
              const name = await ask.prompt({ title: "Renomear item", label: "Nome", initial: item.name, confirmLabel: "Salvar" });
              if (name !== null) void lib.rename(item.id, name.trim());
            }}
          >
            <Pencil /> Renomear
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem danger onSelect={() => void lib.remove([item.id])}>
            <Trash2 /> Remover da biblioteca
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** A small drawing of a library item (shapes, icons, strokes and connections). */
function FragmentThumb({ content }: { content: LibraryContent }) {
  const drawn = useMemo(() => {
    const byId = new Map(content.nodes.map((n) => [n.id, n]));
    const abs = (n: PlanNode, depth = 0): { x: number; y: number } => {
      const p = n.parentId && depth < 20 ? byId.get(n.parentId) : undefined;
      if (!p) return { x: n.x, y: n.y };
      const pa = abs(p, depth + 1);
      return { x: pa.x + n.x, y: pa.y + n.y };
    };
    const boxes = content.nodes.map((n) => ({ n, ...abs(n) }));
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.n.width));
    const maxY = Math.max(...boxes.map((b) => b.y + b.n.height));
    const center = new Map(boxes.map((b) => [b.n.id, { x: b.x + b.n.width / 2, y: b.y + b.n.height / 2 }]));
    return { boxes: boxes.slice(0, 120), minX, minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY), center };
  }, [content]);
  const pad = Math.max(drawn.w, drawn.h) * 0.04;
  return (
    <svg viewBox={`${drawn.minX - pad} ${drawn.minY - pad} ${drawn.w + pad * 2} ${drawn.h + pad * 2}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      {content.edges.slice(0, 120).map((e) => {
        const a = drawn.center.get(e.source);
        const b = drawn.center.get(e.target);
        return a && b ? <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={e.style?.stroke ?? "currentColor"} strokeWidth={e.style?.strokeWidth ?? 2} vectorEffect="non-scaling-stroke" opacity={0.7} /> : null;
      })}
      {drawn.boxes.map(({ n, x, y }) => (
        <g key={n.id} transform={`translate(${x} ${y})`}>
          <ThumbElement n={n} />
        </g>
      ))}
    </svg>
  );
}

function ThumbElement({ n }: { n: PlanNode }) {
  const shape = n.data.shape;
  if (n.kind === "shape" && shape?.type === "icon" && shape.glyph) {
    const s = Math.min(n.width, n.height - (n.data.title ? 24 : 0));
    return (
      <g transform={`translate(${(n.width - s) / 2} 0) scale(${s / 24})`}>
        {shape.fill && <rect width={24} height={24} rx={5} fill={shape.fill} />}
        {shape.glyph.paths.map((d, i) => (shape.glyph!.filled ? <path key={i} d={d} fill={shape.stroke ?? "currentColor"} /> : <path key={i} d={d} fill="none" stroke={shape.stroke ?? "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />))}
      </g>
    );
  }
  if (n.kind === "shape" && shape?.type === "text") {
    const size = shape.fontSize ?? 20;
    return (
      <text x={4} y={size} fontSize={size} fill={shape.stroke ?? "currentColor"}>
        {n.data.title.slice(0, 40)}
      </text>
    );
  }
  if (n.kind === "shape" && shape) {
    return (
      <>
        {shapePaths(shape, n.width, n.height, { seed: shape.seed ?? seedOf(n.id), ink: "currentColor" }).map((p, i) => (
          <path key={i} d={p.d} fill={p.fill ?? "none"} stroke={p.stroke ?? "none"} strokeWidth={p.strokeWidth} strokeDasharray={p.dash} />
        ))}
      </>
    );
  }
  if (n.kind === "ink" && n.data.ink) {
    const ink = n.data.ink;
    const p = inkPaths(ink);
    const color = n.data.color ?? "currentColor";
    return (
      <g transform={`scale(${n.width / ink.w} ${n.height / ink.h})`}>
        {p.fill ? <path d={p.fill} fill={color} /> : <path d={p.line} fill="none" stroke={color} strokeWidth={ink.size} strokeLinecap="round" />}
        {p.head && <path d={p.head} fill={color} />}
      </g>
    );
  }
  return <rect width={n.width} height={n.height} rx={8} fill={n.data.color ?? "none"} stroke="currentColor" strokeOpacity={0.35} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />;
}
