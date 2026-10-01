"use client";
import { createContext, useContext } from "react";
import type { EdgeKind, NodeData, NodeKind, PlanDocument, PlanEdge, ResourceRef } from "@/domain/plan";
import type { PlanFlowEdge, PlanFlowNode } from "@/domain/canvas-adapter";
import type { AlignMode } from "./doc-ops";
import type { ResolvedResource } from "./resource-types";

export type Tool = "select" | "hand" | "connect";
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
  updateEdge: (id: string, patch: Partial<Pick<PlanEdge, "label" | "description" | "kind">>, coalesceKey?: string) => void;
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
  select: (nodeIds: string[], edgeIds?: string[]) => void;
  selectAll: () => void;
  focusNode: (id: string) => void;
  toggleCollapsed: (id: string) => void;
  startEditing: (id: string) => void;
  startConnectFrom: (id: string) => void;

  tool: Tool;
  setTool: (t: Tool) => void;
  connectKind: EdgeKind;
  setConnectKind: (k: EdgeKind) => void;
  grid: boolean;
  setGrid: (v: boolean) => void;
  snap: boolean;
  setSnap: (v: boolean) => void;

  inspectorTab: InspectorTab;
  setInspectorTab: (t: InspectorTab) => void;

  resourceFor: (node: { id: string; data: Pick<NodeData, "resource"> }) => ResolvedResource | null;
  cacheResource: (ref: ResourceRef, resource: ResolvedResource) => void;

  openShare: (section?: "share" | "history") => void;
};

export const EditorContext = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
  const v = useContext(EditorContext);
  if (!v) throw new Error("useEditor outside of the planner editor");
  return v;
}
