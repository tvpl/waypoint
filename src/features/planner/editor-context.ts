"use client";
import { createContext, useContext } from "react";
import type { LibraryContent } from "@/domain/library";
import type { EdgeKind, Glyph, NodeData, NodeKind, PlanDocument, PlanEdge, PlanLayer, PlanView, ResourceRef } from "@/domain/plan";
import type { PlanFlowEdge, PlanFlowNode } from "@/domain/canvas-adapter";
import type { AlignMode } from "./doc-ops";
import type { LayoutDirection } from "./auto-layout";
import type { ResolvedResource } from "./resource-types";
import type { InkMode, Point } from "./ink-geometry";
import type { DrawStyle, Pt } from "./shape-geometry";

/**
 * "draw": pen or highlighter (see `ink`); "erase": removes drawings under the pointer; the shape
 * tools draw a box by dragging; "arrow"/"line" connect the shapes they start and end on (or draw a
 * free line); "text" places a text where you click.
 */
export type Tool = "select" | "hand" | "connect" | "draw" | "erase" | "rect" | "diamond" | "ellipse" | "arrow" | "line" | "text" | "frame";

/** Tools that create by pressing on the canvas (React Flow selection and dragging are off). */
export const CREATE_TOOLS: ReadonlySet<Tool> = new Set(["draw", "erase", "rect", "diamond", "ellipse", "arrow", "line", "text", "frame"]);
export const SHAPE_TOOLS: ReadonlySet<Tool> = new Set(["rect", "diamond", "ellipse", "arrow", "line", "text", "frame"]);

export type InkSettings = { mode: InkMode; color: string | undefined; size: number };

export type LayersApi = {
  /** Bottom to top, base included. */
  list: PlanLayer[];
  views: PlanView[];
  /** Where new elements, connections and drawings go. */
  active: string;
  setActive: (id: string) => void;
  add: () => void;
  update: (id: string, patch: Partial<Omit<PlanLayer, "id">>) => void;
  move: (id: string, dir: "up" | "down") => void;
  remove: (id: string, mode: "merge" | "delete") => void;
  solo: (id: string) => void;
  showAll: () => void;
  /** Moves the selection (nodes with what is inside them, and edges) to a layer. */
  assignSelection: (id: string) => void;
  selectLayer: (id: string) => void;
  saveView: (name: string) => void;
  applyView: (id: string) => void;
  removeView: (id: string) => void;
  /** Adds a ready-made set of layers and views (src/domain/layers.ts LAYER_TEMPLATES). */
  applyTemplate: (id: string) => void;
  /** Opens the comments panel on a layer's threads. */
  comment: (id: string) => void;
  /** Moves a layer to a position in the stack (0 = bottom). */
  reorder: (id: string, toIndex: number) => void;
  /** Moves a layer to a position and into a folder (or none), in one step: a drag in the panel. */
  place: (id: string, toIndex: number, group: string | undefined) => void;
  /** Puts layers in a folder, or out of it (no name). */
  setGroup: (ids: string[], group: string | undefined) => void;
  renameGroup: (from: string, to: string) => void;
  /** Moves elements (with what is inside them) and connections to a layer. */
  assignTo: (id: string, ids: { nodes?: string[]; edges?: string[] }) => void;
  /** Layer being edited alone, if any. */
  isolated: string | null;
  setIsolated: (id: string | null) => void;
  renameView: (id: string, name: string) => void;
  reorderView: (id: string, toIndex: number) => void;
  /** Makes a view show the layers visible now. */
  updateView: (id: string) => void;
  /** Outlines an element on the canvas (hovering it in the panel). */
  hover: (id: string | null) => void;
  /** Elements per layer (top-level nodes and connections). */
  counts: Map<string, number>;
};
export type InspectorTab = "content" | "appearance" | "action";

export type PlanMeta = { title: string; description: string | null; tags: string[]; visibility: string };

export type EditorApi = {
  planId: string;
  nodes: PlanFlowNode[];
  edges: PlanFlowEdge[];
  selectedNodes: PlanFlowNode[];
  selectedEdges: PlanFlowEdge[];
  meta: PlanMeta;
  saveMeta: (patch: Partial<Pick<PlanMeta, "title" | "description" | "tags">>) => void;

  addNode: (kind: NodeKind, opts?: { at?: { x: number; y: number }; data?: Partial<NodeData> }) => void;
  addResourceNode: (ref: ResourceRef, resource: ResolvedResource, at?: { x: number; y: number }) => void;
  updateNodeData: (id: string, patch: Partial<NodeData>, coalesceKey?: string) => void;
  updateNodeSize: (id: string, size: { width?: number; height?: number }) => void;
  updateEdge: (id: string, patch: Partial<Pick<PlanEdge, "label" | "description" | "kind" | "step">>, coalesceKey?: string) => void;
  mutate: (fn: (doc: PlanDocument) => PlanDocument, opts?: { select?: string[]; key?: string }) => void;

  remove: () => void;
  duplicate: () => void;
  copy: () => void;
  paste: (at?: { x: number; y: number }) => void;
  hasClipboard: () => boolean;
  group: () => void;
  ungroup: () => void;
  align: (mode: AlignMode) => void;
  distribute: (axis: "horizontal" | "vertical") => void;
  bringToFront: () => void;
  sendToBack: () => void;
  swapEdge: (id: string) => void;
  /** "Organizar automaticamente": the selection when there is one, else the whole plan. One undo step. */
  autoArrange: (direction: LayoutDirection, opts?: { all?: boolean }) => void;
  select: (nodeIds: string[], edgeIds?: string[]) => void;
  selectAll: () => void;
  focusNode: (id: string) => void;
  toggleCollapsed: (id: string) => void;
  startEditing: (id: string) => void;
  startConnectFrom: (id: string) => void;

  tool: Tool;
  setTool: (t: Tool) => void;
  ink: InkSettings;
  setInk: (patch: Partial<InkSettings>) => void;
  /** Adds a stroke drawn on the canvas (canvas coordinates) to the active layer. */
  addInk: (points: Point[], zoom: number) => void;
  /** Removes drawings (eraser). One undo step. */
  removeInk: (ids: string[]) => void;
  /** Starts a text annotation at a canvas point (edited in place). */
  addInkText: (at: { x: number; y: number }) => void;
  /** Style new shapes and arrows are drawn with; changing it restyles the selection too. */
  style: DrawStyle;
  setStyle: (patch: Partial<DrawStyle>) => void;
  /** A shape, text or frame drawn on the canvas (canvas coordinates; a click gives a default size). */
  addShape: (type: "rect" | "diamond" | "ellipse" | "text" | "frame", box: { x: number; y: number; w: number; h: number } | null, at: Pt) => void;
  /** An icon from the library (canvas point; default the view's center). */
  addIcon: (icon: IconPick, at?: Pt) => void;
  /** A library item: a fresh copy centered on the point (default the view's center). */
  insertFragment: (content: LibraryContent, at?: Pt) => void;
  /** The selection as a library item (elements inside it and the connections among them). */
  selectionFragment: () => LibraryContent | null;
  /** An arrow or line: connects the elements it starts and ends on, else it is a free line. */
  addLink: (kind: "arrow" | "line", from: Pt, to: Pt, source?: string | null, target?: string | null) => void;
  /** Numbers the selected flow's connections 1…n ("Numerar passos"), or clears the numbers. */
  numberSteps: (edgeIds?: string[]) => void;
  clearSteps: (edgeIds?: string[]) => void;
  layers: LayersApi;
  connectKind: EdgeKind;
  setConnectKind: (k: EdgeKind) => void;
  grid: boolean;
  setGrid: (v: boolean) => void;
  snap: boolean;
  minimap: boolean;
  setMinimap: (v: boolean) => void;
  setSnap: (v: boolean) => void;

  inspectorTab: InspectorTab;
  setInspectorTab: (t: InspectorTab) => void;

  resourceFor: (node: { id: string; data: Pick<NodeData, "resource"> }) => ResolvedResource | null;
  cacheResource: (ref: ResourceRef, resource: ResolvedResource) => void;

  openShare: (section?: "share" | "history") => void;
  /** Opens the comments panel, optionally on a node's thread/composer. */
  openComments: (nodeId?: string | null) => void;
  /** Exports an image/PDF of a saved view (the canvas shows it only while exporting). */
  exportView: (kind: "png" | "svg" | "pdf", viewId: string) => void;
};

export const EditorContext = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
  const v = useContext(EditorContext);
  if (!v) throw new Error("useEditor outside of the planner editor");
  return v;
}

/** An icon chosen in the library panel. */
export type IconPick = { glyph: Glyph; name: string; set: "ui" | "brand"; color?: string };
