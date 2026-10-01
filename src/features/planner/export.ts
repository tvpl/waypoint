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
  return format === "png" ? toPng(viewportEl, opts) : toSvg(viewportEl, opts);
}

export async function exportImage(container: HTMLElement, bounds: Rect, format: "png" | "svg", title: string) {
  const url = await renderFlowImage(container, bounds, format);
  download(url, `${slugify(title)}.${format}`);
}

/** PDF via the browser's print dialog, using a rendered PNG on a clean page. */
export async function exportPdf(container: HTMLElement, bounds: Rect, title: string) {
  const url = await renderFlowImage(container, bounds, "png");
  const w = window.open("", "_blank");
  if (!w) throw new Error("popup blocked");
  const safe = title.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
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
