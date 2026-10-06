"use client";
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Handle, NodeResizer, Position, type NodeProps, type NodeTypes } from "@xyflow/react";
import { ArrowUpRight, ChevronDown, ChevronRight, ExternalLink, ImagePlus, Link2, MessageSquare } from "lucide-react";
import type { NodeKind } from "@/domain/plan";
import type { PlanFlowNode } from "@/domain/canvas-adapter";
import { SiteIcon } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { readableText } from "@/lib/color";
import { usePlanner } from "./context";
import { KIND_LABEL, statusMeta } from "./defaults";
import { nodeTone, toneVars } from "./colors";
import { PlanIcon } from "./icons";
import { HIGHLIGHTER_COLOR, inkFontSize, inkPaths, shapePath } from "./ink-geometry";
import { FONT_STACK, resolveShape, seedOf, shapePaths } from "./shape-geometry";
import { GlyphSvg } from "./glyph";

type P = NodeProps<PlanFlowNode>;

const SIDES = [
  { id: "t", pos: Position.Top },
  { id: "r", pos: Position.Right },
  { id: "b", pos: Position.Bottom },
  { id: "l", pos: Position.Left },
] as const;

const MIN: Record<NodeKind, [number, number]> = {
  block: [120, 48],
  container: [160, 88],
  note: [120, 60],
  link: [140, 52],
  section: [160, 100],
  image: [80, 60],
  text: [40, 24],
  ink: [6, 6],
  shape: [16, 16],
  frame: [120, 80],
};

function Handles({ connectable }: { connectable: boolean }) {
  return (
    <>
      {SIDES.map((s) => (
        <Handle key={s.id} id={s.id} type="source" position={s.pos} isConnectable={connectable} className="wp-handle" />
      ))}
    </>
  );
}

/** Resizer, handles and selection badge shared by every node kind. */
function Chrome({ p, kind, children, resizable = true, handles = true }: { p: P; kind: NodeKind; children: ReactNode; resizable?: boolean; handles?: boolean }) {
  const { mode, singleSelectedId, commentCount, openNodeComments } = usePlanner();
  const comments = commentCount?.(p.id) ?? 0;
  const edit = mode === "edit";
  const [mw, mh] = MIN[kind];
  return (
    <>
      {edit && resizable && (
        <NodeResizer isVisible={p.selected} minWidth={mw} minHeight={mh} handleClassName="wp-resize-handle" lineClassName="wp-resize-line" />
      )}
      {edit && p.selected && singleSelectedId === p.id && (
        <div className="pointer-events-none absolute -top-[26px] left-0 z-10 whitespace-nowrap rounded bg-accent px-1.5 py-0.5 text-caption font-medium text-white">
          {KIND_LABEL[kind]} · {Math.round(p.width ?? 0)} × {Math.round(p.height ?? 0)}
        </div>
      )}
      {children}
      {comments > 0 && (
        <button
          type="button"
          className="wp-comment-badge wp-hit wp-no-export nodrag nopan"
          aria-label={`${comments} ${comments === 1 ? "comentário" : "comentários"} — abrir`}
          title="Abrir comentários"
          onClick={(e) => {
            e.stopPropagation();
            openNodeComments?.(p.id);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <MessageSquare aria-hidden />
          {comments > 99 ? "99+" : comments}
        </button>
      )}
      {handles && <Handles connectable={edit && p.isConnectable} />}
    </>
  );
}

function useNodeState(p: P) {
  const ctx = usePlanner();
  return {
    ctx,
    cls: cn(
      "wp-node",
      ctx.mode === "edit" && p.selected && "is-selected",
      ctx.dropTargetId === p.id && "is-drop-target",
      ctx.connectSourceId === p.id && "is-connect-source",
      ctx.highlightId === p.id && "is-highlight",
      ctx.mode === "view" && ctx.isInteractive({ id: p.id, data: p.data, type: p.type }) && "is-interactive",
    ),
    editing: ctx.mode === "edit" && ctx.editingId === p.id,
  };
}

/** Inline title editor (double-click). */
function InlineTitle({ id, value, className, multiline, style }: { id: string; value: string; className?: string; multiline?: boolean; style?: CSSProperties }) {
  const { commitTitle, setEditingId } = usePlanner();
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save && v !== value) commitTitle(id, v);
    setEditingId(null);
  };
  const props = {
    ref,
    value: v,
    "aria-label": "Título",
    className: cn("nodrag nopan nowheel pointer-events-auto w-full min-w-0 rounded-[4px] bg-transparent outline-none ring-2 ring-accent/40", className),
    style,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: () => finish(true),
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Enter" && (!multiline || !e.shiftKey)) {
        e.preventDefault();
        finish(true);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    },
  };
  return multiline ? <textarea rows={2} {...props} className={cn(props.className, "resize-none")} /> : <input type="text" {...props} />;
}

function StatusDot({ status }: { status?: PlanFlowNode["data"]["status"] }) {
  const m = statusMeta(status);
  if (!m) return null;
  return <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: m.dot }} title={m.label} aria-label={`Status: ${m.label}`} />;
}

function firstLine(s?: string) {
  return s?.split("\n").find((l) => l.trim())?.trim() ?? "";
}

// ------------------------------------------------------------------ block

export const BlockNode = memo(function BlockNode(p: P) {
  const { ctx, cls, editing } = useNodeState(p);
  const d = p.data;
  const tone = nodeTone(d.color);
  const res = d.resource ? ctx.resourceFor({ id: p.id, data: d }) : null;
  const subtitle = firstLine(d.description) || (res ? res.title : "");
  const tall = (p.height ?? 0) >= 120;
  // Narrow blocks (e.g. chips inside a container) drop the icon tile so the title fits.
  const compact = (p.width ?? 0) < 140 && !d.image;
  const dark = tone?.dark;
  const ink = dark ? readableText(tone.fill) : null;
  const tags = d.tags ?? [];
  return (
    <Chrome p={p} kind="block">
      <div
        className={cn(
          cls,
          "flex h-full w-full flex-col overflow-hidden rounded-xl border shadow-rest",
          dark ? "" : "border-line-2 bg-surface text-ink",
        )}
        style={dark ? { background: tone.fill, borderColor: tone.fill, color: ink!.fg, boxShadow: "0 10px 24px -14px rgba(23,23,28,.6)" } : undefined}
      >
        {tall && d.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.image} alt="" draggable={false} referrerPolicy="no-referrer" className="h-[42%] min-h-0 w-full shrink object-cover" />
        )}
        <div className={cn("flex min-h-0 flex-1 items-center gap-2.5 py-2.5", compact ? "px-2.5 text-center" : "px-3.5")}>
          {compact ? null : !tall && d.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.image} alt="" draggable={false} referrerPolicy="no-referrer" className="size-[30px] shrink-0 rounded-lg object-cover" />
          ) : (
            <span
              className={cn("inline-flex size-[30px] shrink-0 items-center justify-center rounded-lg", !tone && "bg-subtle text-ink-2", tone && !dark && "wp-tile")}
              style={dark ? { background: "rgba(255,255,255,.12)", color: "#FFFFFF" } : toneVars(tone)}
            >
              <PlanIcon name={d.icon} size={16} />
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className={cn("flex min-w-0 items-center gap-1.5", compact && "justify-center")}>
              {editing ? (
                <InlineTitle id={p.id} value={d.title} className="text-sm font-semibold" />
              ) : (
                <span className="truncate text-sm font-semibold leading-[18px]">{d.title || <span className="opacity-50">Sem título</span>}</span>
              )}
              <StatusDot status={d.status} />
            </div>
            {subtitle && (
              <span className={cn("truncate text-xs leading-4", !dark && "text-muted")} style={dark ? { color: ink!.muted } : undefined}>
                {subtitle}
              </span>
            )}
            {tags.length > 0 && (p.height ?? 0) >= 92 && (
              <div className="mt-1.5 flex min-w-0 gap-1 overflow-hidden">
                {tags.slice(0, 4).map((t) => (
                  <span key={t} className={cn("shrink-0 rounded-full px-1.5 py-px text-caption", dark ? "bg-white/12" : "bg-subtle text-ink-2")}>
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
          {res && <Link2 className="size-3.5 shrink-0 self-center opacity-60" aria-label="Tem link" />}
        </div>
      </div>
    </Chrome>
  );
});

// ------------------------------------------------------------------ container

export const ContainerNode = memo(function ContainerNode(p: P) {
  const { ctx, cls, editing } = useNodeState(p);
  const d = p.data;
  const tone = nodeTone(d.color);
  const collapsed = !!d.collapsed;
  const n = collapsed ? ctx.childCount(p.id) : 0;
  return (
    <Chrome p={p} kind="container" resizable={!collapsed}>
      <div
        className={cn(cls, "h-full w-full rounded-2xl border", tone ? "wp-area" : "border-line bg-surface-2/80")}
        style={toneVars(tone)}
      >
        <div className={cn("wp-hit flex h-11 items-center gap-1.5 pl-4 pr-2 text-caption font-semibold uppercase tracking-[.08em]", tone ? "wp-area-label" : "text-ink-2")}>
          <PlanIcon name={d.icon} fallback="boxes" size={14} />
          {editing ? (
            <InlineTitle id={p.id} value={d.title} className="text-caption font-semibold uppercase tracking-[.08em]" />
          ) : (
            <span className="truncate">{d.title || "Container"}</span>
          )}
          <StatusDot status={d.status} />
          {collapsed && <span className="shrink-0 font-normal normal-case tracking-normal opacity-75">· {n} {n === 1 ? "item" : "itens"}</span>}
          <span className="flex-1" />
          <CollapseButton id={p.id} collapsed={collapsed} />
        </div>
      </div>
    </Chrome>
  );
});

function CollapseButton({ id, collapsed }: { id: string; collapsed: boolean }) {
  const { toggleCollapsed } = usePlanner();
  return (
    <button
      type="button"
      className="wp-hit nodrag nopan inline-flex size-6 shrink-0 items-center justify-center rounded-md opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
      aria-label={collapsed ? "Expandir" : "Recolher"}
      aria-expanded={!collapsed}
      onClick={(e) => {
        e.stopPropagation();
        toggleCollapsed(id);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
    </button>
  );
}

// ------------------------------------------------------------------ section

export const SectionNode = memo(function SectionNode(p: P) {
  const { ctx, cls, editing } = useNodeState(p);
  const d = p.data;
  const tone = nodeTone(d.color);
  const collapsed = !!d.collapsed;
  const n = collapsed ? ctx.childCount(p.id) : 0;
  return (
    <Chrome p={p} kind="section" resizable={!collapsed}>
      <div className={cn(cls, "h-full w-full rounded-2xl border-[1.5px] border-dashed", tone ? "wp-section" : "border-line-2")} style={toneVars(tone)}>
        <div className="flex h-11 items-center gap-2 pl-4 pr-2">
          <span className="wp-hit absolute inset-x-0 top-0 h-11 rounded-t-2xl" aria-hidden />
          <span className={cn("flex min-w-0 items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[.06em]", tone ? "wp-area-label" : "text-muted")}>
            {d.icon && <PlanIcon name={d.icon} size={14} />}
            {editing ? (
              <InlineTitle id={p.id} value={d.title} className="text-[12px] font-semibold uppercase tracking-[.06em]" />
            ) : (
              <span className="truncate">{d.title || "Seção"}</span>
            )}
          </span>
          {collapsed && <span className="shrink-0 text-xs text-muted">· {n} {n === 1 ? "item" : "itens"}</span>}
          <span className="flex-1" />
          <span className={tone ? "wp-area-label" : "text-muted"}>
            <CollapseButton id={p.id} collapsed={collapsed} />
          </span>
        </div>
        {!collapsed && d.description && <p className="-mt-2 line-clamp-2 px-4 text-xs text-muted">{d.description}</p>}
      </div>
    </Chrome>
  );
});

// ------------------------------------------------------------------ note

export const NoteNode = memo(function NoteNode(p: P) {
  const { cls, editing } = useNodeState(p);
  const d = p.data;
  const color = (d.color ?? "#FFF3C4").toUpperCase();
  const amber = color === "#FFF3C4";
  const rt = readableText(color);
  const style: CSSProperties = amber
    ? { background: "#FFF3C4", borderColor: "#EAD58A", color: "#5E4500" }
    : { background: color, borderColor: rt.border, color: rt.fg };
  return (
    <Chrome p={p} kind="note">
      <div
        className={cn(cls, "flex h-full w-full items-start gap-2 overflow-hidden rounded-[4px_12px_12px_12px] border px-3.5 py-3 text-body leading-[18px] shadow-[0_6px_16px_-10px_rgba(23,23,28,.35)]")}
        style={{ ...style, transform: "rotate(-1deg)" }}
      >
        {d.icon && <PlanIcon name={d.icon} size={16} className="mt-px shrink-0" />}
        <div className="min-w-0 flex-1">
          {editing ? (
            <InlineTitle id={p.id} value={d.title} className="font-semibold" />
          ) : (
            d.title && <div className="font-semibold">{d.title}</div>
          )}
          {d.description && <div className="whitespace-pre-wrap break-words">{d.description}</div>}
          {!d.title && !d.description && !editing && <div className="opacity-60">Nota vazia</div>}
        </div>
      </div>
    </Chrome>
  );
});

// ------------------------------------------------------------------ link card

const OPEN_LABEL = { "new-tab": "abre em nova aba", modal: "abre em prévia", details: "mostra detalhes" } as const;

export const LinkNode = memo(function LinkNode(p: P) {
  const { ctx, cls, editing } = useNodeState(p);
  const d = p.data;
  const res = d.resource ? ctx.resourceFor({ id: p.id, data: d }) : null;
  const title = d.title || res?.title || "Link sem destino";
  const kindLabel = res ? res.subtitle : ctx.mode === "edit" ? "Defina o destino no painel" : "";
  const sub = res && d.openIn ? `${kindLabel} · ${OPEN_LABEL[d.openIn]}` : kindLabel;
  const External = res?.external ? ExternalLink : ArrowUpRight;
  const h = p.height ?? 0;
  // The card grows into a richer preview as it gets taller: description, then cover.
  const cover = h >= 150 ? d.image || res?.image || null : null;
  const description = h >= 96 ? d.description || res?.description || null : null;
  const [coverFailed, setCoverFailed] = useState(false);
  return (
    <Chrome p={p} kind="link">
      <div className={cn(cls, "flex h-full w-full flex-col overflow-hidden rounded-xl border border-line-2 bg-surface text-ink shadow-rest")}>
        {cover && !coverFailed && (
          <div className="relative min-h-0 flex-1 basis-[45%] overflow-hidden border-b border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt="" referrerPolicy="no-referrer" draggable={false} onError={() => setCoverFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
          </div>
        )}
        <div className={cn("flex min-h-0 flex-col gap-1.5 px-3.5 py-2.5", !(cover && !coverFailed) && "flex-1 justify-center")}>
          <div className="flex min-w-0 items-center gap-2.5">
            <SiteIcon src={res?.favicon} label={title} size={30} />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-w-0 items-center gap-1.5">
                {editing ? (
                  <InlineTitle id={p.id} value={d.title} className="text-sm font-semibold" />
                ) : (
                  <span className="truncate text-sm font-semibold leading-[18px]">{title}</span>
                )}
                <StatusDot status={d.status} />
              </div>
              {sub && <span className="truncate text-xs leading-4 text-muted">{sub}</span>}
            </div>
            {res && <External className="size-3.5 shrink-0 text-muted" aria-hidden />}
          </div>
          {description && <p className="line-clamp-3 text-xs leading-[17px] text-ink-2">{description}</p>}
        </div>
      </div>
    </Chrome>
  );
});

// ------------------------------------------------------------------ image

export const ImageNode = memo(function ImageNode(p: P) {
  const { ctx, cls, editing } = useNodeState(p);
  const d = p.data;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [d.image]);
  return (
    <Chrome p={p} kind="image">
      <div className={cn(cls, "relative h-full w-full overflow-hidden rounded-xl border border-line-2 bg-surface shadow-rest")}>
        {d.image && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.image} alt={d.title || ""} draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-surface-2 text-muted">
            <ImagePlus className="size-6" strokeWidth={1.5} aria-hidden />
            <span className="px-3 text-center text-xs">{failed ? "Imagem indisponível" : ctx.mode === "edit" ? "Adicione uma imagem no painel" : "Sem imagem"}</span>
          </div>
        )}
        {(d.title || editing) && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-3 pb-2 pt-7 text-xs font-medium text-white">
            {editing ? <InlineTitle id={p.id} value={d.title} className="text-white" /> : <span className="line-clamp-2">{d.title}</span>}
          </div>
        )}
      </div>
    </Chrome>
  );
});

// ------------------------------------------------------------------ text

export const TextNode = memo(function TextNode(p: P) {
  const { cls, editing } = useNodeState(p);
  const d = p.data;
  const tone = nodeTone(d.color);
  const h = p.height ?? 44;
  const size = d.description ? 18 : Math.max(13, Math.min(56, Math.round((h - 10) * 0.62)));
  return (
    <Chrome p={p} kind="text">
      <div className={cn(cls, "wp-text flex h-full w-full flex-col justify-center rounded-md px-1")} style={toneVars(tone)}>
        {editing ? (
          <InlineTitle id={p.id} value={d.title} className="font-semibold leading-tight" style={{ fontSize: size }} />
        ) : (
          <span className="truncate font-semibold leading-tight tracking-[-.01em]" style={{ fontSize: size }}>
            {d.title || <span className="opacity-40">Texto</span>}
          </span>
        )}
        {d.description && <span className="line-clamp-3 text-body leading-[18px] text-muted">{d.description}</span>}
      </div>
    </Chrome>
  );
});

// ------------------------------------------------------------------ ink (freehand drawing)

/**
 * A freehand stroke, arrow or highlight. Only the painted stroke takes clicks (planner.css), so
 * drawings on upper layers never block the elements under them.
 */
export const InkNode = memo(function InkNode(p: P) {
  const ink = p.data.ink;
  const paths = useMemo(() => (ink && !ink.shape ? inkPaths(ink) : null), [ink]);
  if (ink?.shape === "text") return <InkText p={p} />;
  if (ink?.shape) return <InkShape p={p} />;
  if (!ink || !paths) return null;
  const color = p.data.color ?? (ink.highlighter ? HIGHLIGHTER_COLOR : "var(--ink)");
  return (
    <Chrome p={p} kind="ink" handles={false}>
      <svg
        className={cn("wp-ink", ink.highlighter && "is-highlighter")}
        width="100%"
        height="100%"
        viewBox={`0 0 ${ink.w} ${ink.h}`}
        preserveAspectRatio="none"
        overflow="visible"
        aria-label={ink.arrow ? "Seta desenhada" : ink.highlighter ? "Destaque" : "Desenho"}
      >
        <path d={paths.line} className="wp-ink-hit" fill="none" stroke="transparent" strokeWidth={ink.size + 12} strokeLinecap="round" strokeLinejoin="round" />
        {ink.line ? (
          <path d={paths.line} className="wp-ink-stroke" fill="none" stroke={color} strokeWidth={ink.size} strokeLinecap="round" />
        ) : ink.arrow ? (
          <>
            <path d={paths.line} className="wp-ink-stroke" fill="none" stroke={color} strokeWidth={ink.size} strokeLinecap="round" />
            <path d={paths.head} className="wp-ink-stroke" fill={color} stroke={color} strokeWidth={Math.max(1, ink.size / 2)} strokeLinejoin="round" />
          </>
        ) : (
          <path d={paths.fill} className="wp-ink-stroke" fill={color} />
        )}
      </svg>
    </Chrome>
  );
});

/** A drawn rectangle or ellipse: drawn at the node's real size, so resizing keeps the stroke even. */
function InkShape({ p }: { p: P }) {
  const ink = p.data.ink!;
  const w = p.width ?? ink.w;
  const h = p.height ?? ink.h;
  const d = shapePath(ink.shape === "ellipse" ? "ellipse" : "rect", w, h, ink.size);
  const color = p.data.color ?? "var(--ink)";
  return (
    <Chrome p={p} kind="ink" handles={false}>
      <svg className="wp-ink" width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} overflow="visible" aria-label={ink.shape === "ellipse" ? "Elipse desenhada" : "Retângulo desenhado"}>
        <path d={d} className="wp-ink-hit" fill="none" stroke="transparent" strokeWidth={ink.size + 12} />
        <path d={d} className="wp-ink-stroke" fill="none" stroke={color} strokeWidth={ink.size} strokeLinejoin="round" />
      </svg>
    </Chrome>
  );
}

/** Handwritten-style note on the canvas; the text is the node title (double-click to edit). */
function InkText({ p }: { p: P }) {
  const { ctx, editing } = useNodeState(p);
  const ink = p.data.ink!;
  const style: CSSProperties = { fontSize: inkFontSize(ink.size), color: p.data.color ?? "var(--ink)" };
  return (
    <Chrome p={p} kind="ink" handles={false} resizable={false}>
      <div className="wp-ink wp-ink-text-box flex h-full w-full items-center">
        {editing ? (
          <InlineTitle id={p.id} value={p.data.title} className="wp-ink-text min-w-[160px] px-1" style={style} />
        ) : p.data.title ? (
          <span className="wp-ink-text wp-ink-stroke whitespace-pre px-1" style={style}>
            {p.data.title}
          </span>
        ) : (
          ctx.mode === "edit" && (
            <span className="wp-ink-text wp-ink-stroke px-1 opacity-40" style={style}>
              Texto
            </span>
          )
        )}
      </div>
    </Chrome>
  );
}

// ------------------------------------------------------------------ shapes (drawing tools)

/**
 * A drawn rectangle, diamond or ellipse with text inside, or a free text. Clean or hand-drawn
 * (rough.js); colors, fill pattern, stroke and font come from the shape's style.
 */
export const ShapeNode = memo(function ShapeNode(p: P) {
  const { cls, editing } = useNodeState(p);
  const shape = p.data.shape ?? { type: "rect" as const };
  const sketch = !!p.data._sketch;
  const w = p.width ?? 180;
  const h = p.height ?? 100;
  const s = resolveShape(shape, sketch);
  const seed = shape.seed ?? seedOf(p.id);
  const paths = useMemo(() => shapePaths(shape, w, h, { seed, sketch, ink: "var(--ink)" }), [shape, w, h, seed, sketch]);
  const text = s.type === "text";
  const color = s.stroke ?? "var(--ink)";
  const style: CSSProperties = {
    fontFamily: FONT_STACK[s.font],
    fontSize: s.fontSize,
    color,
    textAlign: s.align,
    justifyContent: s.align === "left" ? "flex-start" : s.align === "right" ? "flex-end" : "center",
  };
  if (s.type === "icon" && shape.glyph) return <IconShape p={p} cls={cls} editing={editing} />;
  return (
    <Chrome p={p} kind="shape" handles={!text}>
      <div className={cn(cls, "wp-shape relative h-full w-full", text && "is-text")} style={{ opacity: s.opacity }}>
        {!text && (
          <svg className="wp-shape-svg absolute inset-0 overflow-visible" width={w} height={h} aria-hidden>
            {paths.map((d, i) => (
              <path
                key={i}
                d={d.d}
                style={{ fill: d.fill ?? "none", stroke: d.stroke ?? "none", strokeWidth: d.strokeWidth, strokeDasharray: d.dash }}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        )}
        <div className={cn("wp-shape-text absolute inset-0 flex items-center overflow-hidden leading-[1.25]", text ? "px-1" : "px-3 py-2")} style={style}>
          {editing ? (
            <InlineTitle id={p.id} value={p.data.title} multiline className="wp-shape-input bg-transparent" style={{ fontFamily: style.fontFamily, fontSize: style.fontSize, textAlign: s.align, color }} />
          ) : p.data.title ? (
            <span className="whitespace-pre-wrap break-words">{p.data.title}</span>
          ) : (
            text && <span className="opacity-40">Texto</span>
          )}
        </div>
      </div>
    </Chrome>
  );
});

/** An icon (with an optional tile behind it and a label under it). */
function IconShape({ p, cls, editing }: { p: P; cls: string; editing: boolean }) {
  const shape = p.data.shape!;
  const s = resolveShape(shape);
  const w = p.width ?? 72;
  const h = p.height ?? 72;
  const label = editing || !!p.data.title;
  const labelH = label ? 24 : 0;
  const area = Math.max(8, Math.min(w, h - labelH));
  const tile = s.fill;
  const color = s.stroke ?? "var(--ink)";
  return (
    <Chrome p={p} kind="shape" handles>
      <div className={cn(cls, "wp-shape wp-icon relative flex h-full w-full flex-col items-center")} style={{ opacity: s.opacity }}>
        <div className="flex w-full items-center justify-center" style={{ height: h - labelH }}>
          <div className="flex items-center justify-center" style={{ width: area, height: area, background: tile, borderRadius: tile ? area * 0.22 : undefined }}>
            <GlyphSvg glyph={shape.glyph!} size={area * (tile ? 0.6 : 0.92)} color={color} strokeWidth={s.strokeWidth} />
          </div>
        </div>
        {label && (
          // The label may be wider than the icon (centered under it, like a desktop icon).
          <div className="wp-shape-text absolute bottom-0 left-1/2 flex h-6 w-max min-w-full max-w-[220px] -translate-x-1/2 items-end justify-center text-center text-[13px] font-medium leading-tight text-ink-2">
            {editing ? <InlineTitle id={p.id} value={p.data.title} className="w-[160px] text-center text-[13px] font-medium" /> : <span className="truncate">{p.data.title}</span>}
          </div>
        )}
      </div>
    </Chrome>
  );
}

/** A frame: a named area (like an artboard) that holds what is drawn inside it. */
export const FrameNode = memo(function FrameNode(p: P) {
  const { cls, editing } = useNodeState(p);
  return (
    <Chrome p={p} kind="frame" handles={false}>
      <div className={cn(cls, "wp-frame h-full w-full rounded-md border-[1.5px] border-line-2")}>
        <div className="wp-hit absolute -top-7 left-0 flex h-6 max-w-full items-center gap-1.5 text-[13px] font-medium text-muted">
          {editing ? <InlineTitle id={p.id} value={p.data.title} className="text-[13px] font-medium" /> : <span className="truncate">{p.data.title || "Quadro"}</span>}
        </div>
      </div>
    </Chrome>
  );
});

export const nodeTypes: NodeTypes = {
  block: BlockNode,
  container: ContainerNode,
  section: SectionNode,
  note: NoteNode,
  link: LinkNode,
  image: ImageNode,
  text: TextNode,
  ink: InkNode,
  shape: ShapeNode,
  frame: FrameNode,
};
