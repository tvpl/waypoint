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
  ConnectionMode,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
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
import type { EdgeKind, NodeData, NodeKind, PlanDocument, ResourceRef } from "@/domain/plan";
import {
  contentSignature,
  edgeMarker,
  fromFlow,
  toFlowEdge,
  toFlowEdges,
  toFlowNodes,
  type PlanFlowEdge,
  type PlanFlowNode,
} from "@/domain/canvas-adapter";
import { Button } from "@/components/ui/button";
import { cn, newId, timeAgo } from "@/lib/utils";
import { PlannerContext, type PlannerContextValue } from "./context";
import { EditorContext, type EditorApi, type InspectorTab, type PlanMeta, type Tool } from "./editor-context";
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
import { fallbackResource, refKey, type ResolvedResource } from "./resource-types";
import { exportImage, exportJson, exportPdf, openPrintWindow } from "./export";
import { publishPlanAction, updatePlanMetaAction } from "./actions";
import type { ViewerExport } from "./viewer";
import { CommentsPanel, CommentsToggle, useComments, useCommentsPanel } from "./comments";

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

const normalizeForCanvas = (doc: PlanDocument) => fromFlow(toFlowNodes(doc), toFlowEdges(doc), doc.viewport);

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

  const docOf = useCallback(() => fromFlow(nodesRef.current, edgesRef.current, viewportRef.current), []);

  // ---------------------------------------------------------------- ui state
  const [meta, setMeta] = useState<PlanMeta>({ title: props.plan.title, description: props.plan.description, tags: props.plan.tags, visibility: props.plan.visibility });
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [tool, setToolState] = useState<Tool>("select");
  const [connectKind, setConnectKind] = useState<EdgeKind>("flow");
  const [connectSource, setConnectSource] = useState<string | null>(null);
  const connectOnce = useRef(false);
  const [grid, setGrid] = useState(true);
  const [snap, setSnap] = useState(false);
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

  useEffect(() => {
    if (nodes.some((n) => n.dragging || n.resizing)) return;
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
  }, [nodes, edges]);

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
    setNodes(toFlowNodes(doc, { selected: n }));
    setEdges(toFlowEdges(doc, { selected: e }));
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
      let doc = addNodes(docOf(), [node]);
      if (!PARENT_KINDS.has(node.kind)) {
        const target = findDropTarget(doc, node.id);
        if (target) doc = reparent(doc, node.id, target);
      }
      pendingKey.current = null;
      applyDoc(doc, { nodes: [node.id] });
    },
    [docOf, applyDoc],
  );

  const addNode = useCallback(
    (kind: NodeKind, opts: { at?: { x: number; y: number }; data?: Partial<NodeData> } = {}) => {
      const node = createNode(kind, opts.at ?? viewportCenter(), opts.data, { center: true });
      if (snap) {
        node.x = Math.round(node.x / 10) * 10;
        node.y = Math.round(node.y / 10) * 10;
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

  const addResourceNode = useCallback(
    (ref: ResourceRef, resource: ResolvedResource, at?: { x: number; y: number }) => {
      cacheResource(ref, resource);
      const node = createNode("link", at ?? viewportCenter(), { title: "", resource: ref, openIn: "new-tab" }, { center: true });
      insert(node);
      setInspectorTab("action");
    },
    [cacheResource, insert, viewportCenter],
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
        return r.doc;
      });
      if (created.length) select(created);
    },
    [mutate, select],
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
          void rf.fitView({ nodes: scoped ? sel.map((id) => ({ id })) : undefined, padding: scoped ? 0.35 : 0.15, maxZoom: 1, duration: 600 });
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
      const edge = toFlowEdge({ id: newId(), source, target, sourceHandle: sourceHandle ?? null, targetHandle: targetHandle ?? null, kind: connectKind });
      pendingKey.current = null;
      setEdges((list) => [...list.map((e) => (e.selected ? { ...e, selected: false } : e)), { ...edge, selected: true }]);
      setNodes((list) => list.map((n) => (n.selected ? { ...n, selected: false } : n)));
    },
    [rf, connectKind],
  );

  const focusNode = useCallback(
    (id: string) => {
      select([id]);
      void rf.fitView({ nodes: [{ id }], padding: 0.8, maxZoom: 1.2, duration: 300 });
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
    selectAll: () => select(nodesRef.current.filter((n) => !n.hidden).map((n) => n.id)),
    focusNode,
    toggleCollapsed: (id) => mutate((d) => setCollapsed(d, id, !d.nodes.find((n) => n.id === id)?.data.collapsed)),
    startEditing,
    startConnectFrom,
    tool,
    setTool,
    connectKind,
    setConnectKind,
    grid,
    setGrid,
    snap,
    setSnap,
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
    [resourceFor, editingId, updateNodeData, childCount, singleSelectedId, dropTarget, connectSource, commentCount, openNodeComments],
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
      if (mod && k === "c") return a.selectedNodes.length ? run(a.copy) : undefined;
      if (mod && k === "v") return run(() => a.paste());
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
        if (a.tool === "connect") return run(() => a.setTool("select"));
        return run(() => a.select([]));
      }
      if (k === "enter" && a.selectedNodes.length === 1) return run(() => a.startEditing(a.selectedNodes[0].id));
      if (k === "v") return run(() => a.setTool("select"));
      if (k === "h") return run(() => a.setTool("hand"));
      if (k === "c") return run(() => (a.selectedNodes.length === 1 ? a.startConnectFrom(a.selectedNodes[0].id) : a.setTool("connect")));
      if (k === "]") return run(a.bringToFront);
      if (k === "[") return run(a.sendToBack);
      if (k.startsWith("arrow")) pendingKey.current = "nudge";
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, undo, redo]);

  // ---------------------------------------------------------------- flow handlers
  const onNodesChange = useCallback((changes: NodeChange<PlanFlowNode>[]) => {
    // removal goes through our own delete (keeps descendants/edges consistent)
    const filtered = changes.filter((c) => c.type !== "remove");
    if (filtered.length) setNodes((list) => applyNodeChanges(filtered, list));
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange<PlanFlowEdge>[]) => {
    const filtered = changes.filter((c) => c.type !== "remove");
    if (filtered.length) setEdges((list) => applyEdgeChanges(filtered, list));
  }, []);

  const onConnect = useCallback((c: Connection) => createEdge(c.source, c.target, c.sourceHandle, c.targetHandle), [createEdge]);

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
      const target = findDropTarget(doc, node.id) ?? null;
      setDropTarget(target !== (node.parentId ?? null) ? target : null);
    },
    [],
  );

  const onNodeDragStop: OnNodeDrag<PlanFlowNode> = useCallback((_e, _node, dragged) => {
    setDropTarget(null);
    const ids = dragged.map((d) => d.id);
    // functional update: runs after React Flow's final position change in the same batch
    setNodes((prev) => {
      const base = fromFlow(prev, [], viewportRef.current);
      let doc = base;
      for (const id of selectionRoots(base, ids)) {
        const target = findDropTarget(doc, id);
        const cur = doc.nodes.find((n) => n.id === id)?.parentId;
        if (target !== cur) doc = reparent(doc, id, target);
      }
      if (doc === base) return prev;
      return toFlowNodes(doc, { selected: new Set(prev.filter((n) => n.selected).map((n) => n.id)) });
    });
  }, []);

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
    if (types.includes(DND_MIME) || types.includes("Files")) {
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
    const file = Array.from(e.dataTransfer.files ?? []).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    e.preventDefault();
    const fd = new FormData();
    fd.set("file", file);
    const id = toast.loading("Enviando imagem…");
    try {
      const res = await fetch("/api/assets", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? "Falha no envio.");
      addNode("image", { at, data: { image: body.url, title: file.name.replace(/\.[a-z0-9]+$/i, "") } });
      toast.success("Imagem adicionada", { id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no envio.", { id });
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

  return (
    <EditorContext.Provider value={api}>
      <PlannerContext.Provider value={plannerCtx}>
        <div className="flex h-dvh flex-col overflow-hidden bg-bg text-ink">
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
                    onMoveEnd={(_, vp) => {
                      viewportRef.current = vp;
                    }}
                    defaultViewport={viewportRef.current}
                    fitView={fitOnInit}
                    fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
                    minZoom={0.1}
                    maxZoom={2.5}
                    connectionMode={ConnectionMode.Loose}
                    connectionRadius={28}
                    snapToGrid={snap}
                    snapGrid={[10, 10]}
                    deleteKeyCode={null}
                    selectionKeyCode="Shift"
                    multiSelectionKeyCode={["Shift", "Meta", "Control"]}
                    selectionOnDrag={tool === "select"}
                    selectionMode={SelectionMode.Partial}
                    panOnDrag={tool === "hand" ? true : [1]}
                    panOnScroll
                    nodesDraggable={tool !== "hand"}
                    zoomOnDoubleClick={false}
                    elevateNodesOnSelect={false}
                    proOptions={{ hideAttribution: true }}
                    className={cn("wp-flow", `wp-tool-${tool}`)}
                  >
                    {grid && <Background variant={BackgroundVariant.Dots} gap={20} size={1.3} color="var(--canvas-dot)" />}
                  </ReactFlow>
                  {nodes.length === 0 && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                      <div className="flex max-w-sm flex-col items-center gap-2 rounded-2xl border border-dashed border-line-2 bg-surface/85 px-6 py-5 text-center backdrop-blur-sm">
                        <MousePointerClick className="size-5 text-accent-ink" aria-hidden />
                        <p className="text-sm font-semibold">Comece seu plan</p>
                        <p className="text-[13px] leading-5 text-muted">Arraste elementos ou recursos da barra lateral, ou clique com o botão direito no canvas para adicionar aqui.</p>
                      </div>
                    </div>
                  )}
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
              <h1 id="wp-phone-title" className="font-display text-[34px] font-normal leading-[1.05]">
                Edição funciona melhor em telas maiores
              </h1>
              <p className="text-[15px] leading-[22px] text-muted">O editor precisa de espaço para as ferramentas e o painel de propriedades. No celular, você pode ver, apresentar e comentar o plan.</p>
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
        "flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2 text-[13px]",
        tone === "danger" ? "border-line bg-danger-soft text-danger" : "border-amber-line bg-amber-bg text-amber-ink",
      )}
    >
      {icon}
      {children}
    </div>
  );
}
