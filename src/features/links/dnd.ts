"use client";
/**
 * Tiny shared store for HTML5 drag & drop inside the library. `dataTransfer`
 * can't be read during dragover, so the payload lives here while dragging.
 */
export type DragPayload = { kind: "collection"; id: string } | { kind: "links"; ids: string[] };

let current: DragPayload | null = null;

export const DND_MIME = "application/x-waypoint";

export function startDrag(e: React.DragEvent, payload: DragPayload, extra?: { url?: string; label?: string }) {
  current = payload;
  e.dataTransfer.effectAllowed = "copyMove";
  e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
  if (extra?.url) {
    e.dataTransfer.setData("text/uri-list", extra.url);
    e.dataTransfer.setData("text/plain", extra.url);
  } else if (extra?.label) {
    e.dataTransfer.setData("text/plain", extra.label);
  }
}

export const getDrag = () => current;
export const endDrag = () => {
  current = null;
};

/** Before/after/inside position of the pointer relative to an element. */
export function dropPosition(e: React.DragEvent, axis: "x" | "y", allowInside: boolean): "before" | "after" | "inside" {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const t = axis === "y" ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
  if (!allowInside) return t < 0.5 ? "before" : "after";
  if (t < 0.28) return "before";
  if (t > 0.72) return "after";
  return "inside";
}
