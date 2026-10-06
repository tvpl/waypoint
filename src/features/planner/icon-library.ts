"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { glyphSchema } from "@/domain/plan";
import type { IconsResponse } from "@/app/api/icons/route";
import type { IconPick } from "./editor-context";

/** An icon dropped on the canvas (checked: a drag can come from another page). */
export const iconPickSchema = z.object({
  glyph: glyphSchema,
  name: z.string().max(120),
  set: z.enum(["ui", "brand"]),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export type IconResult = IconsResponse["icons"][number];

export const toPick = (i: IconResult): IconPick => ({ glyph: i.glyph, name: i.name, set: i.set, ...(i.color ? { color: i.color } : {}) });

/** Debounced icon search (interface icons and brand logos). */
export function useIconSearch(q: string, set: "ui" | "brand" | undefined, enabled = true) {
  const [icons, setIcons] = useState<IconResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const sp = new URLSearchParams({ q });
        if (set) sp.set("set", set);
        const res = await fetch(`/api/icons?${sp}`, { signal: ctrl.signal });
        if (res.ok) setIcons(((await res.json()) as IconsResponse).icons);
      } catch {
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 160);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, set, enabled]);
  return { icons, loading };
}
