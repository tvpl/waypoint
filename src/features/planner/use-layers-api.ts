"use client";
/**
 * The editor's layers API: the stack and saved views, the active layer, isolating, overlays of
 * other plans and the onion skin, with every change going through the editor's history.
 */
import { useMemo, type MutableRefObject } from "react";
import { toast } from "sonner";
import type { PlanDocument, PlanLayer, PlanView } from "@/domain/plan";
import {
  addLayer,
  applyLayerTemplate,
  applyView,
  assignLayer,
  BASE_LAYER_ID,
  layersOf,
  moveLayer,
  removeLayer,
  removeView,
  renameLayerGroup,
  renameView,
  reorderLayer,
  reorderView,
  saveView,
  setLayerGroup,
  showAllLayers,
  soloLayer,
  updateLayer,
  updateViewLayers,
} from "@/domain/layers";
import type { PlanFlowEdge, PlanFlowNode } from "@/domain/canvas-adapter";
import type { LayersApi } from "./editor-context";
import type { useOverlays } from "./overlays";

export type LayersDeps = {
  planId: string;
  layerState: { layers?: PlanLayer[]; views?: PlanView[] };
  nodes: PlanFlowNode[];
  edges: PlanFlowEdge[];
  nodesRef: MutableRefObject<PlanFlowNode[]>;
  edgesRef: MutableRefObject<PlanFlowEdge[]>;
  activeLayer: string;
  setActiveLayer: (id: string) => void;
  activeLayerRef: MutableRefObject<string>;
  mutate: (fn: (d: PlanDocument) => PlanDocument, opts?: { select?: string[]; key?: string }) => void;
  select: (nodes: string[], edges?: string[]) => void;
  openLayerComments: (id: string) => void;
  isolated: string | null;
  setIsolated: (id: string | null) => void;
  setHoverId: (id: string | null) => void;
  overlays: ReturnType<typeof useOverlays>;
  onion: { versionId: string; label: string } | null;
  setOnion: (o: { versionId: string; label: string } | null) => void;
};

export function useLayersApi({
  planId,
  layerState,
  nodes,
  edges,
  nodesRef,
  edgesRef,
  activeLayer,
  setActiveLayer,
  activeLayerRef,
  mutate,
  select,
  openLayerComments,
  isolated,
  setIsolated,
  setHoverId,
  overlays,
  onion,
  setOnion,
}: LayersDeps): LayersApi {
  return useMemo<LayersApi>(() => {
    const list = layersOf(layerState);
    const counts = new Map<string, number>();
    for (const n of nodes) if (!n.parentId) counts.set(n.data._layer ?? BASE_LAYER_ID, (counts.get(n.data._layer ?? BASE_LAYER_ID) ?? 0) + 1);
    for (const e of edges) counts.set(e.data?.layer ?? BASE_LAYER_ID, (counts.get(e.data?.layer ?? BASE_LAYER_ID) ?? 0) + 1);
    return {
      list,
      views: layerState.views ?? [],
      active: list.some((l) => l.id === activeLayer) ? activeLayer : BASE_LAYER_ID,
      setActive: setActiveLayer,
      add: () => {
        let id: string | null = null;
        mutate((d) => {
          const r = addLayer(d);
          id = r.id;
          return r.doc;
        });
        if (id) setActiveLayer(id);
      },
      update: (id, patch) =>
        mutate((d) => updateLayer(d, id, patch), { key: patch.name !== undefined ? `layer-name:${id}` : patch.opacity !== undefined ? `layer-opacity:${id}` : undefined }),
      move: (id, dir) => mutate((d) => moveLayer(d, id, dir)),
      remove: (id, mode) => {
        mutate((d) => removeLayer(d, id, mode), { select: [] });
        if (activeLayerRef.current === id) setActiveLayer(BASE_LAYER_ID);
      },
      solo: (id) => mutate((d) => soloLayer(d, id)),
      showAll: () => mutate((d) => showAllLayers(d)),
      assignSelection: (id) => {
        const ns = nodesRef.current.filter((n) => n.selected).map((n) => n.id);
        const es = edgesRef.current.filter((e) => e.selected).map((e) => e.id);
        if (!ns.length && !es.length) return;
        mutate((d) => assignLayer(d, id, { nodes: ns, edges: es }));
      },
      selectLayer: (id) => {
        const ns = nodesRef.current.filter((n) => !n.parentId && (n.data._layer ?? BASE_LAYER_ID) === id && !n.hidden && n.selectable !== false).map((n) => n.id);
        const es = edgesRef.current.filter((e) => (e.data?.layer ?? BASE_LAYER_ID) === id && !e.hidden && e.selectable !== false).map((e) => e.id);
        select(ns, es);
      },
      saveView: (name) => mutate((d) => saveView(d, name).doc),
      applyView: (id) => mutate((d) => applyView(d, id)),
      removeView: (id) => mutate((d) => removeView(d, id)),
      applyTemplate: (id) => {
        let first: string | null = null;
        mutate((d) => {
          const r = applyLayerTemplate(d, id);
          first = r.first;
          return r.doc;
        });
        if (first) setActiveLayer(first);
      },
      comment: (id) => openLayerComments(id),
      reorder: (id, toIndex) => mutate((d) => reorderLayer(d, id, toIndex)),
      place: (id, toIndex, group) =>
        mutate((d) => {
          const x = reorderLayer(d, id, toIndex);
          return layersOf(x).find((l) => l.id === id)?.group === group ? x : setLayerGroup(x, [id], group);
        }),
      setGroup: (ids, group) => mutate((d) => setLayerGroup(d, ids, group)),
      renameGroup: (from, to) => mutate((d) => renameLayerGroup(d, from, to)),
      assignTo: (id, ids) => mutate((d) => assignLayer(d, id, ids)),
      isolated,
      setIsolated,
      renameView: (id, name) => mutate((d) => renameView(d, id, name)),
      reorderView: (id, toIndex) => mutate((d) => reorderView(d, id, toIndex)),
      updateView: (id) => mutate((d) => updateViewLayers(d, id)),
      hover: setHoverId,
      counts,
      addOverlay: (sourceId, title) => {
        if (sourceId === planId) return;
        let id: string | null = null;
        mutate((d) => {
          const r = addLayer(d, title || "Plan sobreposto");
          id = r.id;
          return updateLayer(r.doc, r.id, { source: { planId: sourceId }, opacity: 0.6, locked: true });
        });
        if (id) toast.success(`“${title}” sobreposto numa camada nova`);
      },
      overlays: new Map(
        [...overlays.byPlan].map(([pid, st]) => [
          pid,
          st.status === "ok" ? { status: "ok" as const, title: st.title, count: st.doc.nodes.length } : st.status === "error" ? { status: "error" as const, error: st.error } : { status: "loading" as const },
        ]),
      ),
      onion,
      setOnion,
    };
  }, [layerState, nodes, edges, activeLayer, mutate, select, openLayerComments, isolated, setIsolated, overlays, onion, planId, nodesRef, edgesRef, activeLayerRef, setActiveLayer, setHoverId, setOnion]);
}
