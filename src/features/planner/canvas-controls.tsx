"use client";
import {
  ArrowLeftRight,
  ArrowRight,
  Circle,
  Diamond,
  Eraser,
  Frame,
  Grid3x3,
  Hand,
  Highlighter,
  ImagePlus,
  Layers,
  ListOrdered,
  Magnet,
  Map as MapIcon,
  Minus,
  MessageSquarePlus,
  MoreHorizontal,
  MousePointer2,
  Network,
  PenLine,
  Shapes,
  Square,
  Trash2,
  Type,
  Workflow,
  X,
} from "lucide-react";
import { EDGE_KINDS, type NodeKind } from "@/domain/plan";
import { EDGE_APPEARANCE } from "@/domain/canvas-adapter";
import { Tooltip } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { SHAPE_TOOLS, useEditor, type Tool } from "./editor-context";
import { ConnectorIcon, KIND_ICON } from "./icons";
import { KIND_LABEL } from "./defaults";
import { ArrowheadPicker, FillColors, FontPicker, RoughnessPicker, RoutingPicker, SizePicker, StrokeColors, WidthPicker } from "./style-controls";
import { EdgeSample } from "./edges";
import { ZoomControls, pillBtn } from "./zoom-controls";
import { AnnotateBar, AnnotationsButton } from "./annotations-panel";
import { HIGHLIGHTER_COLOR, INK_COLORS, INK_SIZES, type InkMode } from "./ink-geometry";

const pillOn = "bg-accent-soft text-accent-ink hover:bg-accent-soft hover:text-accent-ink";

function Sep() {
  return <span className="mx-1 h-5 w-px bg-line" aria-hidden />;
}

type DockTool = { id: Tool; label: string; key: string; num?: string; icon: typeof Square };

const DOCK: DockTool[][] = [
  [
    { id: "hand", label: "Mover canvas", key: "H", icon: Hand },
    { id: "select", label: "Selecionar", key: "V", num: "1", icon: MousePointer2 },
  ],
  [
    { id: "rect", label: "Retângulo", key: "R", num: "2", icon: Square },
    { id: "diamond", label: "Losango", key: "D", num: "3", icon: Diamond },
    { id: "ellipse", label: "Elipse", key: "O", num: "4", icon: Circle },
    { id: "arrow", label: "Seta (ligue duas formas arrastando de uma à outra)", key: "A", num: "5", icon: ArrowRight },
    { id: "line", label: "Linha", key: "L", num: "6", icon: Minus },
    { id: "draw", label: "Lápis", key: "P", num: "7", icon: PenLine },
    { id: "text", label: "Texto", key: "T", num: "8", icon: Type },
  ],
];

const WAYPOINT_KINDS: NodeKind[] = ["block", "container", "note", "link", "section", "text"];

/**
 * The drawing dock (bottom center): tools with Excalidraw's keys (1–0 and letters), Waypoint's
 * own elements, then grid, snap, minimap, auto layout and zoom.
 */
export function BottomPill() {
  const ed = useEditor();
  const tool = (t: DockTool) => (
    <Tooltip key={t.id} content={`${t.label} — ${t.num ? `${t.key} ou ${t.num}` : t.key}`} side="top">
      <button type="button" aria-label={t.label} aria-pressed={ed.tool === t.id} className={cn(pillBtn, "relative", ed.tool === t.id && pillOn)} onClick={() => ed.setTool(t.id)}>
        <t.icon strokeWidth={1.75} />
        {t.num && <span className="pointer-events-none absolute bottom-0.5 right-1 text-[8.5px] font-semibold leading-none text-muted">{t.num}</span>}
      </button>
    </Tooltip>
  );
  return (
    <div
      role="toolbar"
      aria-label="Ferramentas do canvas"
      className="wp-no-print absolute bottom-5 left-1/2 z-10 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-2xl border border-line bg-surface p-1 shadow-float"
    >
      {DOCK[0].map(tool)}
      <Sep />
      {DOCK[1].map(tool)}
      <Tooltip content="Imagem — 9" side="top">
        <button type="button" aria-label="Imagem" className={cn(pillBtn, "relative")} onClick={() => ed.addNode("image")}>
          <ImagePlus strokeWidth={1.75} />
          <span className="pointer-events-none absolute bottom-0.5 right-1 text-[8.5px] font-semibold leading-none text-muted">9</span>
        </button>
      </Tooltip>
      {tool({ id: "erase", label: "Borracha", key: "E", num: "0", icon: Eraser })}
      {tool({ id: "frame", label: "Quadro", key: "F", icon: Frame })}
      <Sep />
      {tool({ id: "annotate", label: "Anotar: marcador, balão, chave ou destaque", key: "N", icon: MessageSquarePlus })}
      <AnnotationsButton className={pillBtn} />
      <Sep />
      {tool({ id: "connect", label: "Conectar pelos pontos", key: "C", icon: ConnectorIcon })}
      <DropdownMenu>
        <Tooltip content="Elementos do Waypoint (bloco, container, nota…)" side="top">
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Elementos do Waypoint" className={pillBtn}>
              <Shapes strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent side="top" align="center" sideOffset={10} className="min-w-[200px]">
          <DropdownMenuLabel>Adicionar</DropdownMenuLabel>
          {WAYPOINT_KINDS.map((k) => {
            const Icon = KIND_ICON[k];
            return (
              <DropdownMenuItem key={k} onSelect={() => ed.addNode(k)}>
                <Icon /> {KIND_LABEL[k]}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="hidden lg:contents">
        <Sep />
        <Tooltip content={ed.grid ? "Ocultar grade" : "Mostrar grade"} side="top">
          <button type="button" aria-label="Grade" aria-pressed={ed.grid} className={cn(pillBtn, ed.grid && "text-accent-ink")} onClick={() => ed.setGrid(!ed.grid)}>
            <Grid3x3 strokeWidth={1.75} />
          </button>
        </Tooltip>
        <Tooltip content={ed.snap ? "Desativar encaixe na grade" : "Encaixar na grade"} side="top">
          <button type="button" aria-label="Encaixar na grade" aria-pressed={ed.snap} className={cn(pillBtn, ed.snap && "text-accent-ink")} onClick={() => ed.setSnap(!ed.snap)}>
            <Magnet strokeWidth={1.75} />
          </button>
        </Tooltip>
        <Tooltip content={ed.minimap ? "Ocultar minimapa (M)" : "Mostrar minimapa (M)"} side="top">
          <button type="button" aria-label="Minimapa" aria-pressed={ed.minimap} className={cn(pillBtn, ed.minimap && "text-accent-ink")} onClick={() => ed.setMinimap(!ed.minimap)}>
            <MapIcon strokeWidth={1.75} />
          </button>
        </Tooltip>
        <ArrangeMenu />
      </span>
      <ViewOptionsMenu />
      <Sep />
      <ZoomControls />
    </div>
  );
}

/** Narrow windows: grid, snap, minimap and arrange, folded into one menu. */
function ViewOptionsMenu() {
  const ed = useEditor();
  const n = ed.selectedNodes.length;
  const check = (on: boolean) => <span className={cn("ml-auto text-caption", on ? "text-accent-ink" : "text-muted")}>{on ? "ligado" : "desligado"}</span>;
  return (
    <span className="contents lg:hidden">
      <Sep />
      <DropdownMenu>
        <Tooltip content="Grade, encaixe, minimapa e organizar" side="top">
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Mais opções do canvas" className={pillBtn}>
              <MoreHorizontal strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent side="top" align="end" sideOffset={10} className="min-w-[230px]">
          <DropdownMenuLabel>Canvas</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => ed.setGrid(!ed.grid)}>
            <Grid3x3 /> Grade {check(ed.grid)}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => ed.setSnap(!ed.snap)}>
            <Magnet /> Encaixar na grade {check(ed.snap)}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => ed.setMinimap(!ed.minimap)} shortcut="M">
            <MapIcon /> Minimapa
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{n > 0 ? `Organizar seleção (${n})` : "Organizar o plan"}</DropdownMenuLabel>
          <ArrangeItems Item={DropdownMenuItem} onPick={(d) => ed.autoArrange(d)} />
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

/** While a shape, arrow, line or text tool is on: the style the next one is drawn with. */
function StyleBar() {
  const ed = useEditor();
  const s = ed.style;
  const t = ed.tool;
  const set = ed.setStyle;
  const shape = t === "rect" || t === "diamond" || t === "ellipse";
  const link = t === "arrow" || t === "line";
  const hint =
    t === "text" ? "Clique para escrever" : link ? "Arraste de uma forma a outra para ligar — ou solte no vazio" : t === "frame" ? "Arraste para criar um quadro" : "Arraste para desenhar · ⇧ mantém a proporção";
  return (
    <div className={cn(barCls, "flex-wrap justify-center")} role="toolbar" aria-label="Estilo do desenho">
      <span className="hidden px-2 text-caption text-muted 2xl:inline">{hint}</span>
      {t !== "frame" && (
        <>
          <StrokeColors value={s.stroke} onChange={(stroke) => set({ stroke })} size={18} />
          {shape && (
            <>
              <Sep />
              <FillColors value={s.fill} onChange={(fill) => set({ fill })} size={18} />
            </>
          )}
          {t !== "text" && (
            <>
              <Sep />
              <WidthPicker value={s.strokeWidth} onChange={(strokeWidth) => set({ strokeWidth })} />
              <Sep />
              <RoughnessPicker value={s.roughness} onChange={(roughness) => set({ roughness })} />
            </>
          )}
          {t === "arrow" && (
            <>
              <Sep />
              <ArrowheadPicker label="Ponta final" value={s.end} onChange={(end) => set({ end })} />
            </>
          )}
          {link && (
            <>
              <Sep />
              <RoutingPicker value={s.routing} onChange={(routing) => set({ routing })} />
            </>
          )}
          {t === "text" && (
            <>
              <Sep />
              <FontPicker value={s.font} onChange={(font) => set({ font })} />
              <Sep />
              <SizePicker value={s.fontSize} onChange={(fontSize) => set({ fontSize })} />
            </>
          )}
        </>
      )}
      {ed.layers.list.length > 1 && (
        <>
          <Sep />
          <ActiveLayerPicker />
        </>
      )}
      <Sep />
      <button type="button" className={barBtn} onClick={() => ed.setTool("select")} aria-label="Concluir" title={hint}>
        <X /> <span className="hidden pr-1 xl:inline">Concluir</span>
      </button>
    </div>
  );
}

/** "Organizar automaticamente" — vertical / horizontal flow (selection or whole plan). */
export function ArrangeMenu() {
  const ed = useEditor();
  const n = ed.selectedNodes.length;
  return (
    <DropdownMenu>
      <Tooltip content="Organizar automaticamente" side="top">
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Organizar automaticamente" className={pillBtn}>
            <Workflow strokeWidth={1.75} />
          </button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent side="top" align="center" sideOffset={10} className="min-w-[248px]" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel>{n > 0 ? `Organizar seleção (${n})` : "Organizar o plan"}</DropdownMenuLabel>
        <ArrangeItems Item={DropdownMenuItem} onPick={(d) => ed.autoArrange(d)} />
        <p className="px-2.5 pb-1.5 pt-1 text-caption leading-4 text-muted">
          {n > 0 ? "Só os elementos selecionados (e o interior de containers selecionados) são reorganizados." : "Segue as conexões; notas e itens soltos vão para o fim. Dá para desfazer."}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ItemComp = React.ComponentType<{ onSelect?: (e: Event) => void; shortcut?: string; children?: React.ReactNode }>;

export function ArrangeItems({ Item, onPick }: { Item: ItemComp; onPick: (d: "TB" | "LR") => void }) {
  return (
    <>
      <Item onSelect={() => onPick("TB")} shortcut="⇧L">
        <Network /> Vertical
      </Item>
      <Item onSelect={() => onPick("LR")} shortcut="⌥⇧L">
        <Network className="-rotate-90" /> Horizontal
      </Item>
    </>
  );
}

const barCls =
  "wp-no-print absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-line bg-surface p-1 text-body shadow-float animate-in";
const barBtn = "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg px-1.5 text-ink-2 hover:bg-hover hover:text-ink [&_svg]:size-4";

const INK_MODES: { id: InkMode; label: string; icon: typeof PenLine }[] = [
  { id: "pen", label: "Caneta", icon: PenLine },
  { id: "highlighter", label: "Marca-texto", icon: Highlighter },
];

/** Which layer new drawings and elements go to; switching it is one click away while drawing. */
function ActiveLayerPicker() {
  const ed = useEditor();
  const layer = ed.layers.list.find((l) => l.id === ed.layers.active) ?? ed.layers.list[0];
  return (
    <DropdownMenu>
      <Tooltip content="Camada onde o desenho entra">
        <DropdownMenuTrigger asChild>
          <button type="button" className={cn(barBtn, "max-w-[160px] px-2")} aria-label={`Camada: ${layer.name}`}>
            <Layers />
            <span className="size-2 shrink-0 rounded-full" style={{ background: layer.color ?? "var(--muted)" }} aria-hidden />
            <span className="truncate">{layer.name}</span>
          </button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent side="bottom" align="center" sideOffset={8} onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel>Desenhar na camada</DropdownMenuLabel>
        {[...ed.layers.list].reverse().map((l) => (
          <DropdownMenuItem key={l.id} onSelect={() => ed.layers.setActive(l.id)}>
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: l.color ?? "var(--muted)" }} aria-hidden />
            {l.name}
            {l.id === ed.layers.active && <span className="ml-auto text-caption text-accent-ink">ativa</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={ed.layers.add}>
          <Layers /> Nova camada
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Pen, highlighter or arrow; color; thickness; target layer. */
function InkBar() {
  const ed = useEditor();
  const { mode, color, size } = ed.ink;
  const shown = color ?? (mode === "highlighter" ? HIGHLIGHTER_COLOR : undefined);
  return (
    <div className={barCls} role="toolbar" aria-label="Desenho">
      <div role="radiogroup" aria-label="Ferramenta de desenho" className="flex items-center gap-0.5">
        {INK_MODES.map((m) => (
          <Tooltip key={m.id} content={m.label}>
            <button type="button" role="radio" aria-checked={mode === m.id} aria-label={m.label} onClick={() => ed.setInk({ mode: m.id })} className={cn(barBtn, mode === m.id && pillOn)}>
              <m.icon />
            </button>
          </Tooltip>
        ))}
      </div>
      <Sep />
      <div role="radiogroup" aria-label="Cor" className="flex items-center gap-1 px-1">
        {INK_COLORS.map((c) => {
          const on = (c.value ?? null) === (shown ?? null) || (!c.value && !shown);
          return (
            <Tooltip key={c.name} content={c.name}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={c.name}
                onClick={() => ed.setInk({ color: c.value })}
                className="size-5 rounded-full border-2 border-surface"
                style={{ background: c.value ?? "var(--ink)", boxShadow: on ? "0 0 0 2px var(--accent)" : "0 0 0 1px var(--line-2)" }}
              />
            </Tooltip>
          );
        })}
      </div>
      <Sep />
      <div role="radiogroup" aria-label="Espessura" className="flex items-center gap-0.5">
        {INK_SIZES.map((n) => (
          <Tooltip key={n} content={n === INK_SIZES[0] ? "Fina" : n === INK_SIZES[1] ? "Média" : "Grossa"}>
            <button type="button" role="radio" aria-checked={size === n} aria-label={`Espessura ${n}`} onClick={() => ed.setInk({ size: n })} className={cn(barBtn, size === n && pillOn)}>
              <span className="rounded-full bg-current" style={{ width: 4 + n * 1.2, height: 4 + n * 1.2 }} aria-hidden />
            </button>
          </Tooltip>
        ))}
      </div>
      <Sep />
      <ActiveLayerPicker />
      <Sep />
      <button type="button" className={barBtn} onClick={() => ed.setTool("select")} aria-label="Concluir desenho">
        <X /> <span className="pr-1">Concluir</span>
      </button>
    </div>
  );
}

/** Contextual floating toolbar: drawing, eraser, connect mode, multi-selection layout, or edge kind. */
export function SelectionBar() {
  const ed = useEditor();
  if (ed.tool === "draw") return <InkBar />;
  if (SHAPE_TOOLS.has(ed.tool)) return <StyleBar />;
  if (ed.tool === "annotate") {
    return (
      <AnnotateBar barCls={barCls}>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <button type="button" className={barBtn} onClick={() => ed.setTool("select")} aria-label="Concluir anotações">
          <X /> <span className="hidden pr-1 xl:inline">Concluir</span>
        </button>
      </AnnotateBar>
    );
  }
  if (ed.tool === "erase") {
    return (
      <div className={barCls} role="toolbar" aria-label="Borracha">
        <span className="flex items-center gap-2 px-2 text-ink-2">
          <Eraser className="size-4" /> Passe sobre os traços para apagar
        </span>
        <Sep />
        <button type="button" className={barBtn} onClick={() => ed.setTool("draw")} aria-label="Voltar a desenhar">
          <PenLine /> <span className="pr-1">Desenhar</span>
        </button>
        <button type="button" className={barBtn} onClick={() => ed.setTool("select")} aria-label="Sair da borracha">
          <X /> <span className="pr-1">Concluir</span>
        </button>
      </div>
    );
  }
  if (ed.tool === "connect") {
    return (
      <div className={barCls} role="toolbar" aria-label="Conexão">
        <span className="px-2 text-ink-2">Clique na origem e depois no destino</span>
        <Sep />
        <KindPicker value={ed.connectKind} onChange={ed.setConnectKind} />
        {ed.layers.list.length > 1 && (
          <>
            <Sep />
            <ActiveLayerPicker />
          </>
        )}
        <Sep />
        <button type="button" className={barBtn} onClick={() => ed.setTool("select")} aria-label="Sair do modo conexão">
          <X /> <span className="pr-1">Concluir</span>
        </button>
      </div>
    );
  }
  if (ed.selectedNodes.length === 0 && ed.selectedEdges.length === 1) {
    const e = ed.selectedEdges[0];
    return (
      <div className={barCls} role="toolbar" aria-label="Conexão selecionada">
        <KindPicker value={e.data?.kind ?? "flow"} onChange={(kind) => ed.updateEdge(e.id, { kind })} />
        <Sep />
        <Tooltip content="Inverter direção">
          <button type="button" className={barBtn} aria-label="Inverter direção" onClick={() => ed.swapEdge(e.id)}>
            <ArrowLeftRight />
          </button>
        </Tooltip>
        <Tooltip content="Numerar o fluxo desta camada (1, 2, 3…)">
          <button type="button" className={barBtn} aria-label="Numerar passos do fluxo" onClick={() => ed.numberSteps()}>
            <ListOrdered />
          </button>
        </Tooltip>
        <Tooltip content="Excluir conexão">
          <button type="button" className={cn(barBtn, "hover:text-danger")} aria-label="Excluir conexão" onClick={ed.remove}>
            <Trash2 />
          </button>
        </Tooltip>
      </div>
    );
  }
  return null;
}

function KindPicker({ value, onChange }: { value: (typeof EDGE_KINDS)[number]; onChange: (k: (typeof EDGE_KINDS)[number]) => void }) {
  return (
    <div role="radiogroup" aria-label="Tipo de conexão" className="flex items-center gap-0.5">
      {EDGE_KINDS.map((k) => (
        <Tooltip key={k} content={EDGE_APPEARANCE[k].label}>
          <button type="button" role="radio" aria-checked={value === k} aria-label={EDGE_APPEARANCE[k].label} onClick={() => onChange(k)} className={cn(barBtn, "px-2", value === k && pillOn)}>
            <EdgeSample kind={k} width={26} />
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
