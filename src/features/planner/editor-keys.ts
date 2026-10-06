"use client";
/**
 * The editor's keyboard: Excalidraw's tool keys, shortcuts for the selection, undo and redo,
 * zoom, layers, F6 between areas, and ⌘/Ctrl held for moving without guides.
 */
import { useEffect, type MutableRefObject, type RefObject } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import { BASE_LAYER_ID } from "@/domain/layers";
import type { PlanFlowEdge, PlanFlowNode } from "@/domain/canvas-adapter";
import { motionMs } from "@/lib/utils";
import { CREATE_TOOLS, type EditorApi, type Tool } from "./editor-context";

/** Whether a key event belongs to a text field. */
export function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea, select, [href], [tabindex]:not([tabindex="-1"])';

/**
 * Moves the keyboard focus to the next (or previous) area of the editor. The canvas takes the
 * selected element, else the first one, else itself.
 */
function cycleRegion(dir: 1 | -1) {
  const root = document.querySelector<HTMLElement>("[data-planner-root]");
  if (!root) return;
  const regions = [
    root.querySelector<HTMLElement>("header"),
    root.querySelector<HTMLElement>('aside[aria-label="Ferramentas"]'),
    root.querySelector<HTMLElement>('[data-planner-region="canvas"]'),
    root.querySelector<HTMLElement>('[aria-label="Propriedades"]:not(button)'),
    root.querySelector<HTMLElement>('[role="toolbar"][aria-label="Ferramentas do canvas"]'),
  ].filter((r): r is HTMLElement => !!r && r.offsetParent !== null);
  if (!regions.length) return;
  // The dock and the floating properties sit inside the canvas area: the innermost (last) one wins.
  let at = -1;
  regions.forEach((r, i) => r.contains(document.activeElement) && (at = i));
  const next = regions[(at + dir + regions.length) % regions.length];
  if (next.dataset.plannerRegion === "canvas") {
    const node = next.querySelector<HTMLElement>(".react-flow__node.selected") ?? next.querySelector<HTMLElement>(".react-flow__node[tabindex]");
    (node ?? next).focus();
    return;
  }
  (next.querySelector<HTMLElement>(FOCUSABLE) ?? next).focus();
}

type Pt = { x: number; y: number };

export type EditorKeysDeps = {
  mode: "edit" | "preview";
  apiRef: MutableRefObject<EditorApi>;
  rf: ReactFlowInstance<PlanFlowNode, PlanFlowEdge>;
  undo: () => void;
  redo: () => void;
  setEditingId: (id: string | null) => void;
  wrapRef: RefObject<HTMLDivElement | null>;
  lastPointer: MutableRefObject<Pt | null>;
  viewportCenterRef: MutableRefObject<() => Pt>;
  setQuickInsert: (at: Pt | null) => void;
  /** Coalesces the arrow-key nudges into one history step. */
  pendingKey: MutableRefObject<string | null>;
  /** True while ⌘/Ctrl is held (drag without alignment guides). */
  freeMove: MutableRefObject<boolean>;
};

export function useEditorKeys({ mode, apiRef, rf, undo, redo, setEditingId, wrapRef, lastPointer, viewportCenterRef, setQuickInsert, pendingKey, freeMove }: EditorKeysDeps) {
  useEffect(() => {
    if (mode !== "edit") return;
    const onKey = (e: KeyboardEvent) => {
      // F6 / ⇧F6: the next or previous area (top bar, side panel, canvas, properties, dock), even while typing.
      if (e.key === "F6" && !e.defaultPrevented) {
        e.preventDefault();
        cycleRegion(e.shiftKey ? -1 : 1);
        return;
      }
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
      if (mod && e.altKey && e.code === "KeyC") return run(a.copyStyle);
      if (mod && e.altKey && e.code === "KeyV") return run(a.pasteStyle);
      // Focus mode: only the drawing (⌘\ again brings the panels back).
      if (mod && e.code === "Backslash") return run(() => a.panels.setFocus(!a.panels.focus));
      if (mod && k === "a") return run(a.selectAll);
      if (mod && k === "g" && e.shiftKey) return run(a.ungroup);
      if (mod && k === "g") return run(a.group);
      if (mod && e.shiftKey && k === "l" && a.selectedNodes.length) return run(() => a.setLocked(!a.selectedNodes.every((n) => n.data.locked)));
      if (mod && e.shiftKey && k === "h" && a.selectedNodes.length) return run(() => a.setHidden(true));
      if (mod && k === "l") return a.selectedNodes.length === 1 ? run(() => a.setInspectorTab("action")) : undefined;
      // ⇧L vertical, ⌥⇧L horizontal (e.code: ⌥ changes e.key on macOS)
      if (!mod && e.shiftKey && e.code === "KeyL") return run(() => a.autoArrange(e.altKey ? "LR" : "TB"));
      // ⌥[ / ⌥] move the selection to the layer below / above (e.code: ⌥ changes e.key on macOS).
      if (e.altKey && !mod && (e.code === "BracketLeft" || e.code === "BracketRight")) {
        const sel = a.selectedNodes[0] ?? null;
        const edge = a.selectedEdges[0] ?? null;
        const from = sel ? (sel.data._layer ?? BASE_LAYER_ID) : edge ? (edge.data?.layer ?? BASE_LAYER_ID) : null;
        if (!from) return;
        const list = a.layers.list;
        const target = list[list.findIndex((l) => l.id === from) + (e.code === "BracketRight" ? 1 : -1)];
        if (target) run(() => a.layers.assignSelection(target.id));
        return;
      }
      if (mod || e.altKey) return;
      if (k === "delete" || k === "backspace") return run(a.remove);
      if (k === "escape") {
        setEditingId(null);
        if (a.tool === "connect" || CREATE_TOOLS.has(a.tool)) return run(() => a.setTool("select"));
        // nothing to let go of: leave an isolated layer
        if (!a.selectedNodes.length && !a.selectedEdges.length && a.layers.isolated) return run(() => a.layers.setIsolated(null));
        return run(() => a.select([]));
      }
      if (k === "enter" && a.selectedNodes.length === 1) return run(() => a.startEditing(a.selectedNodes[0].id));
      // Excalidraw's keys: numbers and letters pick the drawing tools; ⇧1 fits, ⇧0 is 100%.
      if (e.shiftKey && e.code === "Digit1") return run(() => rf.fitView({ padding: 0.15, duration: motionMs(250) }));
      if (e.shiftKey && e.code === "Digit0") return run(() => rf.zoomTo(1, { duration: motionMs(150) }));
      const digit = /^Digit(\d)$/.exec(e.code)?.[1];
      if (digit && !e.shiftKey) {
        // With nothing selected in the select tool, 1 and 0 keep their old meaning: fit and 100%.
        const idle = a.tool === "select" && !a.selectedNodes.length && !a.selectedEdges.length;
        if (idle && digit === "1") return run(() => rf.fitView({ padding: 0.15, duration: motionMs(250) }));
        if (idle && digit === "0") return run(() => rf.zoomTo(1, { duration: motionMs(150) }));
        const byDigit: Record<string, Tool | "image"> = { "1": "select", "2": "rect", "3": "diamond", "4": "ellipse", "5": "arrow", "6": "line", "7": "draw", "8": "text", "9": "image", "0": "erase" };
        const t = byDigit[digit];
        return run(() => (t === "image" ? a.addNode("image") : a.setTool(t)));
      }
      if (e.key === "/") {
        const r = wrapRef.current?.getBoundingClientRect();
        const p = lastPointer.current;
        const inside = p && r && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
        return run(() => setQuickInsert(inside ? rf.screenToFlowPosition(p) : viewportCenterRef.current()));
      }
      if (k === "v") return run(() => a.setTool("select"));
      if (k === "i") return run(() => a.panels.setInspectorOpen(!a.panels.inspectorOpen || a.panels.focus));
      if (k === "h") return run(() => a.setTool("hand"));
      if (k === "p") return run(() => a.setTool(a.tool === "draw" ? "select" : "draw"));
      if (k === "e") return run(() => a.setTool(a.tool === "erase" ? "select" : "erase"));
      if (k === "r") return run(() => a.setTool("rect"));
      if (k === "d") return run(() => a.setTool("diamond"));
      if (k === "o") return run(() => a.setTool("ellipse"));
      if (k === "a") return run(() => a.setTool("arrow"));
      if (k === "l") return run(() => a.setTool("line"));
      if (k === "t") return run(() => a.setTool("text"));
      if (k === "f") return run(() => a.setTool("frame"));
      if (k === "s") return run(() => a.setTool(a.tool === "shape" ? "select" : "shape"));
      // ⇧N shows or hides every annotation at once; N is the annotation tool.
      if (k === "n" && e.shiftKey) return run(() => a.setAnnotationView({ show: !a.annotationView.show }));
      if (k === "n") return run(() => a.setTool(a.tool === "annotate" ? "select" : "annotate"));
      if (k === "c") return run(() => (a.selectedNodes.length === 1 ? a.startConnectFrom(a.selectedNodes[0].id) : a.setTool("connect")));
      if (k === "+" || k === "=") return run(() => rf.zoomIn({ duration: motionMs(150) }));
      if (k === "-" || k === "_") return run(() => rf.zoomOut({ duration: motionMs(150) }));

      if (k === "m") return run(() => a.setMinimap(!a.minimap));
      if (k === "]") return run(a.bringToFront);
      if (k === "[") return run(a.sendToBack);
      if (k.startsWith("arrow")) pendingKey.current = "nudge";
    };
    const onAlt = (e: KeyboardEvent) => (freeMove.current = e.metaKey || e.ctrlKey);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keydown", onAlt, true);
    window.addEventListener("keyup", onAlt, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onAlt, true);
      window.removeEventListener("keyup", onAlt, true);
    };
  }, [mode, undo, redo, rf]);
}
