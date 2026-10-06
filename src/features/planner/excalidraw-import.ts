"use client";
import { toast } from "sonner";
import type { PlanDocument, PlanNode } from "@/domain/plan";
import type { Imported } from "./excalidraw";
import { fromExcalidraw } from "./excalidraw";
import { readSceneFile } from "./excalidraw-file";

/**
 * Uploads the images of an imported drawing and points their nodes at them. Images that fail to
 * upload are left out (with a warning).
 */
export async function withUploadedImages(nodes: PlanNode[], images: Imported["images"]): Promise<PlanNode[]> {
  if (!images.length) return nodes;
  const t = toast.loading("Enviando imagens…");
  const urls = new Map<string, string>();
  await Promise.all(
    images.map(async ({ nodeId, file }) => {
      try {
        const blob = await (await fetch(file.dataURL)).blob();
        const ext = blob.type.split("/")[1]?.replace("svg+xml", "svg") || "png";
        const fd = new FormData();
        fd.set("file", new File([blob], `excalidraw-${file.id}.${ext}`, { type: blob.type }));
        const res = await fetch("/api/assets", { method: "POST", body: fd });
        const body = (await res.json().catch(() => ({}))) as { url?: string };
        if (res.ok && body.url) urls.set(nodeId, body.url);
      } catch {}
    }),
  );
  toast.dismiss(t);
  if (urls.size < images.length) toast.error("Algumas imagens não puderam ser enviadas.");
  return nodes.filter((n) => n.kind !== "image" || urls.has(n.id)).map((n) => (urls.has(n.id) ? { ...n, data: { ...n.data, image: urls.get(n.id) } } : n));
}

/** The file's name without the Excalidraw and image extensions. */
export function sceneName(file: { name: string }): string {
  return file.name.replace(/(\.excalidraw)?(\.(png|svg|json))?$/i, "").trim().slice(0, 80);
}

/**
 * A new plan's export payload (what `importPlanAction` reads) from an Excalidraw file, or null
 * when the file holds no drawing.
 */
export async function planPayloadFromFile(file: File): Promise<string | null> {
  const scene = await readSceneFile(file);
  if (!scene) return null;
  const r = fromExcalidraw(scene);
  if (!r.nodes.length) return null;
  const nodes = await withUploadedImages(r.nodes, r.images);
  const ids = new Set(nodes.map((n) => n.id));
  const document: Omit<PlanDocument, "schemaVersion"> = {
    nodes,
    edges: r.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    viewport: { x: 0, y: 0, zoom: 1 },
    ...(r.layers.length ? { layers: [{ id: "base", name: "Base", visible: true }, ...r.layers] } : {}),
    ...(r.views.length ? { views: r.views } : {}),
  };
  return JSON.stringify({ format: "waypoint-plan", plan: { title: r.title || sceneName(file) || "Desenho do Excalidraw" }, document });
}
