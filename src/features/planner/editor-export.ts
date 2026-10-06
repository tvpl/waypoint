"use client";
/**
 * Exporting from the editor: JSON, Excalidraw (file, clipboard, editable PNG/SVG), images and PDF
 * of the plan as shown or of a saved view, and one PDF page per frame.
 */
import { toast } from "sonner";
import type { ReactFlowInstance } from "@xyflow/react";
import type { PlanDocument } from "@/domain/plan";
import { toFlowEdges, toFlowNodes, type PlanFlowEdge, type PlanFlowNode } from "@/domain/canvas-adapter";
import { layersOf, viewVisibility } from "@/domain/layers";
import { isOverlayId } from "@/domain/overlay";
import { subsetDoc } from "./excalidraw";
import { copyScene, downloadScene, excalidrawScene, exportFramesPdf, exportImage, exportJson, exportPdf, isExcalidrawExport, openPrintWindow } from "./export";
import type { ExportKind } from "./topbar";

type Selection = { nodes: Set<string>; edges: Set<string> };

export type EditorExportCtx = {
  doc: PlanDocument;
  meta: { title: string; description?: string | null; tags?: string[] };
  rf: ReactFlowInstance<PlanFlowNode, PlanFlowEdge>;
  wrap: HTMLDivElement;
  selectedIds: () => Selection;
  select: (nodes: string[], edges?: string[]) => void;
  setNodes: (n: PlanFlowNode[]) => void;
  setEdges: (e: PlanFlowEdge[]) => void;
  applyDoc: (doc: PlanDocument, sel?: { nodes?: Iterable<string>; edges?: Iterable<string> }) => void;
};

/** Exports the canvas as it is, or a saved view (shown only while the image is taken). */
export async function exportFromEditor(k: ExportKind, viewId: string | undefined, { doc, meta, rf, wrap, selectedIds, select, setNodes, setEdges, applyDoc }: EditorExportCtx): Promise<void> {
  const view = viewId ? doc.views?.find((v) => v.id === viewId) : undefined;
  const title = view ? `${meta.title || "plan"} — ${view.name}` : meta.title || "plan";
  if (k === "json") return exportJson({ title, description: meta.description, tags: meta.tags }, doc);
  if (k === "frames-pdf") {
    const frames = rf.getNodes().filter((n) => n.type === "frame" && !n.hidden && !isOverlayId(n.id));
    if (!frames.length) return void toast.error("O plan não tem quadros.");
    const win = openPrintWindow(title);
    if (!win) return void toast.error("Permita pop-ups para exportar em PDF.");
    const prev = selectedIds();
    select([]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const pages = frames.map((f) => ({ bounds: rf.getNodesBounds([f]), title: (f.data.title as string) || "Quadro" }));
      // Reading order: rows top to bottom, then left to right.
      pages.sort((a, b) => (Math.abs(a.bounds.y - b.bounds.y) > Math.min(a.bounds.height, b.bounds.height) / 2 ? a.bounds.y - b.bounds.y : a.bounds.x - b.bounds.x));
      await exportFramesPdf(wrap, pages, title, win);
    } catch {
      toast.error("Não foi possível exportar. Tente novamente.");
    } finally {
      select([...prev.nodes], [...prev.edges]);
    }
    return;
  }
  const vis = view ? viewVisibility(doc, view.id) : null;
  const shown = vis ?? Object.fromEntries(layersOf(doc).map((l) => [l.id, l.visible !== false]));
  const scene = isExcalidrawExport(k) ? () => excalidrawScene(doc, { title, visible: (id) => shown[id] !== false }) : null;
  if (k === "excalidraw") return downloadScene(await scene!(), title);
  if (k === "excalidraw-copy") {
    // The selection when there is one, else the plan as shown.
    const sel = selectedIds();
    const part = sel.nodes.size || sel.edges.size ? subsetDoc(doc, sel.nodes, sel.edges) : doc;
    const out = await excalidrawScene(part, { title, visible: (id) => shown[id] !== false });
    return void copyScene(out).then(
      () => toast.success(`Copiado: ${out.elements.filter((e) => !e.containerId).length} elementos. Cole no Excalidraw com ⌘V.`),
      () => toast.error("Não foi possível copiar."),
    );
  }
  if (!vis && !rf.getNodes().some((n) => !n.hidden)) return void toast.error("O plan está vazio.");
  const printWin = k === "pdf" ? openPrintWindow(title) : null;
  if (k === "pdf" && !printWin) return void toast.error("Permita pop-ups para exportar em PDF.");
  const prev = selectedIds();
  if (vis) {
    setNodes(toFlowNodes(doc, { layerVisibility: vis }));
    setEdges(toFlowEdges(doc, { layerVisibility: vis }));
  } else select([]);
  // let React Flow render (and measure what the view brings back) before taking the picture
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (vis) await new Promise((r) => setTimeout(r, 120));
  try {
    const visible = rf.getNodes().filter((n) => !n.hidden);
    if (!visible.length) {
      printWin?.close();
      return void toast.error("Esta visão está vazia.");
    }
    const bounds = rf.getNodesBounds(visible);
    if (k === "pdf") await exportPdf(wrap, bounds, title, printWin);
    else if (k === "png" || k === "svg") await exportImage(wrap, bounds, k, title);
    else await exportImage(wrap, bounds, k === "excalidraw-png" ? "png" : "svg", title, await scene!());
  } catch {
    toast.error("Não foi possível exportar. Tente novamente.");
  } finally {
    if (vis) applyDoc(doc, { nodes: prev.nodes, edges: prev.edges });
    else select([...prev.nodes], [...prev.edges]);
  }
}
