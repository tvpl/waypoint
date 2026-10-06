"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { toFlowEdges, toFlowNodes, type PlanFlowEdge, type PlanFlowNode } from "@/domain/canvas-adapter";
import { overlayElements } from "@/domain/overlay";
import type { PlanDocument, PlanLayer } from "@/domain/plan";
import type { OverlayResponse } from "@/app/api/plans/[id]/overlay/route";

export type OverlayState = { status: "loading" } | { status: "ok"; title: string; doc: PlanDocument; version: string } | { status: "error"; error: string };

const urlFor = (planId: string, version?: string | null) => `/api/plans/${encodeURIComponent(planId)}/overlay${version ? `?version=${encodeURIComponent(version)}` : ""}`;

/**
 * The plans shown on overlay layers, and the version under the "papel vegetal". Live: fetched
 * again when the window regains focus and every 30 s while it is visible.
 */
export function useOverlays(hostPlanId: string, layers: PlanLayer[] | undefined, onionVersion: string | null) {
  const sources = useMemo(() => [...new Set((layers ?? []).filter((l) => l.source && l.source.planId !== hostPlanId).map((l) => l.source!.planId))].sort(), [layers, hostPlanId]);
  const urls = useMemo(() => [...sources.map((id) => urlFor(id)), ...(onionVersion ? [urlFor(hostPlanId, onionVersion)] : [])], [sources, onionVersion, hostPlanId]);
  const [state, setState] = useState<Record<string, OverlayState>>({});
  const versions = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!urls.length) return;
    let stop = false;
    const load = async (url: string, first: boolean) => {
      if (first && !versions.current[url]) setState((s) => (s[url] ? s : { ...s, [url]: { status: "loading" } }));
      try {
        const res = await fetch(url, { cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as Partial<OverlayResponse> & { error?: string };
        if (stop) return;
        if (!res.ok || !body.document) {
          const error = res.status === 404 || res.status === 403 ? (body.error && body.error !== "not found" ? body.error : "Sem acesso a este plan.") : "Não foi possível carregar.";
          return setState((s) => ({ ...s, [url]: { status: "error", error } }));
        }
        // Unchanged since the last look: keep the same objects (no re-render).
        if (versions.current[url] === body.version) return;
        versions.current[url] = body.version!;
        setState((s) => ({ ...s, [url]: { status: "ok", title: body.title ?? "", doc: body.document!, version: body.version! } }));
      } catch {
        if (!stop) setState((s) => (s[url]?.status === "ok" ? s : { ...s, [url]: { status: "error", error: "Não foi possível carregar." } }));
      }
    };
    for (const u of urls) void load(u, true);
    const refresh = () => {
      if (document.visibilityState === "visible") for (const u of urls) if (!u.includes("?version=")) void load(u, false);
    };
    window.addEventListener("focus", refresh);
    const t = setInterval(refresh, 30_000);
    return () => {
      stop = true;
      window.removeEventListener("focus", refresh);
      clearInterval(t);
    };
  }, [urls]);

  return useMemo(() => {
    const byPlan = new Map(sources.map((id) => [id, state[urlFor(id)] ?? ({ status: "loading" } as OverlayState)]));
    const onion = onionVersion ? (state[urlFor(hostPlanId, onionVersion)] ?? ({ status: "loading" } as OverlayState)) : null;
    return { byPlan, onion };
  }, [sources, state, onionVersion, hostPlanId]);
}

/**
 * Read-only canvas elements for the overlays: on their layer (its visibility, stacking and
 * opacity apply), never selectable; the "papel vegetal" faded under everything.
 */
export function overlayFlow(
  host: Pick<PlanDocument, "layers">,
  overlays: ReturnType<typeof useOverlays>,
  opts: { layerVisibility?: Readonly<Record<string, boolean>>; isolate?: string | null } = {},
): { nodes: PlanFlowNode[]; edges: PlanFlowEdge[] } {
  const nodes: PlanFlowNode[] = [];
  const edges: PlanFlowEdge[] = [];
  const mark = <T extends PlanFlowNode | PlanFlowEdge>(list: T[], cls: string, z?: number): T[] =>
    list.map((x) => ({ ...x, className: x.className ? `${x.className} ${cls}` : cls, selectable: false, deletable: false, focusable: false, ...(z !== undefined ? { zIndex: z } : {}) }));
  for (const l of host.layers ?? []) {
    const src = l.source && overlays.byPlan.get(l.source.planId);
    if (!src || src.status !== "ok") continue;
    const els = overlayElements(src.doc, { key: l.id, layer: l.id, dx: l.source!.dx, dy: l.source!.dy });
    const doc = { nodes: els.nodes, edges: els.edges, layers: host.layers };
    const o = { readOnly: true, layerVisibility: opts.layerVisibility, isolate: opts.isolate };
    nodes.push(...mark(toFlowNodes(doc, o), "wp-overlay"));
    edges.push(...mark(toFlowEdges(doc, o), "wp-overlay"));
  }
  if (overlays.onion?.status === "ok") {
    const els = overlayElements(overlays.onion.doc, { key: "onion" });
    const doc = { nodes: els.nodes, edges: els.edges };
    nodes.push(...mark(toFlowNodes(doc, { readOnly: true }), "wp-overlay wp-onion", -1));
    // Its labels fade too (they are drawn outside the edge's own element).
    edges.push(...mark(toFlowEdges(doc, { readOnly: true }), "wp-overlay wp-onion", -1).map((e) => ({ ...e, data: { ...e.data!, _dim: true } })));
  }
  return { nodes, edges };
}
