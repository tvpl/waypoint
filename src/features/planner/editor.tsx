"use client";
import "@xyflow/react/dist/style.css";
import "./planner.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  MiniMap,
  ViewportPortal,
  reconnectEdge,
  ConnectionMode,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useNodesInitialized,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnNodeDrag,
  type Viewport,
  type OnConnectEnd,
} from "@xyflow/react";
import { CloudOff, MonitorSmartphone, MousePointerClick, Plus, RotateCcw, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import type { EdgeKind, NodeData, NodeKind, PlanDocument, PlanEdge, PlanLayer, PlanNode, PlanView, ResourceRef } from "@/domain/plan";
import {
  addLayer,
  applyView,
  assignLayer,
  BASE_LAYER_ID,
  layerIdOf,
  layersOf,
  moveLayer,
  removeLayer,
  removeView,
  saveView,
  showAllLayers,
  soloLayer,
  updateLayer,
} from "@/domain/layers";
import {
  contentSignature,
  edgeMarker,
  flowFingerprint,
  fromFlow,
  sameFingerprint,
  toFlowEdges,
  toFlowNodes,
  type PlanFlowEdge,
  type PlanFlowNode,
} from "@/domain/canvas-adapter";
import { Button } from "@/components/ui/button";
import { cn, domainOf, motionMs, newId, timeAgo } from "@/lib/utils";
import { PlannerContext, type PlannerContextValue } from "./context";
import { EditorContext, type EditorApi, type InkSettings, type InspectorTab, type LayersApi, type PlanMeta, type Tool } from "./editor-context";
import { buildInk, INK_SIZES, type Point } from "./ink-geometry";
import { InkCanvas } from "./ink-canvas";
import { nodeTypes } from "./nodes";
import { edgeTypes } from "./edges";
import { History } from "./history";
import {
  addNodes,
  alignNodes,
  bringToFront,
  copySubgraph,
  distributeNodes,
  duplicateNodes,
  findDropTarget,
  groupNodes,
  pasteClip,
  removeEdges,
  removeNodes,
  reparent,
  selectionRoots,
  sendToBack,
  setCollapsed,
  swapEdge,
  ungroupNodes,
  type Clip,
} from "./doc-ops";
import { createNode, PARENT_KINDS } from "./defaults";
import { helperLines, type Guides } from "./helper-lines";
import { autoLayout, type LayoutDirection } from "./auto-layout";
import { clearBackup, readBackup, useAutosave } from "./autosave";
import { Toolbox } from "./toolbox";
import { Inspector } from "./inspector";
import { BottomPill, SelectionBar } from "./canvas-controls";
import { CanvasContextMenu, type MenuTarget } from "./context-menu";
import { EditorTopbar, type ExportKind } from "./topbar";
import { ShareDialog, type RestoredDraft } from "./share-dialog";
import { ViewBody } from "./view-page";
import { readDragPayload, DND_MIME } from "./resource-picker";
import { DND_MIME as LIBRARY_MIME } from "@/features/links/dnd";
import { fallbackResource, refKey, type ResolvedResource } from "./resource-types";
import { exportImage, exportJson, exportPdf, openPrintWindow } from "./export";
import { publishPlanAction, updatePlanMetaAction } from "./actions";
import type { ViewerExport } from "./viewer";
import { CommentsPanel, CommentsToggle, useComments, useCommentsPanel } from "./comments";

/** Marks our own nodes on the system clipboard (set on copy, checked on paste). */
const NODES_MIME = "application/x-waypoint-nodes";

export type PlanEditorProps = {
  plan: { id: string; title: string; description: string | null; tags: string[]; visibility: string };
  workspaceName: string;
  initial: { document: PlanDocument; version: number; updatedAt: number };
  published: { version: number } | null;
  unpublished: boolean;
  /** Pre-resolved resources keyed by ref key. */
  resources: Record<string, ResolvedResource>;
  people: { name: string; email: string }[];
};

export function PlanEditor(props: PlanEditorProps) {
  return (
    <ReactFlowProvider>
      <EditorShell {...props} />
    </ReactFlowProvider>
  );
}

// clipboard shared across plans/tabs of this browser
const CLIP_KEY = "wp-planner-clipboard";
let memClip: { clip: Clip; count: number } | null = null;
function readClip(): Clip | null {
  if (memClip) return memClip.clip;
  try {
    const raw = localStorage.getItem(CLIP_KEY);
    if (!raw) return null;
    memClip = { clip: JSON.parse(raw) as Clip, count: 0 };
    return memClip.clip;
  } catch {
    return null;
  }
}

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

const isDefaultViewport = (v: Viewport) => v.x === 0 && v.y === 0 && v.zoom === 1;

// Where each person last left a plan's canvas (per device), so reopening continues there.
const viewportKey = (planId: string) => `wp-planner-viewport:${planId}`;
function readViewport(planId: string): Viewport | null {
  try {
    const v = JSON.parse(localStorage.getItem(viewportKey(planId)) ?? "null") as Viewport | null;
    return v && [v.x, v.y, v.zoom].every(Number.isFinite) && v.zoom > 0 ? v : null;
  } catch {
    return null;
  }
}
function writeViewport(planId: string, v: Viewport) {
  try {
    localStorage.setItem(viewportKey(planId), JSON.stringify({ x: Math.round(v.x), y: Math.round(v.y), zoom: Math.round(v.zoom * 1000) / 1000 }));
  } catch {
    /* storage unavailable */
  }
}

const normalizeForCanvas = (doc: PlanDocument): PlanDocument => ({
  ...fromFlow(toFlowNodes(doc), toFlowEdges(doc), doc.viewport),
  ...(doc.layers ? { layers: doc.layers } : {}),
  ...(doc.views ? { views: doc.views } : {}),
});

type LayerState = { layers?: PlanLayer[]; views?: PlanView[] };
const INK_KEY = "wp-planner-ink";

function EditorShell(props: PlanEditorProps) {
  const planId = props.plan.id;
  const rf = useReactFlow<PlanFlowNode, PlanFlowEdge>();
  const router = useRouter();
  // round-trip once so load-time normalization (auto handles…) doesn't count as an edit
  const initialDoc = useMemo(() => normalizeForCanvas(props.initial.document), [props.initial.document]);
  const initialSig = useMemo(() => contentSignature(initialDoc), [initialDoc]);

  const [nodes, setNodes] = useState<PlanFlowNode[]>(() => toFlowNodes(initialDoc));
  const [edges, setEdges] = useState<PlanFlowEdge[]>(() => toFlowEdges(initialDoc));
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const viewportRef = useRef<Viewport>(initialDoc.viewport);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Layers and saved views live beside the React Flow state (they are document-level).
  const [layerState, setLayerState] = useState<LayerState>(() => ({ layers: initialDoc.layers, views: initialDoc.views }));
  const layerStateRef = useRef(layerState);

  const docOf = useCallback((): PlanDocument => {
    const d = fromFlow(nodesRef.current, edgesRef.current, viewportRef.current);
    const { layers, views } = layerStateRef.current;
    return { ...d, ...(layers ? { layers } : {}), ...(views ? { views } : {}) };
  }, []);

  // ---------------------------------------------------------------- ui state
  const [meta, setMeta] = useState<PlanMeta>({ title: props.plan.title, description: props.plan.description, tags: props.plan.tags, visibility: props.plan.visibility });
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [tool, setToolState] = useState<Tool>("select");
  const [ink, setInkState] = useState<InkSettings>({ mode: "pen", color: undefined, size: INK_SIZES[1] });
  const inkRef = useRef(ink);
  inkRef.current = ink;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(INK_KEY) ?? "null") as Partial<InkSettings> | null;
      if (saved) setInkState((cur) => ({ ...cur, ...saved }));
    } catch {}
  }, []);
  const setInk = useCallback((patch: Partial<InkSettings>) => {
    setInkState((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(INK_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);
  const [activeLayer, setActiveLayer] = useState<string>(BASE_LAYER_ID);
  const activeLayerRef = useRef(activeLayer);
  activeLayerRef.current = activeLayer;
  const [connectKind, setConnectKind] = useState<EdgeKind>("flow");
  const [connectSource, setConnectSource] = useState<string | null>(null);
  const connectOnce = useRef(false);
  const [grid, setGrid] = useState(true);
  const [snap, setSnap] = useState(false);
  const [minimap, setMinimapState] = useState(false);
  useEffect(() => {
    try {
      setMinimapState(localStorage.getItem("wp-planner-minimap") === "1");
    } catch {}
  }, []);
  const setMinimap = useCallback((v: boolean) => {
    setMinimapState(v);
    try {
      localStorage.setItem("wp-planner-minimap", v ? "1" : "0");
    } catch {}
  }, []);
  const [guides, setGuides] = useState<Guides | null>(null);
  const altDown = useRef(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("content");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<MenuTarget>(null);
  const [dropping, setDropping] = useState(false);
  const [share, setShare] = useState<{ open: boolean; section: "share" | "history" }>({ open: false, section: "share" });
  const [published, setPublished] = useState<number | null>(props.published?.version ?? null);
  const [unpublished, setUnpublished] = useState(props.unpublished);
  const [publishing, setPublishing] = useState(false);
  const [resCache, setResCache] = useState<Record<string, ResolvedResource>>(props.resources);
  const [backup, setBackup] = useState<{ document: PlanDocument; at: number } | null>(null);
  const previewExport = useRef<ViewerExport | null>(null);
  const commentsPanel = useCommentsPanel();
  const comments = useComments({ planId, enabled: true, open: commentsPanel.open });
  const [previewFocus, setPreviewFocus] = useState<{ id: string; seq: number } | null>(null);
  // phones: a notice first; "Editar mesmo assim" shows the canvas with panels as overlays
  const [phoneEdit, setPhoneEdit] = useState(false);
  const [phonePanel, setPhonePanel] = useState<"tools" | "props" | null>(null);

  // ---------------------------------------------------------------- history + autosave
  const history = useRef(new History<PlanDocument>(initialDoc, { limit: 100, coalesceMs: 1200 }));
  const presentSig = useRef(initialSig);
  const notifiedSig = useRef(initialSig);
  const pendingKey = useRef<string | null>(null);
  const [hist, setHist] = useState({ canUndo: false, canRedo: false });
  const syncHist = () => setHist({ canUndo: history.current.canUndo, canRedo: history.current.canRedo });

  const autosave = useAutosave({ planId, initialVersion: props.initial.version, initialSignature: initialSig, getDocument: docOf });

  const lastPrint = useRef<unknown[] | null>(null);
  useEffect(() => {
    if (nodes.some((n) => n.dragging || n.resizing)) return;
    // selection / hover updates don't touch content: skip the full serialization
    const print = [...flowFingerprint(nodes, edges), layerState];
    if (sameFingerprint(lastPrint.current, print)) {
      pendingKey.current = null;
      return;
    }
    lastPrint.current = print;
    const doc = docOf();
    const sig = contentSignature(doc);
    if (sig !== presentSig.current) {
      presentSig.current = sig;
      history.current.push(doc, pendingKey.current);
      syncHist();
    }
    pendingKey.current = null;
    if (sig !== notifiedSig.current) {
      notifiedSig.current = sig;
      autosave.notifyChange();
      setUnpublished(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, layerState]);

  // local safety-net copy newer than the server draft?
  useEffect(() => {
    const b = readBackup(planId);
    if (!b) return;
    if (b.at > props.initial.updatedAt && contentSignature(b.document) !== initialSig) setBackup(b);
    else clearBackup(planId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- doc plumbing
  const selectedIds = () => ({
    nodes: new Set(nodesRef.current.filter((n) => n.selected).map((n) => n.id)),
    edges: new Set(edgesRef.current.filter((e) => e.selected).map((e) => e.id)),
  });

  const applyDoc = useCallback((doc: PlanDocument, sel?: { nodes?: Iterable<string>; edges?: Iterable<string> }) => {
    const cur = selectedIds();
    const n = sel?.nodes ? new Set(sel.nodes) : cur.nodes;
    const e = sel?.edges ? new Set(sel.edges) : sel?.nodes ? new Set<string>() : cur.edges;
    const ls: LayerState = { layers: doc.layers, views: doc.views };
    layerStateRef.current = ls;
    setLayerState(ls);
    setNodes(toFlowNodes(doc, { selected: n }));
    setEdges(toFlowEdges(doc, { selected: e }));
  }, []);

  /** Areas on hidden or locked layers don't take dropped elements. */
  const canHold = useCallback((n: PlanNode) => {
    const l = layersOf(layerStateRef.current).find((x) => x.id === layerIdOf(n));
    return !l || (l.visible !== false && !l.locked);
  }, []);

  /**
   * New elements go to the active layer; if it is hidden or locked, it is shown and unlocked
   * so what was just added can be seen and edited.
   */
  const placeInActive = useCallback((doc: PlanDocument, nodeIds: string[], edgeIds: string[] = []): PlanDocument => {
    const want = activeLayerRef.current;
    const id = layersOf(doc).some((l) => l.id === want) ? want : BASE_LAYER_ID;
    let next = assignLayer(doc, id, { nodes: nodeIds, edges: edgeIds });
    const layer = layersOf(next).find((l) => l.id === id);
    if (layer && (layer.visible === false || layer.locked)) {
      next = updateLayer(next, id, { visible: true, locked: false });
      toast(`A camada “${layer.name}” foi exibida e destravada para receber o novo elemento.`);
    }
    return next;
  }, []);

  const mutate = useCallback(
    (fn: (doc: PlanDocument) => PlanDocument, opts: { select?: string[]; key?: string } = {}) => {
      const cur = docOf();
      const next = fn(cur);
      if (next === cur) return;
      pendingKey.current = opts.key ?? null;
      applyDoc(next, opts.select ? { nodes: opts.select } : undefined);
    },
    [docOf, applyDoc],
  );

  const restoreSnapshot = useCallback(
    (doc: PlanDocument) => {
      presentSig.current = contentSignature(doc);
      const cur = selectedIds();
      const ids = new Set(doc.nodes.map((n) => n.id));
      applyDoc(doc, { nodes: [...cur.nodes].filter((id) => ids.has(id)), edges: [...cur.edges] });
      syncHist();
    },
    [applyDoc],
  );

  const undo = useCallback(() => {
    const d = history.current.undo();
    if (d) restoreSnapshot(d);
  }, [restoreSnapshot]);
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redo = useCallback(() => {
    const d = history.current.redo();
    if (d) restoreSnapshot(d);
  }, [restoreSnapshot]);

  // ---------------------------------------------------------------- resources
  const cacheResource = useCallback((ref: ResourceRef, res: ResolvedResource) => setResCache((c) => ({ ...c, [refKey(ref)]: res })), []);
  const resourceFor = useCallback(
    (node: { id: string; data: Pick<NodeData, "resource"> }) => {
      const r = node.data.resource;
      if (!r) return null;
      return resCache[refKey(r)] ?? fallbackResource(r);
    },
    [resCache],
  );

  // resolve refs we don't know yet (paste from another plan, undo…)
  const missingRefs = useMemo(() => {
    const out = new Map<string, ResourceRef>();
    for (const n of nodes) {
      const r = n.data.resource;
      if (!r || r.type === "url" || r.type === "page") continue;
      const k = refKey(r);
      if (!resCache[k]) out.set(k, r);
    }
    return out;
  }, [nodes, resCache]);
  const missingKey = [...missingRefs.keys()].sort().join("|");
  useEffect(() => {
    if (!missingKey) return;
    const refs = [...missingRefs.values()];
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/resources/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, refs }) });
        if (res.ok) {
          const body = (await res.json()) as { resources: Record<string, ResolvedResource> };
          setResCache((c) => ({ ...c, ...body.resources }));
        }
      } catch {}
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey, planId]);

  // ---------------------------------------------------------------- operations
  const selectedNodes = useMemo(() => nodes.filter((n) => n.selected), [nodes]);
  const selectedEdges = useMemo(() => edges.filter((e) => e.selected), [edges]);

  const select = useCallback((nodeIds: string[], edgeIds: string[] = []) => {
    const ns = new Set(nodeIds);
    const es = new Set(edgeIds);
    setNodes((list) => list.map((n) => (!!n.selected === ns.has(n.id) ? n : { ...n, selected: ns.has(n.id) })));
    setEdges((list) => list.map((e) => (!!e.selected === es.has(e.id) ? e : { ...e, selected: es.has(e.id) })));
  }, []);

  const viewportCenter = useCallback(() => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    const jitter = (nodesRef.current.length % 6) * 16;
    const p = rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    return { x: p.x + jitter, y: p.y + jitter };
  }, [rf]);

  const insert = useCallback(
    (node: ReturnType<typeof createNode>) => {
      let doc = placeInActive(addNodes(docOf(), [node]), [node.id]);
      if (!PARENT_KINDS.has(node.kind)) {
        const target = findDropTarget(doc, node.id, canHold);
        if (target) doc = reparent(doc, node.id, target);
      }
      pendingKey.current = null;
      applyDoc(doc, { nodes: [node.id] });
    },
    [docOf, applyDoc, placeInActive, canHold],
  );

  const addNode = useCallback(
    (kind: NodeKind, opts: { at?: { x: number; y: number }; data?: Partial<NodeData> } = {}) => {
      const node = createNode(kind, opts.at ?? viewportCenter(), opts.data, { center: true });
      if (snap) {
        node.x = Math.round(node.x / 20) * 20;
        node.y = Math.round(node.y / 20) * 20;
      }
      insert(node);
      if (kind === "link") setInspectorTab("action");
      else if (kind === "image") setInspectorTab("content");
      else {
        setInspectorTab("content");
        setTimeout(() => setEditingId(node.id), 30);
      }
    },
    [insert, viewportCenter, snap],
  );
  const addNodeRef = useRef(addNode);
  addNodeRef.current = addNode;

  const addResourceNode = useCallback(
    (ref: ResourceRef, resource: ResolvedResource, at?: { x: number; y: number }) => {
      cacheResource(ref, resource);
      const node = createNode("link", at ?? viewportCenter(), { title: "", resource: ref, openIn: "new-tab" }, { center: true });
      insert(node);
      setInspectorTab("action");
    },
    [cacheResource, insert, viewportCenter],
  );

  /** A link card for an external URL; title, description and cover arrive from the page shortly after. */
  const addUrlNodes = useCallback(
    (urls: string[], at?: { x: number; y: number }) => {
      const base = at ?? viewportCenter();
      const ids: string[] = [];
      let doc = docOf();
      urls.slice(0, 12).forEach((raw, i) => {
        const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        const ref: ResourceRef = { type: "url", url };
        const node = createNode("link", { x: base.x, y: base.y + i * 96 }, { title: "", resource: ref, openIn: "new-tab" }, { center: true });
        ids.push(node.id);
        doc = addNodes(doc, [node]);
        void fetch(`/api/metadata?url=${encodeURIComponent(url)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((m: { title?: string; description?: string; image?: string; favicon?: string; error?: string } | null) => {
            if (!m || m.error) return;
            const domain = domainOf(url);
            cacheResource(ref, { kind: "url", title: m.title || domain, subtitle: domain, href: url, external: true, favicon: m.favicon ?? null, description: m.description ?? null, image: m.image ?? null });
            updateNodeData(node.id, { title: m.title?.slice(0, 300) ?? "", description: m.description?.slice(0, 600), image: m.image && m.image.length <= 2048 ? m.image : undefined }, `meta:${node.id}`);
            // Room for the cover when the page has one.
            if (m.image && urls.length === 1) updateNodeSize(node.id, { width: 280, height: 230 });
          })
          .catch(() => {});
      });
      pendingKey.current = null;
      applyDoc(placeInActive(doc, ids), { nodes: ids });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [docOf, applyDoc, viewportCenter, cacheResource],
  );

  /** Cards for library links (resolved like any other ref on the next render). */
  const addFavoriteNodes = useCallback(
    (favoriteIds: string[], at?: { x: number; y: number }) => {
      const base = at ?? viewportCenter();
      let doc = docOf();
      const ids: string[] = [];
      favoriteIds.slice(0, 24).forEach((id, i) => {
        const node = createNode("link", { x: base.x + Math.floor(i / 6) * 270, y: base.y + (i % 6) * 88 }, { title: "", resource: { type: "favorite", id }, openIn: "new-tab" }, { center: true });
        ids.push(node.id);
        doc = addNodes(doc, [node]);
      });
      pendingKey.current = null;
      applyDoc(placeInActive(doc, ids), { nodes: ids });
    },
    [docOf, applyDoc, viewportCenter, placeInActive],
  );

  const uploadImage = useCallback(
    async (file: File, at?: { x: number; y: number }) => {
      const fd = new FormData();
      fd.set("file", file);
      const id = toast.loading("Enviando imagem…");
      try {
        const res = await fetch("/api/assets", { method: "POST", body: fd });
        const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !body.url) throw new Error(body.error ?? "Falha no envio.");
        addNodeRef.current("image", { at, data: { image: body.url, title: file.name.replace(/\.[a-z0-9]+$/i, "") } });
        toast.success("Imagem adicionada", { id });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha no envio.", { id });
      }
    },
    [],
  );

  const updateNodeData = useCallback((id: string, patch: Partial<NodeData>, key?: string) => {
    pendingKey.current = key ?? null;
    setNodes((list) => list.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  }, []);

  const updateNodeSize = useCallback((id: string, size: { width?: number; height?: number }) => {
    pendingKey.current = `size:${id}`;
    setNodes((list) => list.map((n) => (n.id === id ? { ...n, width: size.width ?? n.width, height: size.height ?? n.height } : n)));
  }, []);

  const updateEdge = useCallback((id: string, patch: { label?: string; description?: string; kind?: EdgeKind }, key?: string) => {
    pendingKey.current = key ?? null;
    setEdges((list) =>
      list.map((e) => {
        if (e.id !== id) return e;
        const data = { ...(e.data ?? { kind: "flow" as const }), ...patch };
        return { ...e, data, markerEnd: edgeMarker(data.kind) };
      }),
    );
  }, []);

  const selNodeIds = () => nodesRef.current.filter((n) => n.selected).map((n) => n.id);
  const selEdgeIds = () => edgesRef.current.filter((e) => e.selected).map((e) => e.id);

  const remove = useCallback(() => {
    const ns = selNodeIds();
    const es = selEdgeIds();
    if (!ns.length && !es.length) return;
    mutate((d) => removeEdges(removeNodes(d, ns), es), { select: [] });
  }, [mutate]);

  const duplicate = useCallback(() => {
    const ids = selNodeIds();
    if (!ids.length) return;
    let created: string[] = [];
    mutate((d) => {
      const r = duplicateNodes(d, ids);
      created = r.ids;
      return r.doc;
    });
    if (created.length) select(created);
  }, [mutate, select]);

  const copy = useCallback(() => {
    const clip = copySubgraph(docOf(), selNodeIds());
    if (!clip) return;
    memClip = { clip, count: 0 };
    try {
      localStorage.setItem(CLIP_KEY, JSON.stringify(clip));
    } catch {}
  }, [docOf]);

  const paste = useCallback(
    (at?: { x: number; y: number }) => {
      const clip = readClip();
      if (!clip || !memClip) return;
      memClip.count += 1;
      const off = 24 * memClip.count;
      let created: string[] = [];
      mutate((d) => {
        const r = pasteClip(d, clip, at ? { at } : { offset: { x: off, y: off } });
        created = r.ids;
        return placeInActive(r.doc, r.ids);
      });
      if (created.length) select(created);
    },
    [mutate, select, placeInActive],
  );

  const group = useCallback(() => {
    const ids = selNodeIds();
    if (!ids.length) return;
    let gid: string | null = null;
    mutate((d) => {
      const r = groupNodes(d, ids);
      if (!r) return d;
      gid = r.id;
      return r.doc;
    });
    if (gid) select([gid]);
  }, [mutate, select]);

  const ungroup = useCallback(() => {
    const ids = selNodeIds();
    let lifted: string[] = [];
    mutate((d) => {
      const r = ungroupNodes(d, ids);
      lifted = r.ids;
      return r.doc;
    });
    if (lifted.length) select(lifted);
  }, [mutate, select]);

  const autoArrange = useCallback(
    (direction: LayoutDirection, opts: { all?: boolean } = {}) => {
      const sel = opts.all ? [] : selNodeIds();
      const scoped = sel.length > 0;
      let changed = false;
      mutate((d) => {
        const next = autoLayout(d, { direction, selection: scoped ? sel : undefined });
        changed = next !== d;
        return next;
      });
      if (!changed) {
        toast(scoped ? "Selecione dois ou mais elementos, ou um container com itens." : "Nada para organizar ainda.");
        return;
      }
      // let React Flow take the new positions before animating the viewport
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          void rf.fitView({ nodes: scoped ? sel.map((id) => ({ id })) : undefined, padding: scoped ? 0.35 : 0.15, maxZoom: 1, duration: motionMs(600) });
        }),
      );
      toast.success(scoped ? "Seleção organizada" : "Plan organizado", {
        description: direction === "TB" ? "Fluxo vertical" : "Fluxo horizontal",
        action: { label: "Desfazer", onClick: () => undoRef.current() },
      });
    },
    [mutate, rf],
  );

  const startEditing = useCallback(
    (id: string) => {
      select([id]);
      setEditingId(id);
    },
    [select],
  );

  const setTool = useCallback((t: Tool) => {
    setToolState(t);
    if (t !== "connect") {
      setConnectSource(null);
      connectOnce.current = false;
    }
  }, []);

  const startConnectFrom = useCallback((id: string) => {
    setToolState("connect");
    setConnectSource(id);
    connectOnce.current = true;
  }, []);

  const createEdge = useCallback(
    (source: string, target: string, sourceHandle?: string | null, targetHandle?: string | null) => {
      if (source === target) return;
      if (!sourceHandle || !targetHandle) {
        const a = rf.getInternalNode(source);
        const b = rf.getInternalNode(target);
        if (a && b) {
          const ac = { x: a.internals.positionAbsolute.x + (a.measured.width ?? 0) / 2, y: a.internals.positionAbsolute.y + (a.measured.height ?? 0) / 2 };
          const bc = { x: b.internals.positionAbsolute.x + (b.measured.width ?? 0) / 2, y: b.internals.positionAbsolute.y + (b.measured.height ?? 0) / 2 };
          const dx = bc.x - ac.x;
          const dy = bc.y - ac.y;
          if (Math.abs(dx) > Math.abs(dy)) {
            sourceHandle = dx > 0 ? "r" : "l";
            targetHandle = dx > 0 ? "l" : "r";
          } else {
            sourceHandle = dy > 0 ? "b" : "t";
            targetHandle = dy > 0 ? "t" : "b";
          }
        }
      }
      // Through the document: the connection goes to the active layer (it can link elements of any layer).
      const edge: PlanEdge = { id: newId(), source, target, sourceHandle: sourceHandle ?? null, targetHandle: targetHandle ?? null, kind: connectKind };
      const base = docOf();
      pendingKey.current = null;
      applyDoc(placeInActive({ ...base, edges: [...base.edges, edge] }, [], [edge.id]), { nodes: [], edges: [edge.id] });
    },
    [rf, connectKind, docOf, applyDoc, placeInActive],
  );

  // ---------------------------------------------------------------- drawing
  const addInk = useCallback(
    (points: Point[], zoom: number) => {
      const s = inkRef.current;
      const built = buildInk(points, { size: s.size, mode: s.mode, zoom });
      if (!built) return;
      const node: PlanNode = {
        id: newId(),
        kind: "ink",
        x: built.x,
        y: built.y,
        width: built.width,
        height: built.height,
        data: { title: "", ink: built.ink, ...(s.color ? { color: s.color } : {}) },
      };
      pendingKey.current = null;
      applyDoc(placeInActive(addNodes(docOf(), [node]), [node.id]), { nodes: [] });
    },
    [docOf, applyDoc, placeInActive],
  );

  const removeInk = useCallback(
    (ids: string[]) => {
      const set = new Set(ids);
      mutate((d) => {
        const drop = d.nodes.filter((n) => set.has(n.id) && n.kind === "ink").map((n) => n.id);
        return drop.length ? removeNodes(d, drop) : d;
      });
    },
    [mutate],
  );

  // ---------------------------------------------------------------- layers
  const layersApi: LayersApi = useMemo(() => {
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
      update: (id, patch) => mutate((d) => updateLayer(d, id, patch), { key: patch.name !== undefined ? `layer-name:${id}` : undefined }),
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
      counts,
    };
  }, [layerState, nodes, edges, activeLayer, mutate, select]);

  const focusNode = useCallback(
    (id: string) => {
      select([id]);
      void rf.fitView({ nodes: [{ id }], padding: 0.8, maxZoom: 1.2, duration: motionMs(300) });
    },
    [rf, select],
  );

  const saveMeta = useCallback(
    async (patch: Partial<Pick<PlanMeta, "title" | "description" | "tags">>) => {
      setMeta((m) => ({ ...m, ...patch }));
      const r = await updatePlanMetaAction(planId, patch);
      if (!r.ok) toast.error(r.error);
      else if (patch.title !== undefined || patch.description !== undefined) setUnpublished(true);
    },
    [planId],
  );

  const openShare = useCallback((section: "share" | "history" = "share") => setShare({ open: true, section }), []);

  const api: EditorApi = {
    planId,
    nodes,
    edges,
    selectedNodes,
    selectedEdges,
    meta,
    saveMeta: (p) => void saveMeta(p),
    addNode,
    addResourceNode,
    updateNodeData,
    updateNodeSize,
    updateEdge,
    mutate,
    remove,
    duplicate,
    copy,
    paste,
    hasClipboard: () => !!readClip(),
    group,
    ungroup,
    align: (m) => mutate((d) => alignNodes(d, selNodeIds(), m)),
    distribute: (a) => mutate((d) => distributeNodes(d, selNodeIds(), a)),
    bringToFront: () => mutate((d) => bringToFront(d, selNodeIds())),
    sendToBack: () => mutate((d) => sendToBack(d, selNodeIds())),
    swapEdge: (id) => mutate((d) => swapEdge(d, id)),
    autoArrange,
    select,
    selectAll: () => select(nodesRef.current.filter((n) => !n.hidden && n.selectable !== false).map((n) => n.id)),
    focusNode,
    toggleCollapsed: (id) => mutate((d) => setCollapsed(d, id, !d.nodes.find((n) => n.id === id)?.data.collapsed)),
    startEditing,
    startConnectFrom,
    tool,
    setTool,
    ink,
    setInk,
    addInk,
    removeInk,
    layers: layersApi,
    connectKind,
    setConnectKind,
    grid,
    setGrid,
    snap,
    setSnap,
    minimap,
    setMinimap,
    inspectorTab,
    setInspectorTab,
    resourceFor,
    cacheResource,
    openShare,
    openComments: (id) => commentsPanel.openPanel(id ?? null),
  };
  const apiRef = useRef(api);
  apiRef.current = api;

  // ---------------------------------------------------------------- node renderer context
  // stable callbacks so dragging doesn't re-render every node through context
  const childCount = useCallback((id: string) => nodesRef.current.filter((n) => n.parentId === id).length, []);
  const byNodeComments = comments.counts.byNode;
  const commentCount = useCallback((id: string) => byNodeComments[id] ?? 0, [byNodeComments]);
  const openPanel = commentsPanel.openPanel;
  const openNodeComments = useCallback(
    (id: string) => {
      if (mode === "edit") select([id]);
      openPanel(id);
    },
    [mode, select, openPanel],
  );
  const singleSelectedId = selectedNodes.length === 1 ? selectedNodes[0].id : null;
  const plannerCtx: PlannerContextValue = useMemo(
    () => ({
      mode: "edit",
      resourceFor,
      editingId,
      setEditingId,
      commitTitle: (id, title) => updateNodeData(id, { title }),
      commitEdgeLabel: (id, label) => updateEdge(id, { label: label.trim() || undefined }),
      toggleCollapsed: (id) => apiRef.current.toggleCollapsed(id),
      childCount,
      singleSelectedId,
      highlightId: null,
      dropTargetId: dropTarget,
      connectSourceId: connectSource,
      isInteractive: () => false,
      commentCount,
      openNodeComments,
    }),
    [resourceFor, editingId, updateNodeData, updateEdge, childCount, singleSelectedId, dropTarget, connectSource, commentCount, openNodeComments],
  );

  const commentNodes = useMemo(
    () => (commentsPanel.open ? nodes.map((n) => ({ id: n.id, kind: n.type ?? "block", title: n.data.title || (n.data.resource ? (resourceFor(n)?.title ?? "") : "") })) : []),
    [commentsPanel.open, nodes, resourceFor],
  );
  const commentsAside = commentsPanel.open ? (
    <CommentsPanel
      store={comments}
      target={commentsPanel}
      onClose={commentsPanel.close}
      nodes={commentNodes}
      onSelectNode={(id) => (mode === "edit" ? focusNode(id) : setPreviewFocus((f) => ({ id, seq: (f?.seq ?? 0) + 1 })))}
    />
  ) : null;

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    if (mode !== "edit") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target)) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('[role="dialog"], [role="menu"], [role="listbox"], [data-planner-panel]')) return;
      const a = apiRef.current;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "k") return; // global palette
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (mod && k === "z" && !e.shiftKey) return run(undo);
      if ((mod && k === "y") || (mod && k === "z" && e.shiftKey)) return run(redo);
      // ⌘C / ⌘V go through the copy/paste events below (they need the system clipboard).
      if (mod && k === "d") return run(a.duplicate);
      if (mod && k === "a") return run(a.selectAll);
      if (mod && k === "g" && e.shiftKey) return run(a.ungroup);
      if (mod && k === "g") return run(a.group);
      if (mod && k === "l") return a.selectedNodes.length === 1 ? run(() => a.setInspectorTab("action")) : undefined;
      // ⇧L vertical, ⌥⇧L horizontal (e.code: ⌥ changes e.key on macOS)
      if (!mod && e.shiftKey && e.code === "KeyL") return run(() => a.autoArrange(e.altKey ? "LR" : "TB"));
      if (mod || e.altKey) return;
      if (k === "delete" || k === "backspace") return run(a.remove);
      if (k === "escape") {
        setEditingId(null);
        if (a.tool === "connect" || a.tool === "draw" || a.tool === "erase") return run(() => a.setTool("select"));
        return run(() => a.select([]));
      }
      if (k === "enter" && a.selectedNodes.length === 1) return run(() => a.startEditing(a.selectedNodes[0].id));
      if (k === "v") return run(() => a.setTool("select"));
      if (k === "h") return run(() => a.setTool("hand"));
      if (k === "p") return run(() => a.setTool(a.tool === "draw" ? "select" : "draw"));
      if (k === "e") return run(() => a.setTool(a.tool === "erase" ? "select" : "erase"));
      if (k === "c") return run(() => (a.selectedNodes.length === 1 ? a.startConnectFrom(a.selectedNodes[0].id) : a.setTool("connect")));
      if (k === "+" || k === "=") return run(() => rf.zoomIn({ duration: motionMs(150) }));
      if (k === "-" || k === "_") return run(() => rf.zoomOut({ duration: motionMs(150) }));
      if (k === "0") return run(() => rf.zoomTo(1, { duration: motionMs(150) }));
      if (k === "1") return run(() => rf.fitView({ padding: 0.15, duration: motionMs(250) }));
      if (k === "m") return run(() => a.setMinimap(!a.minimap));
      if (k === "]") return run(a.bringToFront);
      if (k === "[") return run(a.sendToBack);
      if (k.startsWith("arrow")) pendingKey.current = "nudge";
    };
    const onAlt = (e: KeyboardEvent) => (altDown.current = e.altKey);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keydown", onAlt, true);
    window.addEventListener("keyup", onAlt, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onAlt, true);
      window.removeEventListener("keyup", onAlt, true);
    };
  }, [mode, undo, redo, rf]);

  // ---------------------------------------------------------------- clipboard
  useEffect(() => {
    if (mode !== "edit") return;
    const outside = (e: Event) => isTyping(e.target) || !!(e.target as HTMLElement | null)?.closest?.('[role="dialog"], [data-planner-panel]');
    const onCopy = (e: ClipboardEvent) => {
      if (outside(e) || !apiRef.current.selectedNodes.length || window.getSelection()?.toString()) return;
      apiRef.current.copy();
      // Mark the system clipboard so a later paste knows these nodes are the newest thing there.
      e.clipboardData?.setData(NODES_MIME, "1");
      e.clipboardData?.setData("text/plain", `${apiRef.current.selectedNodes.map((n) => n.data.title).filter(Boolean).join("\n")}`);
      e.preventDefault();
    };
    // Pasted content lands under the pointer when it's over the canvas (else the viewport center).
    let pointer: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => (pointer = { x: e.clientX, y: e.clientY });
    const pasteAt = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!pointer || !r || pointer.x < r.left || pointer.x > r.right || pointer.y < r.top || pointer.y > r.bottom) return undefined;
      return rf.screenToFlowPosition(pointer);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (outside(e)) return;
      const cd = e.clipboardData;
      e.preventDefault();
      if (cd?.types.includes(NODES_MIME)) return apiRef.current.paste();
      const at = pasteAt();
      const image = Array.from(cd?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (image) return void uploadImage(image, at);
      const text = cd?.getData("text/plain")?.trim() ?? "";
      const urls = text.split(/\s+/).filter((t) => /^https?:\/\/\S+$/i.test(t));
      if (urls.length && urls.join(" ").length >= text.replace(/\s+/g, " ").length - urls.length) return addUrlNodes(urls, at);
      if (text) {
        // Plain text becomes a note (first line as the title).
        const [first, ...rest] = text.split("\n");
        return addNodeRef.current("note", { at, data: { title: first.slice(0, 120), description: rest.join("\n").trim().slice(0, 4000) } });
      }
      apiRef.current.paste();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("copy", onCopy);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("pointermove", onMove);
    };
  }, [mode, addUrlNodes, uploadImage, rf]);

  // ---------------------------------------------------------------- flow handlers
  const onNodesChange = useCallback(
    (changes: NodeChange<PlanFlowNode>[]) => {
      // removal goes through our own delete (keeps descendants/edges consistent)
      const filtered = changes.filter((c) => c.type !== "remove");
      const ch = filtered.length === 1 ? filtered[0] : null;
      // Alignment guides while dragging one node (hold Alt to move freely).
      if (ch?.type === "position" && ch.dragging && ch.position && !altDown.current) {
        const node = nodesRef.current.find((n) => n.id === ch.id);
        if (node) {
          const size = (n: PlanFlowNode) => ({ width: n.measured?.width ?? n.width ?? 0, height: n.measured?.height ?? n.height ?? 0 });
          const others = nodesRef.current
            .filter((n) => n.id !== node.id && (n.parentId ?? null) === (node.parentId ?? null) && !n.hidden)
            .map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, ...size(n) }));
          const g = helperLines({ id: node.id, x: ch.position.x, y: ch.position.y, ...size(node) }, others, 6 / rf.getViewport().zoom);
          if (g.x != null) ch.position.x = g.x;
          if (g.y != null) ch.position.y = g.y;
          const parent = node.parentId ? rf.getInternalNode(node.parentId)?.internals.positionAbsolute : null;
          const ox = parent?.x ?? 0;
          const oy = parent?.y ?? 0;
          setGuides({
            vertical: g.vertical && { x: g.vertical.x + ox, y1: g.vertical.y1 + oy, y2: g.vertical.y2 + oy },
            horizontal: g.horizontal && { y: g.horizontal.y + oy, x1: g.horizontal.x1 + ox, x2: g.horizontal.x2 + ox },
          });
        }
      } else if (ch?.type === "position" && !ch.dragging) setGuides(null);
      if (filtered.length) setNodes((list) => applyNodeChanges(filtered, list));
    },
    [rf],
  );
  const onEdgesChange = useCallback((changes: EdgeChange<PlanFlowEdge>[]) => {
    const filtered = changes.filter((c) => c.type !== "remove");
    if (filtered.length) setEdges((list) => applyEdgeChanges(filtered, list));
  }, []);

  const onConnect = useCallback((c: Connection) => createEdge(c.source, c.target, c.sourceHandle, c.targetHandle), [createEdge]);
  // Dragging an edge's end to another node moves the connection (same id, kind and label).
  const onReconnect = useCallback((old: PlanFlowEdge, c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    pendingKey.current = null;
    setEdges((list) => reconnectEdge(old, c, list, { shouldReplaceId: false }));
  }, []);

  // Dropping a connection anywhere on a node (not only on a handle) connects to it.
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      if (state.isValid || !state.fromNode) return;
      const pt = "changedTouches" in event ? event.changedTouches[0] : event;
      const el = document.elementFromPoint(pt.clientX, pt.clientY)?.closest<HTMLElement>(".react-flow__node");
      const target = el?.dataset.id;
      if (target && target !== state.fromNode.id) createEdge(state.fromNode.id, target, null, null);
    },
    [createEdge],
  );

  const onNodeDrag: OnNodeDrag<PlanFlowNode> = useCallback(
    (_e, node, dragged) => {
      if (dragged.length > 1 && !dragged.every((d) => d.parentId === node.parentId)) return setDropTarget(null);
      const pos = new Map(dragged.map((d) => [d.id, d.position]));
      const doc = fromFlow(
        nodesRef.current.map((n) => (pos.has(n.id) ? { ...n, position: pos.get(n.id)! } : n)),
        [],
        viewportRef.current,
      );
      const target = findDropTarget(doc, node.id, canHold) ?? null;
      setDropTarget(target !== (node.parentId ?? null) ? target : null);
    },
    [canHold],
  );

  const onNodeDragStop: OnNodeDrag<PlanFlowNode> = useCallback((_e, _node, dragged) => {
    setDropTarget(null);
    setGuides(null);
    const ids = dragged.map((d) => d.id);
    // functional update: runs after React Flow's final position change in the same batch
    setNodes((prev) => {
      const base: PlanDocument = { ...fromFlow(prev, [], viewportRef.current), ...(layerStateRef.current.layers ? { layers: layerStateRef.current.layers } : {}) };
      let doc = base;
      for (const id of selectionRoots(base, ids)) {
        const target = findDropTarget(doc, id, canHold);
        const cur = doc.nodes.find((n) => n.id === id)?.parentId;
        if (target !== cur) doc = reparent(doc, id, target);
      }
      if (doc === base) return prev;
      return toFlowNodes(doc, { selected: new Set(prev.filter((n) => n.selected).map((n) => n.id)) });
    });
  }, [canHold]);

  const onNodeClick = useCallback(
    (_e: React.MouseEvent, node: PlanFlowNode) => {
      if (tool !== "connect") return;
      if (!connectSource) return setConnectSource(node.id);
      if (connectSource === node.id) return setConnectSource(null);
      createEdge(connectSource, node.id);
      setConnectSource(null);
      if (connectOnce.current) setTool("select");
    },
    [tool, connectSource, createEdge, setTool],
  );

  const onDragOver = (e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    if (types.includes(DND_MIME) || types.includes(LIBRARY_MIME) || types.includes("Files") || types.includes("text/uri-list")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      if (!dropping) setDropping(true);
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    setDropping(false);
    const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const p = readDragPayload(e);
    if (p) {
      e.preventDefault();
      if (p.type === "kind") addNode(p.kind, { at });
      else addResourceNode(p.ref, p.resource, at);
      return;
    }
    // Links dragged from the library (another tab or window).
    try {
      const lib = JSON.parse(e.dataTransfer.getData(LIBRARY_MIME) || "null") as { kind?: string; ids?: string[] } | null;
      if (lib?.kind === "links" && lib.ids?.length) {
        e.preventDefault();
        return addFavoriteNodes(lib.ids, at);
      }
    } catch {}
    const file = Array.from(e.dataTransfer.files ?? []).find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      return uploadImage(file, at);
    }
    // A link dragged from the browser's address bar or another page.
    const urls = (e.dataTransfer.getData("text/uri-list") || "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && /^https?:/i.test(l));
    if (urls.length) {
      e.preventDefault();
      addUrlNodes(urls, at);
    }
  };

  // ---------------------------------------------------------------- publish / export / conflict
  const publish = async () => {
    setPublishing(true);
    try {
      const ok = await autosave.flush();
      if (!ok) {
        toast.error("Salve o rascunho antes de publicar (verifique a conexão ou o conflito).");
        return;
      }
      const r = await publishPlanAction(planId);
      if (!r.ok) return void toast.error(r.error);
      setPublished(r.version);
      setUnpublished(false);
      toast.success(`Publicado v${r.version}`, { action: { label: "Compartilhar", onClick: () => openShare("share") } });
      router.refresh();
    } finally {
      setPublishing(false);
    }
  };

  const onExport = async (k: ExportKind) => {
    if (mode === "preview") return void previewExport.current?.(k);
    const title = meta.title || "plan";
    if (k === "json") return exportJson({ title, description: meta.description, tags: meta.tags }, docOf());
    const visible = rf.getNodes().filter((n) => !n.hidden);
    if (!visible.length) return void toast.error("O plan está vazio.");
    const printWin = k === "pdf" ? openPrintWindow(title) : null;
    if (k === "pdf" && !printWin) return void toast.error("Permita pop-ups para exportar em PDF.");
    const prevSel = selNodeIds();
    select([]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const bounds = rf.getNodesBounds(visible);
      if (k === "pdf") await exportPdf(wrapRef.current!, bounds, title, printWin);
      else await exportImage(wrapRef.current!, bounds, k, title);
    } catch {
      toast.error("Não foi possível exportar. Tente novamente.");
    } finally {
      select(prevSel);
    }
  };

  const reloadFromServer = () => {
    const c = autosave.conflict;
    if (!c) return;
    const doc = normalizeForCanvas(c.document);
    autosave.adopt(doc, c.version);
    notifiedSig.current = contentSignature(doc);
    applyDoc(doc, { nodes: [] });
  };

  const onRestored = (r: RestoredDraft) => {
    const doc = normalizeForCanvas(r.document);
    autosave.adopt(doc, r.version);
    notifiedSig.current = contentSignature(doc);
    applyDoc(doc, { nodes: [] });
    setMeta((m) => ({ ...m, title: r.title, description: r.description }));
    setUnpublished(true);
  };

  // ---------------------------------------------------------------- preview data
  const previewData = useMemo(() => {
    if (mode !== "preview") return null;
    const doc = docOf();
    const byNode: Record<string, ResolvedResource> = {};
    for (const n of doc.nodes) if (n.data.resource) byNode[n.id] = resCache[refKey(n.data.resource)] ?? fallbackResource(n.data.resource);
    return { doc, byNode };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const fitOnInit = initialDoc.nodes.length > 0 && isDefaultViewport(initialDoc.viewport);
  // Restore this person's last viewport. With fitOnInit React Flow fits once the nodes are
  // measured, so the saved viewport is applied after that instead.
  const nodesReady = useNodesInitialized();
  const restoredViewport = useRef(false);
  const restoreViewport = () => {
    if (restoredViewport.current) return;
    restoredViewport.current = true;
    const v = readViewport(planId);
    if (!v) return;
    viewportRef.current = v;
    void rf.setViewport(v);
  };
  useEffect(() => {
    if (!fitOnInit || !nodesReady) return;
    const raf = requestAnimationFrame(restoreViewport);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitOnInit, nodesReady]);

  return (
    <EditorContext.Provider value={api}>
      <PlannerContext.Provider value={plannerCtx}>
        <div className="flex h-app flex-col overflow-hidden bg-bg text-ink">
          <EditorTopbar
            planId={planId}
            workspaceName={props.workspaceName}
            title={meta.title}
            onRename={(title) => void saveMeta({ title })}
            published={published}
            unpublished={unpublished}
            status={autosave.status}
            saveError={autosave.error}
            mode={mode}
            onMode={(m) => {
              setEditingId(null);
              setMode(m);
            }}
            canUndo={hist.canUndo}
            canRedo={hist.canRedo}
            onUndo={undo}
            onRedo={redo}
            onHistory={() => openShare("history")}
            onPresent={async () => {
              // Present what's on the canvas: save first, then open the view in presentation mode.
              await autosave.flush();
              router.push(`/plans/${planId}?present=1`);
            }}
            savedAt={autosave.savedAt}
            onShare={() => openShare("share")}
            onPublish={publish}
            publishing={publishing}
            people={props.people}
            onExport={onExport}
            comments={<CommentsToggle count={comments.counts.unresolvedThreads} open={commentsPanel.open} onClick={commentsPanel.toggle} />}
          />

          {autosave.status === "conflict" && (
            <Banner tone="danger" icon={<TriangleAlert className="size-4" />}>
              <span className="flex-1">
                <b className="font-semibold">Conflito de edição.</b> Este plan foi alterado em outro lugar enquanto você editava.
              </span>
              <Button size="sm" variant="secondary" onClick={reloadFromServer}>
                Recarregar versão do servidor
              </Button>
              <Button size="sm" variant="primary" onClick={autosave.keepMine}>
                Manter a minha
              </Button>
            </Banner>
          )}
          {autosave.status === "offline" && (
            <Banner tone="amber" icon={<CloudOff className="size-4" />}>
              <span className="flex-1">Sem conexão com o servidor. Suas alterações estão guardadas neste navegador e serão enviadas assim que possível.</span>
            </Banner>
          )}
          {backup && (
            <Banner tone="amber" icon={<RotateCcw className="size-4" />}>
              <span className="flex-1">
                Encontramos alterações locais não salvas ({timeAgo(backup.at)}). Deseja restaurá-las?
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  clearBackup(planId);
                  setBackup(null);
                }}
              >
                Descartar
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  applyDoc(backup.document, { nodes: [] });
                  setBackup(null);
                }}
              >
                Restaurar
              </Button>
            </Banner>
          )}

          {mode === "preview" && previewData ? (
            <div className="flex min-h-0 flex-1 bg-surface-2">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <ViewBody
                  plan={{ id: planId, title: meta.title, description: meta.description, tags: meta.tags }}
                  document={previewData.doc}
                  resources={previewData.byNode}
                  exportRef={previewExport}
                  canvas={{ commentCount, openNodeComments, focusRequest: previewFocus }}
                />
              </div>
              {commentsAside}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1">
              <PhoneOverlay open={phonePanel === "tools"} side="left" label="Elementos" onClose={() => setPhonePanel(null)}>
                <Toolbox />
              </PhoneOverlay>
              <CanvasContextMenu target={menuTarget}>
                <div
                  ref={wrapRef}
                  className={cn("relative min-w-0 flex-1 bg-canvas", dropping && "wp-dropping")}
                  onDragOver={onDragOver}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
                  }}
                  onDrop={(e) => void onDrop(e)}
                  onContextMenuCapture={(e) => {
                    const el = e.target as HTMLElement;
                    if (!el.closest(".react-flow__pane, .react-flow__node, .react-flow__edge, .react-flow__nodesselection, .react-flow__edgelabel-renderer")) {
                      e.preventDefault();
                      return;
                    }
                    setMenuTarget(null);
                  }}
                >
                  <ReactFlow<PlanFlowNode, PlanFlowEdge>
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onConnectEnd={onConnectEnd}
                    onReconnect={onReconnect}
                    edgesReconnectable
                    onEdgeDoubleClick={(_, ed) => tool === "select" && setEditingId(ed.id)}
                    onNodeDrag={onNodeDrag}
                    onNodeDragStop={onNodeDragStop}
                    onNodeClick={onNodeClick}
                    onNodeDoubleClick={(_, n) => tool === "select" && startEditing(n.id)}
                    onPaneClick={() => {
                      setConnectSource(null);
                      setEditingId(null);
                    }}
                    onNodeContextMenu={(_, n) => {
                      if (!n.selected) select([n.id]);
                      setMenuTarget({ type: "node", id: n.id });
                    }}
                    onSelectionContextMenu={() => {
                      const first = nodesRef.current.find((n) => n.selected);
                      if (first) setMenuTarget({ type: "node", id: first.id });
                    }}
                    onEdgeContextMenu={(_, ed) => {
                      select([], [ed.id]);
                      setMenuTarget({ type: "edge", id: ed.id });
                    }}
                    onPaneContextMenu={(e) => setMenuTarget({ type: "pane", at: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }) })}
                    onInit={() => !fitOnInit && restoreViewport()}
                    onMoveEnd={(_, vp) => {
                      viewportRef.current = vp;
                      writeViewport(planId, vp);
                    }}
                    defaultViewport={viewportRef.current}
                    fitView={fitOnInit}
                    fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
                    minZoom={0.1}
                    maxZoom={2.5}
                    connectionMode={ConnectionMode.Loose}
                    connectionRadius={28}
                    snapToGrid={snap}
                    snapGrid={[20, 20]}
                    deleteKeyCode={null}
                    selectionKeyCode="Shift"
                    multiSelectionKeyCode={["Shift", "Meta", "Control"]}
                    selectionOnDrag={tool === "select"}
                    selectionMode={SelectionMode.Partial}
                    panOnDrag={tool === "hand" ? true : [1]}
                    panOnScroll
                    nodesDraggable={tool !== "hand" && tool !== "draw" && tool !== "erase"}
                    elementsSelectable={tool !== "draw" && tool !== "erase"}
                    zoomOnDoubleClick={false}
                    elevateNodesOnSelect={false}
                    proOptions={{ hideAttribution: true }}
                    className={cn("wp-flow", `wp-tool-${tool}`)}
                  >
                    {grid && <Background variant={BackgroundVariant.Dots} gap={20} size={1.3} color="var(--canvas-dot)" />}
                    {minimap && (
                      <MiniMap
                        pannable
                        zoomable
                        position="bottom-right"
                        ariaLabel="Minimapa"
                        className="wp-minimap wp-no-print"
                        nodeColor={(n) => (typeof n.data.color === "string" ? `color-mix(in srgb, ${n.data.color} var(--minimap-tint), var(--surface))` : "var(--minimap-node)")}
                        nodeStrokeWidth={0}
                        nodeBorderRadius={4}
                        maskColor="var(--minimap-mask)"
                      />
                    )}
                    {guides && (guides.vertical || guides.horizontal) && (
                      <ViewportPortal>
                        {guides.vertical && (
                          <div
                            className="wp-guide pointer-events-none absolute"
                            style={{ left: guides.vertical.x, top: guides.vertical.y1 - 12, height: guides.vertical.y2 - guides.vertical.y1 + 24, width: 0 }}
                          />
                        )}
                        {guides.horizontal && (
                          <div
                            className="wp-guide pointer-events-none absolute"
                            style={{ top: guides.horizontal.y, left: guides.horizontal.x1 - 12, width: guides.horizontal.x2 - guides.horizontal.x1 + 24, height: 0 }}
                          />
                        )}
                      </ViewportPortal>
                    )}
                  </ReactFlow>
                  {nodes.length === 0 && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                      <div className="flex max-w-sm flex-col items-center gap-2 rounded-2xl border border-dashed border-line-2 bg-surface/85 px-6 py-5 text-center backdrop-blur-sm">
                        <MousePointerClick className="size-5 text-accent-ink" aria-hidden />
                        <p className="text-sm font-semibold">Comece seu plan</p>
                        <p className="text-body leading-5 text-muted">Arraste elementos ou recursos da barra lateral, ou clique com o botão direito no canvas para adicionar aqui.</p>
                      </div>
                    </div>
                  )}
                  {(tool === "draw" || tool === "erase") && <InkCanvas wrapRef={wrapRef} />}
                  <SelectionBar />
                  <BottomPill />
                  <div className="wp-no-print absolute left-3 top-3 z-10 flex gap-2 md:hidden">
                    <Button size="sm" variant="secondary" className="shadow-pop" onClick={() => setPhonePanel("tools")}>
                      <Plus /> Elementos
                    </Button>
                  </div>
                  <div className="wp-no-print absolute right-3 top-3 z-10 md:hidden">
                    <Button size="sm" variant="secondary" className="shadow-pop" onClick={() => setPhonePanel("props")}>
                      <SlidersHorizontal /> Propriedades
                    </Button>
                  </div>
                </div>
              </CanvasContextMenu>
              {commentsAside ?? (
                <PhoneOverlay open={phonePanel === "props"} side="right" label="Propriedades" onClose={() => setPhonePanel(null)}>
                  <Inspector />
                </PhoneOverlay>
              )}
            </div>
          )}
        </div>
        {!phoneEdit && (
          <div role="dialog" aria-modal="true" aria-labelledby="wp-phone-title" className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-bg px-7 text-center text-ink md:hidden">
            <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
              <MonitorSmartphone className="size-6" aria-hidden />
            </span>
            <div className="flex max-w-sm flex-col gap-2">
              <h1 id="wp-phone-title" className="font-display text-display-sm font-normal leading-[1.05]">
                Edição funciona melhor em telas maiores
              </h1>
              <p className="text-lead leading-[22px] text-muted">O editor precisa de espaço para as ferramentas e o painel de propriedades. No celular, você pode ver, apresentar e comentar o plan.</p>
            </div>
            <div className="flex w-full max-w-xs flex-col gap-2">
              <Button asChild variant="primary" size="lg" className="justify-center">
                <Link href={`/plans/${planId}`}>Ver o plan</Link>
              </Button>
              <Button variant="ghost" size="lg" className="justify-center" onClick={() => setPhoneEdit(true)}>
                Editar mesmo assim
              </Button>
            </div>
          </div>
        )}
        <ShareDialog
          planId={planId}
          open={share.open}
          section={share.section}
          onOpenChange={(open) => setShare((s) => ({ ...s, open }))}
          workspaceName={props.workspaceName}
          beforePublish={autosave.flush}
          onPublished={(v) => {
            setPublished(v.version || null);
            setUnpublished(v.version ? false : true);
          }}
          onRestored={onRestored}
          onVisibility={(visibility) => setMeta((m) => ({ ...m, visibility }))}
        />
      </PlannerContext.Provider>
    </EditorContext.Provider>
  );
}

/** Desktop: renders the panel in place. Phones: a toggleable full-height overlay. */
function PhoneOverlay({ open, side, label, onClose, children }: { open: boolean; side: "left" | "right"; label: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-scrim md:hidden" aria-hidden onClick={onClose} />}
      <div
        className={cn(
          "md:contents",
          open
            ? cn("fixed inset-y-0 z-30 flex max-w-[88vw] flex-col bg-surface shadow-pop animate-in md:static md:max-w-none md:shadow-none", side === "left" ? "left-0" : "right-0")
            : "max-md:hidden",
        )}
      >
        {open && (
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-3 md:hidden">
            <span className="text-sm font-semibold">{label}</span>
            <Button variant="ghost" size="icon" aria-label={`Fechar ${label.toLowerCase()}`} onClick={onClose} autoFocus>
              <X />
            </Button>
          </div>
        )}
        <div className="flex min-h-0 flex-1 md:contents">{children}</div>
      </div>
    </>
  );
}

function Banner({ tone, icon, children }: { tone: "danger" | "amber"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2 text-body",
        tone === "danger" ? "border-line bg-danger-soft text-danger" : "border-amber-line bg-amber-bg text-amber-ink",
      )}
    >
      {icon}
      {children}
    </div>
  );
}
