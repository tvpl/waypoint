"use client";
import { useEffect, useState } from "react";
import { Folder, GripVertical, Link2, Workflow } from "lucide-react";
import type { NodeKind, ResourceRef } from "@/domain/plan";
import { SiteIcon } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { ResolvedResource, ResourceSearchItem } from "./resource-types";

export const DND_MIME = "application/x-waypoint";

export type DragPayload = { type: "kind"; kind: NodeKind } | { type: "resource"; ref: ResourceRef; resource: ResolvedResource };

export function setDragPayload(e: React.DragEvent, payload: DragPayload) {
  e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "copy";
}

export function readDragPayload(e: React.DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(DND_MIME);
    return raw ? (JSON.parse(raw) as DragPayload) : null;
  } catch {
    return null;
  }
}

/** Debounced search against /api/resources/search. Empty query → recent items. */
export function useResourceSearch(q: string, opts: { limit?: number; exclude?: string; enabled?: boolean } = {}) {
  const [items, setItems] = useState<ResourceSearchItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const enabled = opts.enabled ?? true;
  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const sp = new URLSearchParams({ q, limit: String(opts.limit ?? 4) });
        if (opts.exclude) sp.set("exclude", opts.exclude);
        const res = await fetch(`/api/resources/search?${sp}`, { signal: ctrl.signal });
        if (res.ok) setItems(((await res.json()) as { items: ResourceSearchItem[] }).items);
      } catch {
        /* aborted / offline */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, q ? 220 : 0);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, opts.limit, opts.exclude, enabled]);
  return { items, loading };
}

export function ResourceIcon({ resource, size = 26 }: { resource: ResolvedResource; size?: number }) {
  if (resource.kind === "favorite" || resource.kind === "url") return <SiteIcon src={resource.favicon} label={resource.title} size={size} />;
  const Icon = resource.kind === "plan" ? Workflow : resource.kind === "collection" ? Folder : Link2;
  const tint = resource.kind === "plan" ? "bg-accent-soft text-accent-ink" : resource.kind === "collection" ? "bg-amber-bg text-amber-ink" : "bg-subtle text-ink-2";
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-chip", tint)} style={{ width: size, height: size }} aria-hidden>
      <Icon style={{ width: size * 0.54, height: size * 0.54 }} strokeWidth={1.75} />
    </span>
  );
}

export function ResourceRow({
  item,
  onPick,
  draggable,
  active,
}: {
  item: ResourceSearchItem;
  onPick?: (item: ResourceSearchItem) => void;
  draggable?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={draggable ? (e) => setDragPayload(e, { type: "resource", ref: item.ref, resource: item.resource }) : undefined}
      onClick={() => onPick?.(item)}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-lg px-2 py-[7px] text-left outline-none hover:bg-surface-2 focus-visible:bg-accent-soft",
        draggable && "cursor-grab active:cursor-grabbing",
        active && "bg-accent-soft",
      )}
      title={draggable ? "Arraste para o canvas ou clique para adicionar" : undefined}
    >
      <ResourceIcon resource={item.resource} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-medium text-ink">{item.resource.title}</span>
        <span className="truncate text-caption text-muted">{item.resource.subtitle}</span>
      </span>
      {draggable && <GripVertical className="size-3.5 shrink-0 text-muted opacity-60 group-hover:opacity-100" aria-hidden />}
    </button>
  );
}
