"use client";
import { getViewportForBounds, type Rect } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import type { PlanDocument } from "@/domain/plan";
import { slugify } from "@/lib/utils";

function download(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function exportJson(meta: { title: string; description?: string | null; tags?: string[] }, doc: PlanDocument) {
  const payload = {
    format: "waypoint-plan",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    plan: { title: meta.title, description: meta.description ?? null, tags: meta.tags ?? [] },
    document: doc,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  download(url, `${slugify(meta.title)}.waypoint.json`);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const PAD = 48;

/**
 * Renders the React Flow viewport to an image following the React Flow
 * "download image" recipe: fit the node bounds into an off-screen transform.
 */
export async function renderFlowImage(container: HTMLElement, bounds: Rect, format: "png" | "svg"): Promise<string> {
  const viewportEl = container.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewportEl) throw new Error("viewport not found");
  const width = Math.round(Math.min(4000, Math.max(480, bounds.width + PAD * 2)));
  const height = Math.round(Math.min(4000, Math.max(320, bounds.height + PAD * 2)));
  const vp = getViewportForBounds(bounds, width, height, 0.1, 2, `${PAD}px`);
  const bg = getComputedStyle(container).getPropertyValue("--canvas").trim() || "#f5f5f2";
  const opts = {
    backgroundColor: bg,
    width,
    height,
    pixelRatio: 2,
    cacheBust: false,
    style: { width: `${width}px`, height: `${height}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
    filter: (node: HTMLElement) => {
      const c = node.classList;
      if (!c) return true;
      return !c.contains("react-flow__resize-control") && !c.contains("wp-no-export");
    },
  };
  const restore = inlineSvgPaint(viewportEl);
  try {
    return await (format === "png" ? toPng(viewportEl, opts) : toSvg(viewportEl, opts));
  } finally {
    restore();
  }
}

const PAINT = ["stroke", "fill", "stroke-width", "stroke-dasharray", "stroke-opacity", "fill-opacity", "opacity"] as const;

/**
 * Connection lines and drawings are painted by stylesheet rules with CSS variables, which the
 * image renderer doesn't resolve (lines came out invisible). Writes the computed paint on each
 * shape for the capture and gives back a function that undoes it.
 */
function inlineSvgPaint(root: HTMLElement): () => void {
  const saved: [SVGElement, string | null][] = [];
  for (const el of root.querySelectorAll<SVGElement>("svg path, svg rect, svg ellipse, svg circle, svg line, svg polyline, svg polygon")) {
    const cs = getComputedStyle(el);
    saved.push([el, el.getAttribute("style")]);
    for (const prop of PAINT) el.style.setProperty(prop, cs.getPropertyValue(prop));
  }
  return () => {
    for (const [el, style] of saved) {
      if (style === null) el.removeAttribute("style");
      else el.setAttribute("style", style);
    }
  };
}

export async function exportImage(container: HTMLElement, bounds: Rect, format: "png" | "svg", title: string) {
  const url = await renderFlowImage(container, bounds, format);
  download(url, `${slugify(title)}.${format}`);
}

const esc = (t: string) => t.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

/**
 * Opens the print window synchronously (inside the click) so popup blockers
 * allow it; the image is written into it once rendered.
 */
export function openPrintWindow(title: string): Window | null {
  const w = window.open("", "_blank");
  if (!w) return null;
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title></head><body style="font-family:system-ui,sans-serif;color:#686973;padding:24px">Gerando PDF…</body></html>`);
  w.document.close();
  return w;
}

/** PDF via the browser's print dialog, using a rendered PNG on a clean page. */
export async function exportPdf(container: HTMLElement, bounds: Rect, title: string, w: Window | null) {
  if (!w) throw new Error("popup blocked");
  let url: string;
  try {
    url = await renderFlowImage(container, bounds, "png");
  } catch (e) {
    w.close();
    throw e;
  }
  const safe = esc(title);
  w.document.open();
  w.document.write(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${safe}</title><style>@page{size:auto;margin:12mm}html,body{margin:0;font-family:system-ui,sans-serif;color:#17171c}h1{font-size:18px;font-weight:600;margin:0 0 12px}img{width:100%;height:auto;display:block}</style></head><body><h1>${safe}</h1><img src="${url}" alt=""></body></html>`,
  );
  w.document.close();
  const img = w.document.querySelector("img");
  const go = () => {
    w.focus();
    w.print();
  };
  if (img && !img.complete) img.onload = go;
  else setTimeout(go, 50);
}
