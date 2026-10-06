"use client";
import * as React from "react";
import { Search } from "lucide-react";
import type { NodeKind } from "@/domain/plan";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { KIND_LABEL } from "./defaults";
import { KIND_ICON } from "./icons";
import { COMPONENTS, PACKS, searchComponents } from "./components/registry";
import { ComponentPreview } from "./library-panel";
import { CATEGORY_META, TYPE_META } from "./annotations";
import { ShapeGlyph } from "./canvas-controls";

type Pt = { x: number; y: number };
type Item = { id: string; group: string; label: string; hint?: string; icon: React.ReactNode; run: (at: Pt) => void };

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const ELEMENTS: NodeKind[] = ["block", "note", "container", "section", "link", "text", "image"];
const SHAPES = [
  { type: "rect", label: "Retângulo", words: "retangulo caixa forma" },
  { type: "ellipse", label: "Elipse", words: "elipse circulo forma" },
  { type: "diamond", label: "Losango", words: "losango decisao forma" },
  { type: "hexagon", label: "Hexágono", words: "hexagono preparacao forma" },
  { type: "parallelogram", label: "Paralelogramo", words: "paralelogramo entrada saida dados forma" },
  { type: "triangle", label: "Triângulo", words: "triangulo forma" },
  { type: "cylinder", label: "Cilindro", words: "cilindro banco de dados armazenamento forma" },
  { type: "document", label: "Documento", words: "documento arquivo relatorio forma" },
  { type: "cloud", label: "Nuvem", words: "nuvem cloud internet forma" },
  { type: "speech", label: "Balão de fala", words: "balao fala dialogo forma" },
  { type: "star", label: "Estrela", words: "estrela destaque forma" },
  { type: "text", label: "Texto", words: "texto rotulo" },
  { type: "frame", label: "Quadro", words: "quadro frame pagina area" },
] as const;

/**
 * "/" or a double click on the canvas: search everything that can be added (elements, shapes,
 * components of every kit, annotations) and drop it right there.
 */
export function QuickInsert({ at, onClose }: { at: Pt; onClose: () => void }) {
  const ed = useEditor();
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);
  const items = React.useMemo<Item[]>(() => {
    const t = fold(q.trim());
    const match = (s: string) => !t || fold(s).includes(t);
    const out: Item[] = [];
    for (const k of ELEMENTS) {
      if (!match(`${KIND_LABEL[k]} elemento`)) continue;
      const Icon = KIND_ICON[k];
      out.push({ id: `k:${k}`, group: "Elementos", label: KIND_LABEL[k], icon: <Icon className="size-4" />, run: (p) => ed.addNode(k, { at: p }) });
    }
    for (const s of SHAPES) {
      if (!match(`${s.label} ${s.words}`)) continue;
      const Icon = KIND_ICON.shape;
      const icon = s.type === "text" || s.type === "frame" ? <Icon className="size-4" /> : <ShapeGlyph type={s.type} />;
      out.push({ id: `s:${s.type}`, group: "Formas", label: s.label, icon, run: (p) => ed.addShape(s.type, null, p) });
    }
    for (const type of ["pin", "callout", "highlight", "bracket"] as const) {
      if (!match(`${TYPE_META[type].label} anotacao comentario nota`)) continue;
      const Icon = KIND_ICON.annotation;
      out.push({
        id: `a:${type}`,
        group: "Anotações",
        label: TYPE_META[type].label,
        hint: TYPE_META[type].hint,
        icon: <Icon className="size-4" style={{ color: CATEGORY_META[ed.annotStyle.category].color }} />,
        run: (p) => ed.addAnnotation(null, p, null, { type, category: ed.annotStyle.category }),
      });
    }
    const comps = t ? searchComponents(q) : COMPONENTS.slice(0, 18);
    const packName = new Map<string, string>(PACKS.map((p) => [p.id, p.name]));
    for (const c of comps.slice(0, 40)) {
      out.push({ id: `c:${c.pack}/${c.type}`, group: packName.get(c.pack) ?? "Componentes", label: c.name, icon: <ComponentPreview def={c} w={28} h={22} />, run: (p) => ed.addComponent(c.pack, c.type, p) });
    }
    return out;
  }, [q, ed]);

  React.useEffect(() => setActive(0), [q]);
  React.useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (i: Item) => {
    onClose();
    i.run(at);
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Inserir" className="absolute left-1/2 top-[14vh] flex max-h-[min(520px,70vh)] w-[min(480px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop animate-in">
        <label className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4 text-muted">
          <Search className="size-4 shrink-0" aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(items.length - 1, a + 1)));
              else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
              else if (e.key === "Enter" && items[active]) (e.preventDefault(), pick(items[active]));
              else if (e.key === "Escape") (e.preventDefault(), onClose());
            }}
            placeholder="Inserir aqui: tópico kafka, tabela, lambda, botão, nota…"
            aria-label="O que inserir"
            className="w-full bg-transparent text-body text-ink outline-none"
          />
          <kbd className="rounded border border-line px-1.5 text-caption text-muted">esc</kbd>
        </label>
        <div ref={listRef} role="listbox" aria-label="Resultados" className="flex min-h-0 flex-1 flex-col overflow-y-auto p-1.5">
          {items.length === 0 && <p className="px-3 py-3 text-body text-muted">Nada com “{q}”.</p>}
          {items.map((it, i) => {
            const head = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <React.Fragment key={it.id}>
                {head && <span className="px-2.5 pb-1 pt-2 text-caption font-semibold uppercase tracking-[.06em] text-muted">{head}</span>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  data-i={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => pick(it)}
                  className={cn("flex h-10 shrink-0 items-center gap-3 rounded-lg px-2.5 text-left text-body", i === active ? "bg-accent-soft text-accent-ink" : "text-ink")}
                >
                  <span className="flex w-7 shrink-0 items-center justify-center text-ink-2">{it.icon}</span>
                  <span className="truncate font-medium">{it.label}</span>
                  {it.hint && <span className="truncate text-caption text-muted">{it.hint}</span>}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
