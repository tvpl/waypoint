"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useReactFlow } from "@xyflow/react";
import { SHAPE_TOOLS, useEditor, type Tool } from "./editor-context";
import { arrowheadPath, type Pt } from "./shape-geometry";

/** Where a press starts something: the canvas itself, not the floating toolbars over it. */
const CANVAS = ".react-flow__pane, .react-flow__node, .react-flow__edge, .react-flow__nodesselection, .react-flow__edgelabel-renderer";

/** The element under a point that an arrow can attach to (not drawings, not this overlay). */
function nodeAt(x: number, y: number, root: HTMLElement): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const node = el.closest<HTMLElement>(".react-flow__node");
    if (!node || !root.contains(node) || node.classList.contains("react-flow__node-ink")) continue;
    if (node.classList.contains("wp-isolate-out")) continue;
    return node.dataset.id ?? null;
  }
  return null;
}

type Drag = { tool: Tool; start: Pt; startScreen: Pt; end: Pt; endScreen: Pt; source: string | null; target: string | null; square: boolean };

/**
 * The shape, arrow, line, text and frame tools: drag to draw a box (⇧ keeps it square), or from one
 * element to another for a connection. Listens on the canvas wrapper in the capture phase so React
 * Flow never sees the press; the preview is drawn in screen space.
 */
export function ShapeTools({ wrapRef }: { wrapRef: RefObject<HTMLDivElement | null> }) {
  const ed = useEditor();
  const rf = useReactFlow();
  const edRef = useRef(ed);
  edRef.current = ed;
  const [drag, setDrag] = useState<Drag | null>(null);
  const tool = ed.tool;
  const active = SHAPE_TOOLS.has(tool);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !active) return;
    let cur: Drag | null = null;
    let lastTarget: HTMLElement | null = null;
    const local = (e: PointerEvent): Pt => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const flow = (e: PointerEvent): Pt => rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const mark = (id: string | null) => {
      lastTarget?.classList.remove("wp-bind-target");
      lastTarget = id ? el.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`) : null;
      lastTarget?.classList.add("wp-bind-target");
    };
    const down = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.("input, textarea")) return;
      if (e.button !== 0 || !target?.closest?.(CANVAS)) return;
      e.preventDefault();
      e.stopPropagation();
      if (tool === "text") {
        // The first click away from a text being typed finishes it; the next one starts another.
        const typing = document.activeElement as HTMLElement | null;
        if (typing && el.contains(typing) && typing.matches("input, textarea")) return void typing.blur();
        return edRef.current.addShape("text", null, flow(e));
      }
      el.setPointerCapture(e.pointerId);
      const p = flow(e);
      const s = local(e);
      const source = tool === "arrow" || tool === "line" ? nodeAt(e.clientX, e.clientY, el) : null;
      cur = { tool, start: p, startScreen: s, end: p, endScreen: s, source, target: null, square: e.shiftKey };
      setDrag(cur);
    };
    const move = (e: PointerEvent) => {
      if (!cur) return;
      e.stopPropagation();
      cur = { ...cur, end: flow(e), endScreen: local(e), square: e.shiftKey };
      if (cur.tool === "arrow" || cur.tool === "line") {
        const t = nodeAt(e.clientX, e.clientY, el);
        cur.target = t && t !== cur.source ? t : null;
        mark(cur.target);
      }
      setDrag(cur);
    };
    const up = (e: PointerEvent) => {
      if (!cur) return;
      e.stopPropagation();
      const d = cur;
      cur = null;
      setDrag(null);
      mark(null);
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      const moved = Math.hypot(d.endScreen.x - d.startScreen.x, d.endScreen.y - d.startScreen.y) > 4;
      const api = edRef.current;
      if (d.tool === "arrow" || d.tool === "line") {
        if (moved) api.addLink(d.tool, d.start, d.end, d.source, d.target);
        return;
      }
      const type = d.tool as "rect" | "diamond" | "ellipse" | "frame";
      if (!moved) return api.addShape(type, null, d.start);
      api.addShape(type, boxOf(d), d.start);
    };
    el.addEventListener("pointerdown", down, true);
    el.addEventListener("pointermove", move, true);
    el.addEventListener("pointerup", up, true);
    el.addEventListener("pointercancel", up, true);
    return () => {
      el.removeEventListener("pointerdown", down, true);
      el.removeEventListener("pointermove", move, true);
      el.removeEventListener("pointerup", up, true);
      el.removeEventListener("pointercancel", up, true);
      mark(null);
      setDrag(null);
    };
  }, [active, tool, wrapRef, rf]);

  if (!drag) return null;
  const zoom = rf.getViewport().zoom;
  const width = Math.max(1, ed.style.strokeWidth * zoom);
  const color = ed.style.stroke ?? "var(--ink)";
  if (drag.tool === "arrow" || drag.tool === "line") {
    const a = drag.startScreen;
    const b = drag.endScreen;
    const head = drag.tool === "arrow" ? arrowheadPath(ed.style.end, b, Math.atan2(b.y - a.y, b.x - a.x), width) : null;
    return (
      <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full" aria-hidden>
        <path d={`M${a.x} ${a.y} L${b.x} ${b.y}`} style={{ stroke: color, strokeWidth: width, fill: "none" }} strokeLinecap="round" />
        {head && <path d={head.d} style={{ stroke: color, strokeWidth: width, fill: head.filled ? color : "none" }} strokeLinecap="round" strokeLinejoin="round" />}
        {drag.source && <circle cx={a.x} cy={a.y} r={5} className="fill-accent" />}
      </svg>
    );
  }
  const r = boxOf({ ...drag, start: drag.startScreen, end: drag.endScreen });
  const path =
    drag.tool === "ellipse"
      ? `M${r.x} ${r.y + r.h / 2} a${r.w / 2} ${r.h / 2} 0 1 0 ${r.w} 0 a${r.w / 2} ${r.h / 2} 0 1 0 ${-r.w} 0 Z`
      : drag.tool === "diamond"
        ? `M${r.x + r.w / 2} ${r.y} L${r.x + r.w} ${r.y + r.h / 2} L${r.x + r.w / 2} ${r.y + r.h} L${r.x} ${r.y + r.h / 2} Z`
        : `M${r.x} ${r.y} h${r.w} v${r.h} h${-r.w} Z`;
  return (
    <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full" aria-hidden>
      <path
        d={path}
        style={{
          stroke: drag.tool === "frame" ? "var(--line-2)" : color,
          strokeWidth: drag.tool === "frame" ? 1.5 : width,
          fill: drag.tool === "frame" ? "none" : (ed.style.fill ?? "none"),
          fillOpacity: 0.6,
        }}
        strokeDasharray={drag.tool === "frame" ? "6 4" : undefined}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The box between the press and the pointer (⇧ makes it square). */
function boxOf(d: { start: Pt; end: Pt; square: boolean }) {
  let w = d.end.x - d.start.x;
  let h = d.end.y - d.start.y;
  if (d.square) {
    const m = Math.max(Math.abs(w), Math.abs(h));
    w = Math.sign(w || 1) * m;
    h = Math.sign(h || 1) * m;
  }
  return { x: Math.min(d.start.x, d.start.x + w), y: Math.min(d.start.y, d.start.y + h), w: Math.abs(w), h: Math.abs(h) };
}
