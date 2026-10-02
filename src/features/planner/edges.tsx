"use client";
import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Position, type EdgeProps, type EdgeTypes } from "@xyflow/react";
import { EDGE_KINDS, type EdgeKind } from "@/domain/plan";
import { EDGE_APPEARANCE, type PlanFlowEdge } from "@/domain/canvas-adapter";
import { cn } from "@/lib/utils";

/** Direction (degrees) an edge travels when it enters a handle on each side of the target. */
const ENTRY_ANGLE: Record<Position, number> = {
  [Position.Left]: 0,
  [Position.Top]: 90,
  [Position.Right]: 180,
  [Position.Bottom]: -90,
};

export const PlanEdge = memo(function PlanEdge(p: EdgeProps<PlanFlowEdge>) {
  const kind: EdgeKind = p.data?.kind ?? "flow";
  const app = EDGE_APPEARANCE[kind];
  const [path, lx, ly] = getSmoothStepPath({
    sourceX: p.sourceX,
    sourceY: p.sourceY,
    targetX: p.targetX,
    targetY: p.targetY,
    sourcePosition: p.sourcePosition,
    targetPosition: p.targetPosition,
    borderRadius: 10,
    offset: 18,
  });
  const label = p.data?.label;
  return (
    <>
      <BaseEdge
        id={p.id}
        path={path}
        interactionWidth={18}
        className="wp-edge-path"
        style={{ strokeWidth: app.strokeWidth, strokeDasharray: app.dash, strokeLinecap: "round", strokeLinejoin: "round" }}
      />
      {app.double && <path d={path} fill="none" pointerEvents="none" style={{ stroke: "var(--wp-canvas-bg, var(--canvas))", strokeWidth: 1.5 }} />}
      {/* Drawn here instead of an SVG <marker> (shared, one fixed color) so it follows hover, selection and theme. */}
      {app.arrow && (
        <path
          d="M -9 -5 L 0 0 L -9 5 Z"
          className="wp-edge-arrow"
          pointerEvents="none"
          strokeLinejoin="round"
          transform={`translate(${p.targetX} ${p.targetY}) rotate(${ENTRY_ANGLE[p.targetPosition]})`}
        />
      )}
      {label && (
        <EdgeLabelRenderer>
          <div
            className={cn("wp-edge-label nodrag nopan", p.selected && "is-selected", p.data?._dim === true && "is-dim")}
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
            title={p.data?.description || label}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

export const edgeTypes: EdgeTypes = { plan: PlanEdge };

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
