"use client";
/**
 * Copy and paste on the canvas: elements between plans, drawings copied in Excalidraw, images,
 * links (they become link cards) and plain text (it becomes a note), under the pointer.
 */
import { useEffect, type MutableRefObject, type RefObject } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import type { PlanFlowEdge, PlanFlowNode } from "@/domain/canvas-adapter";
import type { NodeData, NodeKind } from "@/domain/plan";
import { CLIPBOARD_TYPE, EXCALIDRAW_MIME, parseScene } from "./excalidraw";
import type { EditorApi } from "./editor-context";
import { isTyping } from "./editor-keys";

/** Marks the system clipboard when it holds elements copied here. */
export const NODES_MIME = "application/x-waypoint-nodes";

type Pt = { x: number; y: number };
type Scene = NonNullable<ReturnType<typeof parseScene>>;

export type EditorClipboardDeps = {
  mode: "edit" | "preview";
  apiRef: MutableRefObject<EditorApi>;
  rf: ReactFlowInstance<PlanFlowNode, PlanFlowEdge>;
  wrapRef: RefObject<HTMLDivElement | null>;
  insertSceneRef: MutableRefObject<(scene: Scene, opts?: { at?: Pt; layerName?: string }) => Promise<void> | void>;
  addNodeRef: MutableRefObject<(kind: NodeKind, opts?: { at?: Pt; data?: Partial<NodeData> }) => void>;
  uploadImage: (file: File, at?: Pt) => Promise<void> | void;
  addUrlNodes: (urls: string[], at?: Pt) => void;
};

export function useEditorClipboard({ mode, apiRef, rf, wrapRef, insertSceneRef, addNodeRef, uploadImage, addUrlNodes }: EditorClipboardDeps) {
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
      // Copied in Excalidraw: the drawing comes in, not its JSON as a note.
      const raw = cd?.getData(EXCALIDRAW_MIME) || cd?.getData("text/plain") || "";
      if (raw.trimStart().startsWith("{") && (raw.includes(CLIPBOARD_TYPE) || raw.includes('"excalidraw"'))) {
        try {
          const scene = parseScene(JSON.parse(raw));
          if (scene) return void insertSceneRef.current(scene, { at });
        } catch {}
      }
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
}
