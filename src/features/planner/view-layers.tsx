"use client";
import * as React from "react";
import { Check, Eye, EyeOff, Layers, Link2, Waves } from "lucide-react";
import { toast } from "sonner";
import { activeView, layersOf, layerVisibility, viewVisibility } from "@/domain/layers";
import type { PlanDocument } from "@/domain/plan";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * View mode: lets whoever reads the plan switch layers and saved views on and off, for
 * themselves only (the document keeps its own defaults).
 */
export function ViewLayers({
  doc,
  overrides,
  onChange,
}: {
  doc: Pick<PlanDocument, "layers" | "views">;
  overrides: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
}) {
  const layers = layersOf(doc);
  const views = doc.views ?? [];
  const vis = layerVisibility(doc, overrides);
  const current = activeView(doc, vis);
  const shown = layers.filter((l) => vis.get(l.id)).length;
  const allOn = shown === layers.length;
  if (layers.length < 2 && views.length === 0) return null;

  const chip = (on: boolean) =>
    cn(
      "inline-flex h-7 max-w-full items-center gap-1.5 truncate rounded-full border px-2.5 text-caption font-medium transition-colors",
      on ? "border-accent-line bg-accent-soft text-accent-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2",
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="wp-no-print wp-no-export absolute right-3 top-3 z-10 inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-body font-medium text-ink-2 shadow-float transition-colors hover:text-ink"
          aria-label="Camadas e visões"
        >
          <Layers className="size-4" strokeWidth={1.8} />
          <span className="max-w-[160px] truncate">{current ? views.find((v) => v.id === current)?.name : allOn ? "Camadas" : `${shown} de ${layers.length} camadas`}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[280px] p-0">
        {views.length > 0 && (
          <div className="flex flex-col gap-2 border-b border-line px-4 py-3">
            <span className="text-caption font-semibold uppercase tracking-[.06em] text-muted">Visões</span>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={chip(allOn && !current)} onClick={() => onChange(Object.fromEntries(layers.map((l) => [l.id, true])))}>
                Tudo
              </button>
              {views.map((v) => (
                <button key={v.id} type="button" className={chip(current === v.id)} onClick={() => onChange(viewVisibility(doc, v.id) ?? {})} title={v.name}>
                  {current === v.id && <Check className="size-3 shrink-0" />}
                  <span className="truncate">{v.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <ul className="flex flex-col py-1.5">
          {[...layers].reverse().map((l) => {
            const on = !!vis.get(l.id);
            return (
              <li key={l.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ ...Object.fromEntries(vis), [l.id]: !on })}
                  className={cn("flex h-9 w-full items-center gap-2.5 px-4 text-left text-body hover:bg-surface-2", !on && "text-muted")}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: l.color ?? "var(--muted)", opacity: on ? 1 : 0.4 }} aria-hidden />
                  <span className={cn("flex-1 truncate", !on && "line-through decoration-muted/60")}>{l.name}</span>
                  {l.animate && <Waves className="size-3.5 shrink-0 text-muted" aria-label="Fluxo animado" />}
                  {on ? <Eye className="size-4 shrink-0 text-ink-2" /> : <EyeOff className="size-4 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
        {(current || Object.keys(overrides).length > 0) && (
          <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5">
            {Object.keys(overrides).length > 0 ? (
              <button type="button" className="text-caption font-medium text-accent-ink hover:underline" onClick={() => onChange({})}>
                Restaurar padrão
              </button>
            ) : (
              <span />
            )}
            {current && (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-caption font-medium text-ink-2 hover:text-ink"
                onClick={async () => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("view", current);
                  await navigator.clipboard.writeText(url.toString()).catch(() => {});
                  toast.success("Link desta visão copiado");
                }}
              >
                <Link2 className="size-3.5" /> Copiar link
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
