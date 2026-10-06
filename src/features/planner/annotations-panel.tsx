"use client";
import * as React from "react";
import { CircleCheck, CircleHelp, Eye, EyeOff, Highlighter, ListTodo, MapPin, MessageSquareText, Brackets, StickyNote, TriangleAlert, MessagesSquare, Unlink } from "lucide-react";
import { ANNOTATION_CATEGORIES, ANNOTATION_TYPES, type AnnotationCategory, type AnnotationType } from "@/domain/plan";
import type { PlanFlowNode } from "@/domain/canvas-adapter";
import { Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { CATEGORY_META, TYPE_META, annotationOf, legend, type AnnotationView } from "./annotations";
import { Switch } from "./switch";

export const CATEGORY_ICON = { note: StickyNote, question: CircleHelp, risk: TriangleAlert, decision: CircleCheck, todo: ListTodo } as const;
export const TYPE_ICON = { pin: MapPin, callout: MessageSquareText, bracket: Brackets, highlight: Highlighter } as const;

const chip = "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-caption font-medium transition-colors";

export function CategoryPicker({ value, onChange }: { value: AnnotationCategory; onChange: (c: AnnotationCategory) => void }) {
  return (
    <div role="radiogroup" aria-label="Tipo de anotação" className="flex flex-wrap gap-1">
      {ANNOTATION_CATEGORIES.map((c) => {
        const m = CATEGORY_META[c];
        const Icon = CATEGORY_ICON[c];
        const on = value === c;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(c)}
            className={cn(chip, on ? "border-transparent text-white" : "border-line text-ink-2 hover:border-line-2 hover:text-ink")}
            style={on ? { background: m.color } : undefined}
          >
            <Icon className="size-3.5" style={on ? undefined : { color: m.color }} aria-hidden /> {m.label}
          </button>
        );
      })}
    </div>
  );
}

export function TypePicker({ value, onChange }: { value: AnnotationType; onChange: (t: AnnotationType) => void }) {
  return (
    <div role="radiogroup" aria-label="Forma da anotação" className="flex gap-0.5">
      {ANNOTATION_TYPES.map((t) => {
        const Icon = TYPE_ICON[t];
        const on = value === t;
        return (
          <Tooltip key={t} content={TYPE_META[t].hint} side="top">
            <button
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={TYPE_META[t].label}
              onClick={() => onChange(t)}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-body transition-colors [&_svg]:size-4", on ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
            >
              <Icon strokeWidth={1.75} /> {TYPE_META[t].label}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** While the annotation tool (N) is on: what the next one is, and how to place it. */
export function AnnotateBar({ barCls, children }: { barCls: string; children?: React.ReactNode }) {
  const ed = useEditor();
  const s = ed.annotStyle;
  const hint = s.type === "pin" || s.type === "callout" ? "Clique no elemento ou no ponto" : "Arraste sobre a parte do desenho";
  return (
    <div className={cn(barCls, "flex-wrap justify-center")} role="toolbar" aria-label="Anotar">
      <TypePicker value={s.type} onChange={(type) => ed.setAnnotStyle({ type }, { restyle: false })} />
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <CategoryPicker value={s.category} onChange={(category) => ed.setAnnotStyle({ category }, { restyle: false })} />
      <span className="hidden px-2 text-caption text-muted 2xl:inline">{hint}</span>
      {children}
    </div>
  );
}

/**
 * The dock's "Anotações": show or hide them all (⇧N), by kind or the resolved ones, review mode,
 * and the legend (numbered pins first) to jump to each.
 */
export function AnnotationsButton({ className }: { className: string }) {
  const ed = useEditor();
  const items = React.useMemo(() => legend(ed.nodes.map((n) => ({ id: n.id, kind: n.type!, data: n.data, x: n.position.x, y: n.position.y }))), [ed.nodes]);
  return (
    <AnnotationsMenu
      className={className}
      items={items}
      view={ed.annotationView}
      setView={ed.setAnnotationView}
      review={ed.review}
      setReview={ed.setReview}
      onFocus={ed.focusNode}
      side="top"
    />
  );
}

type LegendItem = ReturnType<typeof legend<{ id: string; kind: PlanFlowNode["type"] & string; data: PlanFlowNode["data"]; x: number; y: number }>>[number];

/** Shared by the editor's dock and the reading view. */
export function AnnotationsMenu({
  className,
  items,
  view: v,
  setView,
  review,
  setReview,
  onFocus,
  side = "top",
  label,
}: {
  className: string;
  items: LegendItem[];
  view: AnnotationView;
  setView: (patch: Partial<AnnotationView>) => void;
  review?: boolean;
  setReview?: (on: boolean) => void;
  onFocus: (id: string) => void;
  side?: "top" | "bottom";
  label?: React.ReactNode;
}) {
  const count = items.filter((i) => !i.annotation.resolved).length;
  const toggleCat = (c: AnnotationCategory) => {
    const next = new Set(v.categories);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    setView({ categories: next, show: true });
  };
  return (
    <Popover>
      <Tooltip content={v.show ? "Anotações (⇧N oculta)" : "Anotações ocultas (⇧N mostra)"} side={side}>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Anotações" className={cn(className, "relative", !v.show && "text-muted")}>
            {v.show ? <MessagesSquare strokeWidth={1.75} /> : <EyeOff strokeWidth={1.75} />}
            {label}
            {count > 0 && <span className="pointer-events-none absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-white tabular-nums">{count}</span>}
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side={side} sideOffset={12} className="flex max-h-[min(560px,70vh)] w-[320px] flex-col gap-3 overflow-hidden p-0">
        <div className="flex flex-col gap-3 px-4 pt-3.5">
          <div className="flex items-center justify-between">
            <span className="text-body font-semibold">Anotações</span>
            <label className="flex items-center gap-2 text-caption text-ink-2">
              Mostrar
              <Switch checked={v.show} onChange={(show) => setView({ show })} label="Mostrar anotações" />
            </label>
          </div>
          <div className="flex flex-wrap gap-1">
            {ANNOTATION_CATEGORIES.map((c) => {
              const m = CATEGORY_META[c];
              const Icon = CATEGORY_ICON[c];
              const on = v.categories.has(c);
              return (
                <button key={c} type="button" aria-pressed={on} onClick={() => toggleCat(c)} className={cn(chip, on ? "border-line bg-surface-2 text-ink" : "border-dashed border-line text-muted line-through")}>
                  <Icon className="size-3.5" style={{ color: on ? m.color : undefined }} aria-hidden /> {m.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3 text-caption text-ink-2">
            <label className="flex items-center gap-2">
              <Switch checked={v.resolved} onChange={(resolved) => setView({ resolved })} label="Mostrar resolvidas" /> Resolvidas
            </label>
            {setReview && (
              <label className="flex items-center gap-2">
                <Switch checked={!!review} onChange={setReview} label="Modo revisão" /> Modo revisão
              </label>
            )}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-line px-2 py-2">
          {items.length === 0 ? (
            <p className="px-2 py-2 text-caption leading-4 text-muted">
              Use <b className="font-semibold">Anotar (N)</b> para marcar pontos, apontar elementos, destacar áreas ou colocar uma chave sobre uma parte — sem mexer no desenho.
            </p>
          ) : (
            items.map(({ node, number, annotation }) => {
              const m = CATEGORY_META[annotation.category];
              const Icon = number ? null : TYPE_ICON[annotation.type];
              return (
                <button key={node.id} type="button" onClick={() => onFocus(node.id)} className={cn("flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2", annotation.resolved && "opacity-55")}>
                  <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: m.color }} aria-hidden>
                    {number ?? (Icon && <Icon className="size-3" />)}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className={cn("truncate text-body", node.data.title ? "text-ink" : "text-muted")}>{node.data.title || "Sem texto"}</span>
                    {node.data.description && <span className="line-clamp-2 text-caption text-ink-2">{node.data.description}</span>}
                    <span className="text-caption text-muted">
                      {m.label}
                      {annotation.resolved ? " · resolvida" : ""}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Properties of an annotation: what kind, its text, what it is attached to, resolved, discuss. */
export function AnnotationFields({ node }: { node: PlanFlowNode }) {
  const ed = useEditor();
  const a = annotationOf(node);
  const set = (patch: Partial<typeof a>) => ed.updateNodeData(node.id, { annotation: { ...a, ...patch } });
  const [desc, setDesc] = React.useState(node.data.description ?? "");
  const parent = node.parentId ? ed.nodes.find((n) => n.id === node.parentId) : undefined;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-caption font-medium text-muted">Tipo</span>
        <CategoryPicker value={a.category} onChange={(category) => set({ category })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-caption font-medium text-muted">Forma</span>
        <div className="flex flex-wrap gap-1">
          {ANNOTATION_TYPES.map((t) => {
            const Icon = TYPE_ICON[t];
            return (
              <button
                key={t}
                type="button"
                aria-pressed={a.type === t}
                onClick={() => {
                  if (t === a.type) return;
                  // Keep it where it was; take the new form's size.
                  const [w, h] = TYPE_META[t].size;
                  ed.updateNodeData(node.id, { annotation: { ...a, type: t } });
                  ed.updateNodeSize(node.id, { width: w, height: h });
                }}
                className={cn(chip, a.type === t ? "border-accent-line bg-accent-soft text-accent-ink" : "border-line text-ink-2 hover:border-line-2")}
              >
                <Icon className="size-3.5" aria-hidden /> {TYPE_META[t].label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`ann-${node.id}`} className="text-caption font-medium text-muted">
          Detalhes
        </label>
        <Textarea
          id={`ann-${node.id}`}
          rows={3}
          maxLength={5000}
          className="min-h-[72px] rounded-lg text-body"
          placeholder="Contexto, links, próximos passos…"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc !== (node.data.description ?? "") && ed.updateNodeData(node.id, { description: desc })}
        />
      </div>
      {parent && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-body">
          <span className="min-w-0 truncate">
            Presa a <b className="font-semibold">{parent.data.title || "elemento"}</b>
          </span>
          <button type="button" className="inline-flex items-center gap-1 text-caption font-medium text-accent-ink hover:underline" onClick={() => ed.detach(node.id)}>
            <Unlink className="size-3.5" /> Soltar
          </button>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-body">
          <Switch checked={!!a.resolved} onChange={(resolved) => set({ resolved: resolved || undefined })} label="Resolvida" /> Resolvida
        </label>
        <button type="button" className="inline-flex items-center gap-1.5 text-caption font-medium text-accent-ink hover:underline" onClick={() => ed.openComments(node.id)}>
          <MessagesSquare className="size-3.5" /> Discutir
        </button>
      </div>
      {!ed.annotationView.show && (
        <button type="button" className="inline-flex items-center gap-1.5 self-start text-caption text-muted hover:text-ink" onClick={() => ed.setAnnotationView({ show: true })}>
          <Eye className="size-3.5" /> Mostrar anotações
        </button>
      )}
    </div>
  );
}
