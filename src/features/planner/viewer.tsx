"use client";
import "@xyflow/react/dist/style.css";
import "./planner.css";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ConnectionMode, ReactFlow, ReactFlowProvider, useReactFlow, type Node } from "@xyflow/react";
import { ArrowUpRight, ExternalLink, Loader2, PanelRight, X } from "lucide-react";
import type { NodeData, PlanDocument } from "@/domain/plan";
import { toFlowEdges, toFlowNodes, type PlanFlowNode } from "@/domain/canvas-adapter";
import { Badge, TagChip } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn, motionMs } from "@/lib/utils";
import { PlannerContext, type PlannerContextValue } from "./context";
import { nodeTypes } from "./nodes";
import { edgeTypes } from "./edges";
import { statusMeta, PARENT_KINDS } from "./defaults";
import { ZoomControls } from "./zoom-controls";
import { fallbackResource, type ResolvedResource } from "./resource-types";
import { ResourceIcon } from "./resource-picker";
import { copyScene, downloadScene, excalidrawScene, exportFramesPdf, exportImage, exportJson, exportPdf, isExcalidrawExport, openPrintWindow } from "./export";
import { isOverlayId } from "@/domain/overlay";
import { overlayFlow, useOverlays } from "./overlays";
import { compareViews, layerIdOf, layerVisibility, viewVisibility } from "@/domain/layers";
import { CompareBar, defaultCompare, parseCompare, sideVisibility, ViewLayers, type CompareState } from "./view-layers";
import type { ExportKind } from "./topbar";

export type ViewerExport = (kind: ExportKind, viewId?: string) => Promise<void>;

export type CanvasExtras = {
  /** Comments in unresolved threads per node (badge). */
  commentCount?: (id: string) => number;
  openNodeComments?: (id: string) => void;
  /** Pan to a node and highlight it (seq changes for each request). */
  focusRequest?: { id: string; seq: number } | null;
};

type Props = CanvasExtras & {
  document: PlanDocument;
  /** The plan shown (lets layers that overlay other plans load them). */
  planId?: string;
  resources: Record<string, ResolvedResource>;
  focusNodeId?: string | null;
  className?: string;
  meta?: { title: string; description?: string | null; tags?: string[] };
  exportRef?: MutableRefObject<ViewerExport | null>;
  /**
   * Presentation stage: no zoom controls; dims everything outside `activeIds` (connections on
   * `activeLayer` stay lit too, for a layer being revealed).
   */
  stage?: { activeIds: ReadonlySet<string> | null; activeLayer?: string };
  /** Layer visibility decided by the caller (presentation steps); otherwise the reader picks. */
  layerOverrides?: Record<string, boolean>;
  /** Rendered inside the React Flow provider (e.g. presentation controls). */
  children?: React.ReactNode;
};

/** Read-only canvas (View Mode, public share, editor preview). */
export function PlanCanvasView(props: Props) {
  return (
    <ReactFlowProvider>
      <ViewerInner {...props} />
    </ReactFlowProvider>
  );
}

function hasInfo(d: NodeData) {
  return !!(d.resource || d.description?.trim() || d.tags?.length || (d.status && d.status !== "none"));
}

function ancestorsOf(doc: PlanDocument, id: string) {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const out: string[] = [];
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur?.parentId && !seen.has(cur.parentId)) {
    seen.add(cur.parentId);
    out.push(cur.parentId);
    cur = byId.get(cur.parentId);
  }
  return out;
}

type Hover = { id: string; left: number; top: number; sheet?: boolean };

function ViewerInner({ document: doc, planId, resources, focusNodeId, className, meta, exportRef, stage, layerOverrides: fixedLayers, children, commentCount, openNodeComments, focusRequest }: Props) {
  const rf = useReactFlow();
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);
  const focusExists = !!focusNodeId && doc.nodes.some((n) => n.id === focusNodeId);
  const [overrides, setOverrides] = useState<Record<string, boolean>>(() => {
    if (!focusExists) return {};
    return Object.fromEntries(ancestorsOf(doc, focusNodeId!).map((id) => [id, false]));
  });
  const [highlight, setHighlight] = useState<string | null>(focusExists ? focusNodeId! : null);
  const [hover, setHover] = useState<Hover | null>(null);
  // Layers this reader turned on/off (or a saved view from ?view=…); the document keeps its defaults.
  const viewParam = useSearchParams()?.get("view");
  const [layerOverrides, setLayerOverrides] = useState<Record<string, boolean>>(() => (viewParam && viewVisibility(doc, viewParam)) || {});
  const layerOverridesRef = useRef(layerOverrides);
  layerOverridesRef.current = layerOverrides;
  // Comparing two views (?compare=a,b opens one directly).
  const compareParam = useSearchParams()?.get("compare");
  const [compare, setCompare] = useState<CompareState | null>(() => (stage ? null : parseCompare(doc, compareParam)));
  const diff = useMemo(() => (compare ? compareViews(doc, compare.a, compare.b) : null), [doc, compare]);
  const shownLayers = useMemo(() => {
    if (fixedLayers) return fixedLayers;
    if (compare && diff) return compare.show === "diff" ? diff.visibility : sideVisibility(doc, compare.show === "a" ? compare.a : compare.b);
    return layerOverrides;
  }, [fixedLayers, compare, diff, doc, layerOverrides]);
  const diffOn = !!diff && compare?.show === "diff";
  const [details, setDetails] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ res: ResolvedResource; title: string } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const viewDoc = useMemo(
    () => ({
      ...doc,
      nodes: doc.nodes.map((n) => (n.id in overrides ? { ...n, data: { ...n.data, collapsed: overrides[n.id] } } : n)),
    }),
    [doc, overrides],
  );
  const active = stage?.activeIds ?? null;
  const activeLayer = stage?.activeLayer;
  const nodes = useMemo(() => {
    const list = toFlowNodes(viewDoc, { readOnly: true, layerVisibility: shownLayers });
    if (diffOn) return list.map((n) => ({ ...n, className: cn(n.className, `wp-diff-${diff!.nodes.get(n.id) ?? "same"}`) }));
    if (!stage) return list;
    return list.map((n) => ({ ...n, className: cn(n.className, "wp-stage-node", active && !active.has(n.id) && "wp-dim") }));
  }, [viewDoc, stage, active, shownLayers, diffOn, diff]);
  const edges = useMemo(() => {
    const list = toFlowEdges(viewDoc, { readOnly: true, layerVisibility: shownLayers });
    if (diffOn) {
      return list.map((e) => {
        const st = diff!.edges.get(e.id) ?? "same";
        return { ...e, className: cn(e.className, `wp-diff-${st}`), data: { ...e.data!, _diff: st } };
      });
    }
    if (!stage) return list;
    return list.map((e) => {
      const lit = !active || (active.has(e.source) && active.has(e.target)) || (!!activeLayer && layerIdOf(e.data ?? {}) === activeLayer);
      return { ...e, className: cn(e.className, "wp-stage-edge", !lit && "wp-dim"), data: { ...e.data!, _dim: !lit } };
    });
  }, [viewDoc, stage, active, activeLayer, shownLayers, diffOn, diff]);
  // Other plans overlaid on layers, for readers who can see them.
  const overlays = useOverlays(planId ?? "", planId ? doc.layers : undefined, null);
  const overlay = useMemo(() => overlayFlow(doc, overlays, { layerVisibility: shownLayers }), [doc, overlays, shownLayers]);
  const renderNodes = useMemo(() => (overlay.nodes.length ? [...overlay.nodes, ...nodes] : nodes), [overlay.nodes, nodes]);
  const renderEdges = useMemo(() => (overlay.edges.length ? [...overlay.edges, ...edges] : edges), [overlay.edges, edges]);
  const byId = useMemo(() => new Map(doc.nodes.map((n) => [n.id, n])), [doc]);

  const resourceFor = useCallback(
    (node: { id: string; data: Pick<NodeData, "resource"> }) => {
      const ref = node.data.resource;
      if (!ref) return null;
      return resources[node.id] ?? fallbackResource(ref);
    },
    [resources],
  );

  const childCount = useCallback((id: string) => doc.nodes.filter((n) => n.parentId === id).length, [doc]);

  const ctx: PlannerContextValue = useMemo(
    () => ({
      mode: "view",
      resourceFor,
      editingId: null,
      setEditingId: () => {},
      commitTitle: () => {},
      toggleCollapsed: (id: string) =>
        setOverrides((o) => {
          const cur = id in o ? o[id] : !!byId.get(id)?.data.collapsed;
          return { ...o, [id]: !cur };
        }),
      childCount,
      singleSelectedId: null,
      highlightId: highlight,
      dropTargetId: null,
      connectSourceId: null,
      isInteractive: (n) => !PARENT_KINDS.has(n.type as never) && hasInfo(n.data),
      commentCount,
      openNodeComments: openNodeComments
        ? (id: string) => {
            setHover(null);
            setDetails(null);
            openNodeComments(id);
          }
        : undefined,
    }),
    [resourceFor, childCount, highlight, byId, commentCount, openNodeComments],
  );

  // focus requests (comments panel → canvas)
  useEffect(() => {
    if (!focusRequest || !byId.has(focusRequest.id)) return;
    const id = focusRequest.id;
    const anc = ancestorsOf(doc, id);
    if (anc.length) setOverrides((o) => ({ ...o, ...Object.fromEntries(anc.map((a) => [a, false])) }));
    setHighlight(id);
    const t = setTimeout(() => void rf.fitView({ nodes: [{ id }], padding: 0.8, maxZoom: 1.25, duration: motionMs(500) }), 80);
    const h = setTimeout(() => setHighlight((cur) => (cur === id ? null : cur)), 4500);
    return () => {
      clearTimeout(t);
      clearTimeout(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.seq]);

  // focus ?node=
  useEffect(() => {
    if (!focusExists) return;
    const t = setTimeout(() => {
      void rf.fitView({ nodes: [{ id: focusNodeId! }], padding: 0.8, maxZoom: 1.25, duration: motionMs(500) });
    }, 120);
    const h = setTimeout(() => setHighlight(null), 6000);
    return () => {
      clearTimeout(t);
      clearTimeout(h);
    };
  }, [focusExists, focusNodeId, rf]);

  // exports for the page header
  useEffect(() => {
    if (!exportRef) return;
    exportRef.current = async (kind, viewId) => {
      const view = viewId ? doc.views?.find((v) => v.id === viewId) : undefined;
      const title = view ? `${meta?.title ?? "plan"} — ${view.name}` : (meta?.title ?? "plan");
      if (kind === "json") return exportJson({ title, description: meta?.description, tags: meta?.tags }, doc);
      if (kind === "frames-pdf") {
        const frames = rf.getNodes().filter((n) => n.type === "frame" && !n.hidden && !isOverlayId(n.id));
        if (!frames.length) return void toast.error("O plan não tem quadros.");
        const win = openPrintWindow(title);
        if (!win) return void toast.error("Permita pop-ups para exportar em PDF.");
        const pages = frames.map((f) => ({ bounds: rf.getNodesBounds([f]), title: (f.data.title as string) || "Quadro" }));
        pages.sort((a, b) => (Math.abs(a.bounds.y - b.bounds.y) > Math.min(a.bounds.height, b.bounds.height) / 2 ? a.bounds.y - b.bounds.y : a.bounds.x - b.bounds.x));
        return exportFramesPdf(wrap.current!, pages, title, win).catch(() => void toast.error("Não foi possível exportar. Tente novamente."));
      }
      // a saved view is shown just for the picture, then the reader's own layers come back
      const before = layerOverridesRef.current;
      const vis = view ? viewVisibility(doc, view.id) : null;
      if (isExcalidrawExport(kind)) {
        const shown = vis ?? Object.fromEntries(layerVisibility(doc, before ?? undefined));
        const scene = await excalidrawScene(doc, { title, visible: (id) => shown[id] !== false });
        if (kind === "excalidraw") return downloadScene(scene, title);
        if (kind === "excalidraw-copy") {
          await copyScene(scene).then(
            () => toast.success("Copiado. Cole no Excalidraw com ⌘V."),
            () => toast.error("Não foi possível copiar."),
          );
          return;
        }
      }
      const win = kind === "pdf" ? openPrintWindow(title) : null;
      if (kind === "pdf" && !win) return void toast.error("Permita pop-ups para exportar em PDF.");
      try {
        if (vis) {
          setLayerOverrides(vis);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          await new Promise((r) => setTimeout(r, 120));
        }
        const visible = rf.getNodes().filter((n) => !n.hidden);
        if (!visible.length) {
          win?.close();
          return void toast.error(view ? "Esta visão está vazia." : "O plan está vazio.");
        }
        const bounds = rf.getNodesBounds(visible);
        if (kind === "pdf") await exportPdf(wrap.current!, bounds, title, win);
        else if (kind === "excalidraw-png" || kind === "excalidraw-svg") {
          const shown = vis ?? Object.fromEntries(layerVisibility(doc, before ?? undefined));
          await exportImage(wrap.current!, bounds, kind === "excalidraw-png" ? "png" : "svg", title, await excalidrawScene(doc, { title, visible: (id) => shown[id] !== false }));
        } else if (kind === "png" || kind === "svg") await exportImage(wrap.current!, bounds, kind, title);
      } catch {
        toast.error("Não foi possível exportar. Tente novamente.");
      } finally {
        if (vis) setLayerOverrides(before);
      }
    };
    return () => {
      exportRef.current = null;
    };
  }, [exportRef, rf, doc, meta]);

  const openNode = useCallback(
    (id: string) => {
      const n = byId.get(id);
      if (!n) return;
      const res = n.data.resource ? resourceFor(n) : null;
      if (!res || !res.href) {
        if (hasInfo(n.data)) setDetails(id);
        return;
      }
      const mode = n.data.openIn ?? "new-tab";
      if (mode === "details") setDetails(id);
      else if (mode === "modal") {
        // app pages refuse framing (X-Frame-Options), so internal files open in a tab
        if (res.external) setPreview({ res, title: n.data.title || res.title });
        else if (res.kind === "file") window.open(res.href, "_blank", "noopener,noreferrer");
        else router.push(res.href);
      } else window.open(res.href, "_blank", "noopener,noreferrer");
    },
    [byId, resourceFor, router],
  );

  // touch screens have no hover: the first tap shows the card, its button opens the resource
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none)");
    const sync = () => setTouch(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const tapNode = (id: string) => {
    const n = byId.get(id);
    if (!n || PARENT_KINDS.has(n.kind) || n.kind === "note" || !hasInfo(n.data)) return;
    setDetails(null);
    setHover((h) => (h?.id === id ? null : { id, left: 0, top: 0, sheet: true }));
  };

  const showHover = (e: React.MouseEvent, node: Node) => {
    const n = byId.get(node.id);
    if (!n || PARENT_KINDS.has(n.kind) || n.kind === "note" || !hasInfo(n.data)) return;
    const el = e.currentTarget as HTMLElement;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      const box = wrap.current?.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (!box) return;
      const W = 300;
      let left = r.right - box.left + 12;
      if (left + W > box.width - 8) left = r.left - box.left - W - 12;
      if (left < 8) left = Math.max(8, Math.min(box.width - W - 8, r.left - box.left));
      const top = Math.max(8, Math.min(box.height - 220, r.top - box.top - 8));
      setHover({ id: node.id, left, top });
    }, 280);
  };
  const hideHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHover(null), 160);
  };
  const keepHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  };

  const hoverNode = hover ? byId.get(hover.id) : undefined;
  const detailsNode = details ? byId.get(details) : undefined;

  return (
    <PlannerContext.Provider value={ctx}>
      <div
        ref={wrap}
        className={cn("relative h-full w-full overflow-hidden", className)}
        onKeyDown={(e) => {
          if (e.key !== "Escape" || (!details && !hover)) return;
          e.preventDefault();
          setDetails(null);
          setHover(null);
        }}
      >
        <ReactFlow<PlanFlowNode>
          nodes={renderNodes}
          edges={renderEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          className={cn("wp-flow wp-view", stage && "wp-stage")}
          nodesDraggable={false}
          nodesConnectable={false}
          connectionMode={ConnectionMode.Loose}
          elementsSelectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          zoomOnDoubleClick={false}
          // same as the editor: wheel/trackpad pans, pinch or ⌘/Ctrl+wheel zooms
          panOnScroll={!stage}
          minZoom={0.1}
          maxZoom={2.5}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, n) => (touch ? tapNode(n.id) : openNode(n.id))}
          onNodeMouseEnter={touch ? undefined : showHover}
          onNodeMouseLeave={touch ? undefined : hideHover}
          onMoveStart={() => setHover(null)}
          onPaneClick={() => {
            setDetails(null);
            if (touch) setHover(null);
          }}
        />
        {!stage && !compare && <ViewLayers doc={doc} overrides={layerOverrides} onChange={setLayerOverrides} onCompare={() => setCompare(defaultCompare(doc))} />}
        {!stage && compare && diff && <CompareBar doc={doc} value={compare} counts={diff.counts} onChange={setCompare} onClose={() => setCompare(null)} />}
        {doc.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded-xl border border-dashed border-line-2 bg-surface/80 px-5 py-4 text-sm text-muted">Este plan ainda está vazio.</p>
          </div>
        )}

        {hover && hoverNode && !details && (
          <div
            role="dialog"
            aria-label={hoverNode.data.title}
            className={cn(
              "absolute z-20 flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-pop animate-in",
              hover.sheet ? "inset-x-3 bottom-3 max-h-[60%] overflow-y-auto pr-12" : "w-[300px]",
            )}
            style={hover.sheet ? undefined : { left: hover.left, top: hover.top }}
            onMouseEnter={hover.sheet ? undefined : keepHover}
            onMouseLeave={hover.sheet ? undefined : hideHover}
          >
            {hover.sheet && (
              <Button variant="ghost" size="icon-sm" className="absolute right-2.5 top-2.5" aria-label="Fechar" onClick={() => setHover(null)}>
                <X />
              </Button>
            )}
            <NodeInfo node={hoverNode} res={resourceFor(hoverNode)} clamp onOpen={() => openNode(hoverNode.id)} onDetails={() => (setDetails(hoverNode.id), setHover(null))} />
          </div>
        )}

        {detailsNode && (
          <aside aria-label={`Detalhes: ${detailsNode.data.title}`} className="absolute bottom-4 right-4 top-4 z-20 flex w-[340px] max-w-[calc(100%-32px)] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-pop animate-in">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-caption font-semibold uppercase tracking-[.06em] text-muted">Detalhes</span>
              <Button variant="ghost" size="icon-sm" aria-label="Fechar detalhes" onClick={() => setDetails(null)} autoFocus>
                <X />
              </Button>
            </div>
            <div className="scrollbar-thin flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              <NodeInfo node={detailsNode} res={resourceFor(detailsNode)} onOpen={() => openNode(detailsNode.id)} inDetails />
            </div>
          </aside>
        )}

        {!stage && (
          <div className="wp-no-print absolute bottom-6 right-6 z-10 flex items-center gap-0.5 rounded-control border border-line bg-surface p-1">
            <ZoomControls compact />
          </div>
        )}
        {children}

        {preview && <PreviewModal res={preview.res} title={preview.title} onClose={() => setPreview(null)} />}
      </div>
    </PlannerContext.Provider>
  );
}

function NodeInfo({ node, res, clamp, onOpen, onDetails, inDetails }: { node: { id: string; data: NodeData }; res: ResolvedResource | null; clamp?: boolean; onOpen: () => void; onDetails?: () => void; inDetails?: boolean }) {
  const d = node.data;
  const st = statusMeta(d.status);
  const openLabel = res?.external ? "Abrir em nova aba" : "Abrir";
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("font-semibold", inDetails ? "text-title" : "text-lead")}>{d.title || res?.title || "Sem título"}</span>
        {st && (
          <Badge tone={st.tone}>
            <span className="size-1.5 rounded-full" style={{ background: st.dot }} aria-hidden />
            {st.label}
          </Badge>
        )}
      </div>
      {d.description && <p className={cn("whitespace-pre-wrap text-body leading-[19px] text-ink-2", clamp && "line-clamp-4")}>{d.description}</p>}
      {!!d.tags?.length && (
        <div className="flex flex-wrap gap-1.5">
          {d.tags.map((t) => (
            <TagChip key={t} name={t} />
          ))}
        </div>
      )}
      {res && (
        <div className="flex flex-col gap-2">
          {inDetails && (
            <div className="flex items-center gap-2.5 rounded-control border border-line p-2.5">
              <ResourceIcon resource={res} size={30} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body font-medium">{res.title}</span>
                <span className="truncate text-xs text-muted">{res.subtitle}</span>
              </span>
            </div>
          )}
          <div className="flex gap-2">
            {res.href ? (
              inDetails ? (
                <Button asChild variant="primary" size="md" className="flex-1 justify-center">
                  <a href={res.href} target={res.external ? "_blank" : undefined} rel={res.external ? "noopener noreferrer" : undefined}>
                    {openLabel} {res.external ? <ExternalLink /> : <ArrowUpRight />}
                  </a>
                </Button>
              ) : (
                <Button variant="primary" size="md" className="min-w-0 flex-1 justify-center" onClick={onOpen}>
                  <span className="truncate">{res.title}</span> {res.external ? <ExternalLink /> : <ArrowUpRight />}
                </Button>
              )
            ) : (
              <span className="text-xs text-muted">{res.subtitle} — você não tem acesso a este recurso.</span>
            )}
            {onDetails && (
              <Button variant="secondary" size="icon" className="size-9" aria-label="Ver detalhes" onClick={onDetails}>
                <PanelRight />
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function PreviewModal({ res, title, onClose }: { res: ResolvedResource; title: string; onClose: () => void }) {
  const [state, setState] = useState<"checking" | "ok" | "unknown" | "blocked">("checking");
  const [reason, setReason] = useState<string | null>(null);
  useEffect(() => {
    if (!res.href) return;
    const ctrl = new AbortController();
    fetch(`/api/embed-check?url=${encodeURIComponent(res.href)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ embeddable: boolean; reason?: string }>) : null))
      .then((j) => {
        if (!j) return setState("unknown");
        setState(j.embeddable ? "ok" : "blocked");
        setReason(j.reason ?? null);
      })
      .catch(() => !ctrl.signal.aborted && setState("unknown"));
    return () => ctrl.abort();
  }, [res]);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={title} description={res.subtitle} className="top-[4vh] flex h-[90vh] max-w-[1100px]">
        <div className="flex items-center gap-2 border-y border-line bg-surface-2 px-6 py-2">
          <ResourceIcon resource={res} size={20} />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{res.href}</span>
          <Button asChild size="sm" variant="secondary">
            <a href={res.href ?? "#"} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> Abrir em nova aba
            </a>
          </Button>
        </div>
        <div className="relative min-h-0 flex-1 bg-surface-2">
          {state === "checking" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted" aria-label="Carregando prévia" />
            </div>
          )}
          {state === "blocked" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-lead font-semibold">Este site não permite ser exibido aqui</p>
              <p className="max-w-sm text-body text-muted">{reason ?? "O site bloqueia a exibição dentro de outras páginas."} Você pode abri-lo em uma nova aba.</p>
              <Button asChild variant="primary">
                <a href={res.href ?? "#"} target="_blank" rel="noopener noreferrer">
                  Abrir em nova aba <ExternalLink />
                </a>
              </Button>
            </div>
          )}
          {(state === "ok" || state === "unknown") && res.href && (
            <>
              <iframe
                src={res.href}
                title={title}
                className="h-full w-full border-0 bg-white"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                referrerPolicy="no-referrer"
              />
              {state === "unknown" && (
                <p className="absolute inset-x-0 bottom-0 bg-surface/95 px-6 py-2 text-center text-xs text-muted">
                  Se o conteúdo não aparecer, o site pode bloquear a incorporação — use “Abrir em nova aba”.
                </p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
