"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useReactFlow } from "@xyflow/react";
import { useEditor } from "./editor-context";
import { arrowHead, centerline, HIGHLIGHTER_COLOR, HIGHLIGHTER_SCALE, isShapeMode, shapePath, strokeOutline, type Point } from "./ink-geometry";

/** Where a press starts a stroke: the canvas itself, not the floating toolbars over it. */
const CANVAS = ".react-flow__pane, .react-flow__node, .react-flow__edge, .react-flow__nodesselection, .react-flow__edgelabel-renderer";

/**
 * Drawing and erasing on the canvas. Listens on the canvas wrapper in the capture phase so
 * React Flow never sees the press (no selection box, no node drag); wheel zoom and middle-button
 * panning keep working. The stroke is previewed in screen space and handed to the editor in
 * canvas coordinates on release.
 */
export function InkCanvas({ wrapRef }: { wrapRef: RefObject<HTMLDivElement | null> }) {
  const ed = useEditor();
  const rf = useReactFlow();
  const edRef = useRef(ed);
  edRef.current = ed;
  const [preview, setPreview] = useState<Point[] | null>(null);
  const tool = ed.tool;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || (tool !== "draw" && tool !== "erase")) return;
    let stroke: { flow: Point[]; screen: Point[] } | null = null;
    let erasing: Set<string> | null = null;
    let frame = 0;
    const local = (e: PointerEvent): Point => {
      const r = el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const toFlow = (e: PointerEvent): Point => {
      const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      return [p.x, p.y];
    };
    const eraseAt = (e: PointerEvent) => {
      for (const hit of document.elementsFromPoint(e.clientX, e.clientY)) {
        const node = hit.closest<HTMLElement>(".react-flow__node-ink");
        const id = node?.dataset.id;
        if (!node || !id || !el.contains(node) || erasing!.has(id)) continue;
        erasing!.add(id);
        node.classList.add("is-erasing");
      }
    };
    const down = (e: PointerEvent) => {
      const target = e.target as Element | null;
      // typing in a text annotation: let the field have its clicks
      if (target?.closest?.("input, textarea")) return;
      if (e.button !== 0 || !target?.closest?.(CANVAS)) return;
      e.preventDefault();
      e.stopPropagation();
      if (tool === "draw" && edRef.current.ink.mode === "text") {
        // The first click away from a text being typed finishes it; the next one starts another.
        const typing = document.activeElement as HTMLElement | null;
        if (typing && el.contains(typing) && typing.matches("input, textarea")) return void typing.blur();
        const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        edRef.current.addInkText(p);
        return;
      }
      el.setPointerCapture(e.pointerId);
      if (tool === "draw") {
        stroke = { flow: [toFlow(e)], screen: [local(e)] };
        setPreview(stroke.screen.slice());
      } else {
        erasing = new Set();
        eraseAt(e);
      }
    };
    const move = (e: PointerEvent) => {
      if (stroke) {
        e.stopPropagation();
        // Every sample the device produced since the last frame, for smooth curves.
        for (const ev of e.getCoalescedEvents?.() ?? [e]) {
          stroke.flow.push(toFlow(ev));
          stroke.screen.push(local(ev));
        }
        if (!frame) {
          frame = requestAnimationFrame(() => {
            frame = 0;
            if (stroke) setPreview(stroke.screen.slice());
          });
        }
      } else if (erasing) {
        e.stopPropagation();
        eraseAt(e);
      }
    };
    const up = (e: PointerEvent) => {
      if (stroke) {
        e.stopPropagation();
        const points = stroke.flow;
        stroke = null;
        setPreview(null);
        edRef.current.addInk(points, rf.getViewport().zoom);
      } else if (erasing) {
        e.stopPropagation();
        const ids = [...erasing];
        erasing = null;
        el.querySelectorAll(".is-erasing").forEach((n) => n.classList.remove("is-erasing"));
        if (ids.length) edRef.current.removeInk(ids);
      }
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    el.addEventListener("pointerdown", down, true);
    el.addEventListener("pointermove", move, true);
    el.addEventListener("pointerup", up, true);
    el.addEventListener("pointercancel", up, true);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointerdown", down, true);
      el.removeEventListener("pointermove", move, true);
      el.removeEventListener("pointerup", up, true);
      el.removeEventListener("pointercancel", up, true);
      setPreview(null);
    };
  }, [tool, wrapRef, rf]);

  if (!preview || preview.length === 0) return null;
  const { mode, color, size } = ed.ink;
  const zoom = rf.getViewport().zoom;
  const width = (mode === "highlighter" ? size * HIGHLIGHTER_SCALE : size) * zoom;
  const fill = color ?? (mode === "highlighter" ? HIGHLIGHTER_COLOR : "var(--ink)");
  if (isShapeMode(mode)) {
    const [a, b] = [preview[0], preview[preview.length - 1]];
    const pad = width / 2 + 1;
    const w = Math.abs(b[0] - a[0]) + pad * 2;
    const h = Math.abs(b[1] - a[1]) + pad * 2;
    return (
      <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full" aria-hidden>
        <path d={shapePath(mode, w, h, width)} transform={`translate(${Math.min(a[0], b[0]) - pad} ${Math.min(a[1], b[1]) - pad})`} fill="none" stroke={fill} strokeWidth={width} strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full" aria-hidden>
      {mode === "arrow" ? (
        <>
          <path d={centerline([preview[0], preview[preview.length - 1]])} stroke={fill} strokeWidth={width} strokeLinecap="round" fill="none" />
          <path d={arrowHead(preview[0], preview[preview.length - 1], width)} fill={fill} stroke={fill} strokeWidth={Math.max(1, width / 2)} strokeLinejoin="round" />
        </>
      ) : (
        <path d={strokeOutline(preview, width, mode === "highlighter")} fill={fill} opacity={mode === "highlighter" ? 0.4 : 1} />
      )}
    </svg>
  );
}
