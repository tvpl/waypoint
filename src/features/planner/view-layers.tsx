"use client";
import * as React from "react";
import { ArrowRight, Check, Eye, EyeOff, GitCompareArrows, Layers, Link2, Waves, X } from "lucide-react";
import { toast } from "sonner";
import { activeView, compareOptions, compareSideLayers, layersOf, layerVisibility, viewVisibility } from "@/domain/layers";
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
  onCompare,
}: {
  doc: Pick<PlanDocument, "layers" | "views">;
  overrides: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  /** Starts comparing two views (offered when there is something to compare). */
  onCompare?: () => void;
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
        {onCompare && compareOptions(doc).length >= 2 && (
          <div className="border-t border-line px-2 py-1.5">
            <button type="button" className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-body text-ink-2 hover:bg-surface-2 hover:text-ink" onClick={onCompare}>
              <GitCompareArrows className="size-4 shrink-0" /> Comparar visões…
            </button>
          </div>
        )}
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
                  url.searchParams.delete("compare");
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

// ------------------------------------------------------------------ comparing views

export type CompareState = { a: string; b: string; show: "a" | "diff" | "b" };

/** Layer visibility of one side of a comparison (see compareSideLayers). */
export function sideVisibility(doc: Pick<PlanDocument, "layers" | "views">, side: string): Record<string, boolean> {
  const on = compareSideLayers(doc, side) ?? new Set<string>();
  return Object.fromEntries(layersOf(doc).map((l) => [l.id, on.has(l.id)]));
}

/** A first comparison: the first two saved views, else the base against the first layer. */
export function defaultCompare(doc: Pick<PlanDocument, "layers" | "views">): CompareState | null {
  const opts = compareOptions(doc);
  if (opts.length < 2) return null;
  return { a: opts[0].id, b: opts[1].id, show: "diff" };
}

/** `?compare=v:a,v:b` (shareable link), when both sides exist. */
export function parseCompare(doc: Pick<PlanDocument, "layers" | "views">, param: string | null | undefined): CompareState | null {
  const [a, b] = (param ?? "").split(",");
  if (!a || !b || !compareSideLayers(doc, a) || !compareSideLayers(doc, b)) return null;
  return { a, b, show: "diff" };
}

const LEGEND: { key: "added" | "removed" | "changed"; label: string; sign: string; color: string }[] = [
  { key: "added", label: "entrou", sign: "+", color: "#30A46C" },
  { key: "removed", label: "saiu", sign: "−", color: "#E5484D" },
  { key: "changed", label: "mudou", sign: "~", color: "#F5A524" },
];

/** Top bar of the comparison: the two sides, what to show, the counts, and a shareable link. */
export function CompareBar({
  doc,
  value,
  counts,
  onChange,
  onClose,
}: {
  doc: Pick<PlanDocument, "layers" | "views">;
  value: CompareState;
  counts: Record<"added" | "removed" | "changed", number>;
  onChange: (next: CompareState) => void;
  onClose: () => void;
}) {
  const opts = compareOptions(doc);
  const nameOf = (id: string) => opts.find((o) => o.id === id)?.name ?? "";
  const select = "h-7 min-w-0 max-w-[150px] truncate rounded-md border border-line bg-surface px-1.5 text-caption font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
  const seg = (on: boolean) => cn("inline-flex h-7 items-center rounded-md px-2.5 text-caption font-medium transition-colors", on ? "bg-surface text-ink shadow-rest" : "text-ink-2 hover:text-ink");
  return (
    <div
      role="toolbar"
      aria-label="Comparar visões"
      className="wp-no-print wp-no-export absolute left-1/2 top-3 z-10 flex max-w-[calc(100%-24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 rounded-xl border border-line bg-surface px-2.5 py-1.5 shadow-float"
    >
      <span className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[.06em] text-muted">
        <GitCompareArrows className="size-3.5" aria-hidden /> Comparar
      </span>
      <select aria-label="Antes (A)" className={select} value={value.a} onChange={(e) => onChange({ ...value, a: e.target.value })}>
        {opts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <ArrowRight className="size-3.5 shrink-0 text-muted" aria-hidden />
      <select aria-label="Depois (B)" className={select} value={value.b} onChange={(e) => onChange({ ...value, b: e.target.value })}>
        {opts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <div role="radiogroup" aria-label="Mostrar" className="flex items-center gap-0.5 rounded-lg bg-subtle p-0.5">
        {(
          [
            ["a", "A"],
            ["diff", "Diferença"],
            ["b", "B"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={value.show === id} className={seg(value.show === id)} onClick={() => onChange({ ...value, show: id })} title={id === "a" ? nameOf(value.a) : id === "b" ? nameOf(value.b) : undefined}>
            {label}
          </button>
        ))}
      </div>
      <span className="flex items-center gap-2 text-caption tabular-nums" aria-live="polite">
        {LEGEND.map((l) => (
          <span key={l.key} className={cn("inline-flex items-center gap-1", !counts[l.key] && "text-muted")} title={`${counts[l.key]} ${l.label}`}>
            <span className="size-2 rounded-full" style={{ background: l.color }} aria-hidden />
            {l.sign}
            {counts[l.key]} <span className="sr-only sm:not-sr-only">{l.label}</span>
          </span>
        ))}
      </span>
      <span className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Copiar link desta comparação"
          title="Copiar link desta comparação"
          className="inline-flex size-7 items-center justify-center rounded-md text-ink-2 hover:bg-hover hover:text-ink"
          onClick={async () => {
            const url = new URL(window.location.href);
            url.searchParams.delete("view");
            url.searchParams.set("compare", `${value.a},${value.b}`);
            await navigator.clipboard.writeText(url.toString()).catch(() => {});
            toast.success("Link da comparação copiado");
          }}
        >
          <Link2 className="size-3.5" />
        </button>
        <button type="button" aria-label="Fechar comparação" title="Fechar comparação" className="inline-flex size-7 items-center justify-center rounded-md text-ink-2 hover:bg-hover hover:text-ink" onClick={onClose}>
          <X className="size-3.5" />
        </button>
      </span>
    </div>
  );
}
