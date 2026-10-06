"use client";
import * as React from "react";
import type { PlanFlowNode } from "@/domain/canvas-adapter";
import type { ComponentValue } from "@/domain/plan";
import { Input, Textarea } from "@/components/ui/input";
import { useEditor } from "../editor-context";
import { Switch } from "../switch";
import { componentDef, PACKS, type Field } from "./registry";

/** The fields a component offers (partitions, columns, variant…), edited in place. */
export function ComponentFields({ node }: { node: PlanFlowNode }) {
  const ed = useEditor();
  const ref = node.data.component;
  const def = ref ? componentDef(ref.pack, ref.type) : undefined;
  if (!ref || !def) return null;
  const props = { ...def.defaults, ...ref.props };
  const set = (key: string, value: ComponentValue) => ed.updateNodeData(node.id, { component: { ...ref, props: { ...ref.props, [key]: value } } }, `component:${node.id}:${key}`);
  return (
    <div className="flex flex-col gap-4">
      {(def.fields ?? []).map((f) => (
        <FieldInput key={f.key} field={f} value={props[f.key]} onChange={(v) => set(f.key, v)} id={`cf-${node.id}-${f.key}`} />
      ))}
    </div>
  );
}

export function componentLabel(node: PlanFlowNode): { name: string; pack: string } | null {
  const ref = node.data.component;
  const def = ref ? componentDef(ref.pack, ref.type) : undefined;
  if (!def) return null;
  return { name: def.name, pack: PACKS.find((p) => p.id === def.pack)?.name ?? "" };
}

function FieldInput({ field: f, value, onChange, id }: { field: Field; value: ComponentValue | undefined; onChange: (v: ComponentValue) => void; id: string }) {
  const label = (
    <label htmlFor={id} className="text-caption font-medium text-muted">
      {f.label}
    </label>
  );
  if (f.kind === "bool") {
    return (
      <div className="flex items-center justify-between gap-2">
        {label}
        <Switch id={id} checked={!!value} onChange={onChange} label={f.label} />
      </div>
    );
  }
  if (f.kind === "select") {
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <select id={id} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} className="h-[34px] rounded-lg border border-line bg-surface px-2.5 text-body text-ink outline-none focus:border-accent">
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (f.kind === "number") {
    const n = typeof value === "number" ? value : Number(value) || f.min;
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          {label}
          <span className="text-caption tabular-nums text-ink-2">{n}</span>
        </div>
        <input id={id} type="range" min={f.min} max={f.max} step={1} value={n} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
      </div>
    );
  }
  if (f.kind === "list") return <ListField field={f} value={value} onChange={onChange} id={id} label={label} />;
  if (f.kind === "long") {
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <LazyText id={id} multiline value={typeof value === "string" ? value : ""} onCommit={onChange} placeholder={f.placeholder} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {label}
      <LazyText id={id} value={typeof value === "string" ? value : value === undefined ? "" : String(value)} onCommit={onChange} placeholder={f.placeholder} />
    </div>
  );
}

function ListField({ field, value, onChange, id, label }: { field: Extract<Field, { kind: "list" }>; value: ComponentValue | undefined; onChange: (v: ComponentValue) => void; id: string; label: React.ReactNode }) {
  const lines = Array.isArray(value) ? value : typeof value === "string" ? value.split("\n") : [];
  return (
    <div className="flex flex-col gap-1.5">
      {label}
      <LazyText
        id={id}
        multiline
        rows={Math.min(8, Math.max(3, lines.length + 1))}
        value={lines.join("\n")}
        onCommit={(v) => onChange(v.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 60))}
        placeholder={field.placeholder}
      />
      {field.hint && <span className="text-caption text-muted">{field.hint}</span>}
    </div>
  );
}

/** Typed freely; the drawing updates as you type, one undo step per field. */
function LazyText({ id, value, onCommit, multiline, rows = 3, placeholder }: { id: string; value: string; onCommit: (v: string) => void; multiline?: boolean; rows?: number; placeholder?: string }) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  const change = (next: string) => {
    setV(next);
    onCommit(next);
  };
  return multiline ? (
    <Textarea id={id} rows={rows} value={v} placeholder={placeholder} onChange={(e) => change(e.target.value)} className="min-h-[60px] rounded-lg text-body" />
  ) : (
    <Input id={id} value={v} placeholder={placeholder} onChange={(e) => change(e.target.value)} className="h-[34px] rounded-lg text-body" />
  );
}
