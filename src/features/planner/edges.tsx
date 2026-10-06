"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Position, useInternalNode, useReactFlow, type EdgeProps, type EdgeTypes, type InternalNode } from "@xyflow/react";
import { EDGE_KINDS, type EdgeKind, type EdgeStyle } from "@/domain/plan";
import { arrowheadPath, bendThrough, curveApex, curveControl, dashFor, DEFAULT_BEND, DEFAULT_STYLE, endTangent, floatingEnds, headInset, linkPaths, seedOf, type Pt } from "./shape-geometry";
import { EDGE_APPEARANCE, type PlanFlowEdge } from "@/domain/canvas-adapter";
import { cn } from "@/lib/utils";
import { usePlanner } from "./context";
import { avoidanceBoxes, orthoRoute, plainElbow, polylineHits, roundedPath, type Box, type Side } from "./edge-routing";

type Avoid = { boxes: Box[]; source: Box; target: Box };

/** A hidden path used to measure SVG paths (point at a length, nearest point). */
let probe: SVGPathElement | null = null;
function measure(d: string): SVGPathElement | null {
  if (typeof document === "undefined") return null;
  if (!probe || !probe.isConnected) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    probe = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.appendChild(probe);
    document.body.appendChild(svg);
  }
  probe.setAttribute("d", d);
  return probe;
}

/** The point `t` (0–1) of the way along a path. */
function pointOnPath(d: string, t: number): Pt | null {
  const el = measure(d);
  if (!el) return null;
  const q = el.getPointAtLength(el.getTotalLength() * t);
  return { x: q.x, y: q.y };
}

/** How far along a path (0–1) the point nearest to `p` is. */
function nearestOnPath(d: string, p: Pt): number {
  const el = measure(d);
  if (!el) return 0.5;
  const len = el.getTotalLength() || 1;
  let best = 0.5;
  let bestD = Infinity;
  for (let i = 0; i <= 100; i++) {
    const q = el.getPointAtLength((len * i) / 100);
    const dd = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (dd < bestD) {
      bestD = dd;
      best = i / 100;
    }
  }
  return best;
}

/**
 * Where a connection's label goes: its own spot along the line, or the default. In the editor,
 * dragging the label slides it along the line (a double click brings it back to the middle).
 */
function useEdgeLabel(id: string, d: string, pos: number | undefined, fallback: Pt) {
  const { mode, moveEdgeLabel } = usePlanner();
  const rf = useReactFlow();
  const at = useMemo(() => (pos === undefined ? fallback : (pointOnPath(d, pos) ?? fallback)), [d, pos, fallback.x, fallback.y]); // eslint-disable-line react-hooks/exhaustive-deps
  const canMove = mode === "edit" && !!moveEdgeLabel;
  const onPointerDown = (e: React.PointerEvent) => {
    if (!canMove || e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      if (!moved) {
        moved = true;
        el.setPointerCapture(ev.pointerId);
      }
      moveEdgeLabel!(id, nearestOnPath(d, rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY })));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const handlers = canMove
    ? {
        onPointerDown,
        onDoubleClick: (e: React.MouseEvent) => {
          if (pos === undefined) return;
          e.stopPropagation();
          moveEdgeLabel!(id, null);
        },
      }
    : {};
  return { at, handlers, movable: canMove };
}

/**
 * The connections to draw, with what each elbow connection must go around (`_avoid`). Unchanged
 * connections keep their object, so only the ones whose surroundings moved redraw.
 */
export function useAvoidance(nodes: Parameters<typeof avoidanceBoxes>[0], edges: PlanFlowEdge[]): PlanFlowEdge[] {
  const cache = useRef(new Map<string, { key: string; edge: PlanFlowEdge; out: PlanFlowEdge }>());
  return useMemo(() => {
    const found = avoidanceBoxes(nodes, edges);
    const next = new Map<string, { key: string; edge: PlanFlowEdge; out: PlanFlowEdge }>();
    const list = edges.map((e) => {
      const a = found.get(e.id);
      if (!a) return e;
      const key = JSON.stringify(a);
      const prev = cache.current.get(e.id);
      const out = prev && prev.key === key && prev.edge === e ? prev.out : { ...e, data: { ...(e.data ?? { kind: "flow" as const }), _avoid: a } };
      next.set(e.id, { key, edge: e, out });
      return out;
    });
    cache.current = next;
    return list;
  }, [nodes, edges]);
}

/** Direction (degrees) an edge travels when it enters a handle on each side of the target. */
const ENTRY_ANGLE: Record<Position, number> = {
  [Position.Left]: 0,
  [Position.Top]: 90,
  [Position.Right]: 180,
  [Position.Bottom]: -90,
};

/** Outline used when a styled connection leaves from an element's border. */
function outlineOf(n: InternalNode): { x: number; y: number; w: number; h: number; type: "rect" | "diamond" | "ellipse" } {
  const shape = (n.data as { shape?: { type?: string } } | undefined)?.shape?.type;
  return {
    x: n.internals.positionAbsolute.x,
    y: n.internals.positionAbsolute.y,
    w: n.measured.width ?? n.width ?? 0,
    h: n.measured.height ?? n.height ?? 0,
    type: shape === "ellipse" ? "ellipse" : shape === "diamond" ? "diamond" : "rect",
  };
}

export const PlanEdge = memo(function PlanEdge(p: EdgeProps<PlanFlowEdge>) {
  const style = p.data?.style;
  if (style && style.routing !== "elbow") return <StyledEdge {...p} style={undefined} edgeStyle={style} />;
  return <KindEdge {...p} />;
});

/**
 * A connection drawn with the arrow/line tools: leaves from the shapes' outlines (straight or
 * curved), with its own color, width, dash, hand-drawn wobble and arrowheads at either end.
 */
function StyledEdge(p: EdgeProps<PlanFlowEdge> & { edgeStyle: EdgeStyle }) {
  const src = useInternalNode(p.source);
  const tgt = useInternalNode(p.target);
  if (!src || !tgt) return null;
  return <StyledEdgeBody {...p} src={src} tgt={tgt} />;
}

function StyledEdgeBody({ src, tgt, ...p }: EdgeProps<PlanFlowEdge> & { edgeStyle: EdgeStyle; src: InternalNode; tgt: InternalNode }) {
  const st = p.edgeStyle;
  const { mode, editingId, setEditingId, commitEdgeLabel, bendEdge } = usePlanner();
  const rf = useReactFlow();
  const editing = mode === "edit" && editingId === p.id && !!commitEdgeLabel;
  const width = st.strokeWidth ?? DEFAULT_STYLE.strokeWidth;
  const roughness = st.roughness ?? (p.data?._sketch ? 1 : 0);
  const curve = st.routing === "curve";
  const startHead = st.start ?? "none";
  const endHead = st.end ?? "arrow";
  const { start, end } = floatingEnds(outlineOf(src), outlineOf(tgt), 4 + width / 2);
  // Stop the line short of filled heads so their tips stay crisp.
  const shorten = (from: Pt, to: Pt, by: number): Pt => {
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: to.x - ((to.x - from.x) / len) * by, y: to.y - ((to.y - from.y) / len) * by };
  };
  const a = startHead === "none" ? start : shorten(end, start, headInset(startHead, width));
  const b = endHead === "none" ? end : shorten(start, end, headInset(endHead, width));
  const seed = st.seed ?? seedOf(p.id);
  const bend = st.bend;
  const lines = linkPaths(a, b, { curve, bend, roughness, seed, strokeWidth: width });
  const heads = [
    arrowheadPath(startHead, start, endTangent(start, end, curve, false, bend).angle, width),
    arrowheadPath(endHead, end, endTangent(start, end, curve, true, bend).angle, width),
  ];
  const color = st.stroke ?? "var(--wp-edge-ink)";
  const mid = curve ? curveControl(start, end, bend) : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const handleAt = curve ? curveApex(start, end, bend) : mid;
  const linePath = `M${start.x} ${start.y} ${curve ? `Q${mid.x} ${mid.y}` : "L"} ${end.x} ${end.y}`;
  const { at: labelAt, handlers: labelHandlers, movable } = useEdgeLabel(p.id, linePath, p.data?.labelPos, handleAt);
  // Drag the middle handle to bend the line through the pointer (back near the middle: straight).
  const onBend = (e: React.PointerEvent) => {
    if (!bendEdge || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const pt = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      const k = bendThrough(start, end, pt);
      bendEdge(p.id, Math.abs(k) < 0.03 ? null : k);
    };
    const up = () => {
      el.removeEventListener("pointermove", move as EventListener);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move as EventListener);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const label = p.data?.label;
  const step = p.data?.step;
  const opacity = p.data?._opacity;
  const faded = opacity !== undefined ? { opacity } : undefined;
  return (
    <g style={faded} className="wp-styled-edge">
      {/* wide invisible path for hover and clicks */}
      <path d={linePath} fill="none" stroke="transparent" strokeWidth={18} className="react-flow__edge-interaction" />
      {p.selected && <path d={linePath} fill="none" stroke="var(--accent)" strokeOpacity={0.28} strokeWidth={width + 8} strokeLinecap="round" />}
      {lines.map((d, i) => (
        <path key={i} d={d} fill="none" className="wp-edge-path" style={{ stroke: color, strokeWidth: width, strokeDasharray: dashFor(st.strokeStyle ?? "solid", width) }} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {heads.map(
        (h, i) =>
          h && (
            <path
              key={i}
              d={h.d}
              className="wp-edge-head"
              style={{ stroke: color, fill: h.filled ? color : "none", strokeWidth: width }}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ),
      )}
      {editing && (
        <EdgeLabelRenderer>
          <EdgeLabelInput
            x={labelAt.x}
            y={labelAt.y}
            initial={label ?? ""}
            onDone={(v) => {
              if (v !== null && v !== (label ?? "")) commitEdgeLabel!(p.id, v);
              setEditingId(null);
            }}
          />
        </EdgeLabelRenderer>
      )}
      {(label || step) && !editing && (
        <EdgeLabelRenderer>
          <div
            className={cn("wp-edge-label nodrag nopan", !label && "is-step-only", p.selected && "is-selected", movable && "is-movable", p.data?._dim === true && "is-dim", p.data?._diff && `wp-diff-${p.data._diff}`)}
            style={{ transform: `translate(-50%, -50%) translate(${labelAt.x}px, ${labelAt.y}px)`, ...faded }}
            {...labelHandlers}
            title={p.data?.description || label || `Passo ${step}`}
          >
            {step && (
              <span className="wp-edge-step" aria-label={`Passo ${step}`}>
                {step}
              </span>
            )}
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
      {p.selected && mode === "edit" && bendEdge && !editing && (
        <EdgeLabelRenderer>
          <div
            role="slider"
            aria-label="Curvatura da conexão"
            aria-valuenow={Math.round((curve ? (bend ?? DEFAULT_BEND) : 0) * 100)}
            title="Arraste para curvar · clique duplo endireita"
            className="wp-bend-handle nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${handleAt.x}px, ${handleAt.y}px)` }}
            onPointerDown={onBend}
            onDoubleClick={(e) => {
              e.stopPropagation();
              bendEdge(p.id, null);
            }}
          />
        </EdgeLabelRenderer>
      )}
    </g>
  );
}

/** A connection between handles, drawn in its kind's look (relation, flow, dependency, strong). */
const KindEdge = memo(function KindEdge(p: EdgeProps<PlanFlowEdge>) {
  const kind: EdgeKind = p.data?.kind ?? "flow";
  const app = EDGE_APPEARANCE[kind];
  // An elbow connection drawn with the arrow tool keeps its color, width and dash.
  const st = p.data?.style;
  const avoid = p.data?._avoid as Avoid | undefined;
  const [stepPath, sx, sy] = getSmoothStepPath({
    sourceX: p.sourceX,
    sourceY: p.sourceY,
    targetX: p.targetX,
    targetY: p.targetY,
    sourcePosition: p.sourcePosition,
    targetPosition: p.targetPosition,
    borderRadius: 10,
    offset: 18,
  });
  // Something in the way: go around it.
  const routed = useMemo(() => {
    if (!avoid) return null;
    const s0 = { x: p.sourceX, y: p.sourceY };
    const t0 = { x: p.targetX, y: p.targetY };
    const sSide = p.sourcePosition as Side;
    const tSide = p.targetPosition as Side;
    if (!polylineHits(plainElbow(s0, sSide, t0, tSide), avoid.boxes)) return null;
    const pts = orthoRoute(s0, sSide, t0, tSide, avoid.boxes, [avoid.source, avoid.target]);
    return pts ? roundedPath(pts, 10) : null;
  }, [avoid, p.sourceX, p.sourceY, p.targetX, p.targetY, p.sourcePosition, p.targetPosition]);
  const path = routed?.d ?? stepPath;
  const fallback = useMemo(() => (routed ? routed.mid : { x: sx, y: sy }), [routed, sx, sy]);
  const { at: labelAt, handlers: labelHandlers, movable } = useEdgeLabel(p.id, path, p.data?.labelPos, fallback);
  const lx = labelAt.x;
  const ly = labelAt.y;
  const label = p.data?.label;
  const step = p.data?.step;
  const opacity = p.data?._opacity;
  const { mode, editingId, setEditingId, commitEdgeLabel } = usePlanner();
  const editing = mode === "edit" && editingId === p.id && !!commitEdgeLabel;
  const faded = opacity !== undefined ? { opacity } : undefined;
  return (
    <g style={faded}>
      <BaseEdge
        id={p.id}
        path={path}
        interactionWidth={18}
        className="wp-edge-path"
        style={{
          strokeWidth: st?.strokeWidth ?? app.strokeWidth,
          strokeDasharray: st?.strokeStyle ? dashFor(st.strokeStyle, st.strokeWidth ?? app.strokeWidth) : app.dash,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          ...(st?.stroke && !p.selected ? { stroke: st.stroke } : {}),
        }}
      />
      {app.double && <path d={path} fill="none" pointerEvents="none" style={{ stroke: "var(--wp-canvas-bg, var(--canvas))", strokeWidth: 1.5 }} />}
      {/* Drawn here instead of an SVG <marker> (shared, one fixed color) so it follows hover, selection and theme. */}
      {app.arrow && (
        <path
          d="M -9 -5 L 0 0 L -9 5 Z"
          className="wp-edge-arrow"
          pointerEvents="none"
          style={st?.stroke && !p.selected ? { fill: st.stroke, stroke: st.stroke } : undefined}
          strokeLinejoin="round"
          transform={`translate(${p.targetX} ${p.targetY}) rotate(${ENTRY_ANGLE[p.targetPosition]})`}
        />
      )}
      {editing && (
        <EdgeLabelRenderer>
          <EdgeLabelInput
            x={lx}
            y={ly}
            initial={label ?? ""}
            onDone={(v) => {
              if (v !== null && v !== (label ?? "")) commitEdgeLabel!(p.id, v);
              setEditingId(null);
            }}
          />
        </EdgeLabelRenderer>
      )}
      {(label || step) && !editing && (
        <EdgeLabelRenderer>
          <div
            className={cn("wp-edge-label nodrag nopan", !label && "is-step-only", p.selected && "is-selected", movable && "is-movable", p.data?._dim === true && "is-dim", p.data?._diff && `wp-diff-${p.data._diff}`)}
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, ...faded }}
            {...labelHandlers}
            title={p.data?.description || label || `Passo ${step}`}
          >
            {step && (
              <span className="wp-edge-step" aria-label={`Passo ${step}`}>
                {step}
              </span>
            )}
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
});

export const edgeTypes: EdgeTypes = { plan: PlanEdge };

/** Label editor at the middle of an edge (double-click it). Enter saves, Esc cancels. */
function EdgeLabelInput({ x, y, initial, onDone }: { x: number; y: number; initial: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  return (
    <input
      ref={ref}
      value={v}
      aria-label="Rótulo da conexão"
      placeholder="Rótulo…"
      maxLength={120}
      className="wp-edge-label-input nodrag nopan"
      style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(v)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(v);
        if (e.key === "Escape") finish(null);
      }}
    />
  );
}

/** Small inline sample of a connection kind (legend, pickers). */
export function EdgeSample({ kind, width = 36, className }: { kind: EdgeKind; width?: number; className?: string }) {
  const app = EDGE_APPEARANCE[kind];
  const end = app.arrow ? width - 6 : width - 2;
  return (
    <svg width={width} height="10" viewBox={`0 0 ${width} 10`} aria-hidden className={cn("shrink-0 overflow-visible", className)}>
      <path d={`M 2 5 L ${end} 5`} stroke="var(--wp-edge)" strokeWidth={kind === "strong" ? 4.5 : 2} fill="none" strokeLinecap="round" strokeDasharray={app.dash ? "5 4" : undefined} />
      {app.double && <path d={`M 2 5 L ${end} 5`} stroke="var(--surface)" strokeWidth={1.25} fill="none" />}
      {app.arrow && <path d={`M ${width - 7} 1.5 L ${width - 1} 5 L ${width - 7} 8.5 Z`} fill="var(--wp-edge)" />}
    </svg>
  );
}

export function EdgeLegend({ kinds = EDGE_KINDS }: { kinds?: readonly EdgeKind[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {kinds.map((k) => (
        <li key={k} className="flex items-center gap-2.5 text-body text-ink-2">
          <EdgeSample kind={k} />
          <span>{EDGE_APPEARANCE[k].label}</span>
        </li>
      ))}
    </ul>
  );
}
