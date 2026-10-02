"use client";
import * as React from "react";
import { toast } from "sonner";
import { Globe, LayoutGrid, Link2, List, Loader2, Lock, Rows3, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { createCollectionAction, updateCollectionAction } from "@/app/(app)/links/actions";
import { COLLECTION_COLORS, COLLECTION_ICONS, CollectionTile, DEFAULT_COLOR } from "./collection-style";
import type { TreeNode, ViewMode, Visibility } from "./types";

export type CollectionDialogState = { mode: "create"; parent: { id: string; name: string } | null } | { mode: "edit"; node: TreeNode } | null;

type EditableVisibility = "workspace" | "private" | "link" | "public";

export const VISIBILITY_OPTIONS: { value: EditableVisibility; label: string; sub: string; icon: React.ReactNode }[] = [
  { value: "workspace", label: "Workspace", sub: "Todos os membros do workspace", icon: <Users /> },
  { value: "private", label: "Privado", sub: "Só você", icon: <Lock /> },
  { value: "link", label: "Qualquer pessoa com o link", sub: "Somente leitura, sem login", icon: <Link2 /> },
  { value: "public", label: "Público", sub: "Aberto a qualquer pessoa", icon: <Globe /> },
];

export function VisibilityChoice({ value, onChange }: { value: EditableVisibility; onChange: (v: EditableVisibility) => void }) {
  return (
    <div role="radiogroup" aria-label="Visibilidade" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {VISIBILITY_OPTIONS.map((o) => {
        const on = o.value === value;
        return (
          <label
            key={o.value}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-[10px] border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
              on ? "border-accent bg-accent-soft" : "border-line-2 bg-surface hover:bg-surface-2",
            )}
          >
            <input type="radio" name="visibility" checked={on} onChange={() => onChange(o.value)} className="sr-only" />
            <span className={cn("mt-0.5 [&_svg]:size-4", on ? "text-accent-ink" : "text-muted")} aria-hidden>
              {o.icon}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className={cn("text-[13px] font-medium", on ? "text-accent-ink" : "text-ink")}>{o.label}</span>
              <span className="text-xs text-muted">{o.sub}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

const asEditable = (v: Visibility): EditableVisibility => (v === "specific" ? "workspace" : v);

export function CollectionDialog({ state, onClose, onCreated }: { state: CollectionDialogState; onClose: () => void; onCreated?: (id: string) => void }) {
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      {state && (
        <DialogContent
          title={state.mode === "edit" ? "Editar coleção" : state.parent ? "Nova subcoleção" : "Nova coleção"}
          description={state.mode === "create" && state.parent ? `Dentro de “${state.parent.name}”` : undefined}
          className="max-w-[560px]"
        >
          <CollectionForm key={state.mode === "edit" ? state.node.id : "new"} state={state} onClose={onClose} onCreated={onCreated} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function CollectionForm({ state, onClose, onCreated }: { state: NonNullable<CollectionDialogState>; onClose: () => void; onCreated?: (id: string) => void }) {
  const node = state.mode === "edit" ? state.node : null;
  const [name, setName] = React.useState(node?.name ?? "");
  const [description, setDescription] = React.useState(node?.description ?? "");
  const [icon, setIcon] = React.useState(node?.icon ?? "folder");
  const [color, setColor] = React.useState(node?.color ?? (state.mode === "create" ? "blue" : DEFAULT_COLOR));
  const [defaultView, setDefaultView] = React.useState<ViewMode>(node?.defaultView ?? "cards");
  const [visibility, setVisibility] = React.useState<EditableVisibility>(node ? asEditable(node.visibility) : "workspace");
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Dê um nome à coleção.");
      return;
    }
    setSaving(true);
    const input = {
      name: name.trim(),
      description: description.trim() || null,
      icon,
      color: color as keyof typeof COLLECTION_COLORS as "blue",
      defaultView,
      visibility,
    };
    const res = node ? await updateCollectionAction(node.id, input) : await createCollectionAction({ ...input, parentId: state.mode === "create" ? (state.parent?.id ?? null) : null });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(node ? "Coleção atualizada" : "Coleção criada");
    onClose();
    const newId = (res.data as { id?: string } | undefined)?.id;
    if (newId) onCreated?.(newId);
  };

  return (
    <form
      className="flex min-h-0 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          save();
        }
      }}
    >
      <DialogBody className="gap-4 pt-3">
        <div className="flex items-end gap-3">
          <CollectionTile icon={icon} color={color} size={38} />
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="col-name">Nome</Label>
            <Input id="col-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Frontend, Leituras, Viagem a Lisboa" className="h-[38px]" maxLength={120} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="col-desc">Descrição</Label>
          <Textarea id="col-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional — aparece abaixo do título." />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-ink-2" id="col-icon-label">
            Ícone
          </span>
          <div role="radiogroup" aria-labelledby="col-icon-label" className="grid grid-cols-8 gap-1.5 sm:grid-cols-12">
            {Object.entries(COLLECTION_ICONS).map(([key, { icon: Icon, label }]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={icon === key}
                aria-label={label}
                title={label}
                onClick={() => setIcon(key)}
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-lg border text-ink-2 transition-colors",
                  icon === key ? "border-accent bg-accent-soft text-accent-ink" : "border-transparent hover:bg-hover",
                )}
              >
                <Icon className="size-4" strokeWidth={1.75} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-ink-2" id="col-color-label">
            Cor
          </span>
          <div role="radiogroup" aria-labelledby="col-color-label" className="flex flex-wrap gap-2">
            {Object.entries(COLLECTION_COLORS).map(([key, c]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={color === key}
                aria-label={c.label}
                title={c.label}
                onClick={() => setColor(key)}
                className={cn("h-7 w-7 rounded-full border-2 transition-transform", color === key ? "scale-110 border-ink" : "border-transparent hover:scale-105")}
                style={{ background: c.tint, boxShadow: `inset 0 0 0 6px ${c.tint}, inset 0 0 0 14px ${c.ink}` }}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-ink-2">Visualização padrão</span>
          <Segmented<ViewMode>
            label="Visualização padrão"
            value={defaultView}
            onChange={setDefaultView}
            className="self-start"
            options={[
              { value: "cards", label: "Cards", icon: <LayoutGrid /> },
              { value: "compact", label: "Compacto", icon: <Rows3 /> },
              { value: "list", label: "Lista", icon: <List /> },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-ink-2">Visibilidade</span>
          <VisibilityChoice value={visibility} onChange={setVisibility} />
        </div>
      </DialogBody>
      <DialogFooter className="justify-end">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
          {saving && <Loader2 className="animate-spin" />}
          {node ? "Salvar" : "Criar coleção"}
        </Button>
      </DialogFooter>
    </form>
  );
}
