"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { deleteShortcutAction, reorderShortcutsAction, saveShortcutAction } from "@/app/(app)/dashboard-actions";
import {
  isExternal,
  MAX_SHORTCUTS,
  SHORTCUT_COLORS,
  SHORTCUT_ICONS,
  SHORTCUT_PRESETS,
  shortcutInputSchema,
  type HomeShortcut,
  type ShortcutColor,
  type ShortcutIcon,
} from "@/domain/dashboard";
import { cn } from "@/lib/utils";
import { ShortcutGlyph } from "./shortcut-icon";

type Draft = { title: string; href: string; icon: ShortcutIcon; color: ShortcutColor };
const EMPTY: Draft = { title: "", href: "", icon: "link", color: "accent" };
const COLOR_LABEL: Record<ShortcutColor, string> = { accent: "Cobalto", lavender: "Lavanda", mint: "Menta", peach: "Pêssego", sky: "Céu", rose: "Rosa", sand: "Areia" };

/** "Atalhos": personal tiles to any Waypoint page or external site; editable, reorderable. */
export function ShortcutsPanel({ initial }: { initial: HomeShortcut[] }) {
  const [items, setItems] = React.useState(initial);
  const [editing, setEditing] = React.useState(false);
  const [dialog, setDialog] = React.useState<HomeShortcut | "new" | null>(null);
  const [dragged, setDragged] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  React.useEffect(() => setItems(initial), [initial]);

  const apply = (fn: () => Promise<{ ok: true; data: HomeShortcut[] } | { ok: false; error: string }>, success?: string, rollback?: HomeShortcut[]) =>
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) {
          toast.error(r.error);
          if (rollback) setItems(rollback);
          return;
        }
        setItems(r.data);
        if (success) toast.success(success);
      } catch {
        toast.error("Não foi possível conectar. Tente novamente.");
        if (rollback) setItems(rollback);
      }
    });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const before = items;
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    setItems(next);
    apply(() => reorderShortcutsAction(next.map((s) => s.id)), undefined, before);
  };

  return (
    <section className="flex flex-col gap-3" data-tour="home-shortcuts" aria-label="Atalhos">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-body font-semibold text-ink-2">Atalhos</h2>
        <div className="flex items-center gap-1">
          {items.length > 0 && (
            <Button size="sm" variant={editing ? "soft" : "ghost"} onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
              {editing ? <Check /> : <Pencil />} {editing ? "Pronto" : "Editar"}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setDialog("new")} disabled={items.length >= MAX_SHORTCUTS}>
            <Plus /> Adicionar
          </Button>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-card border border-dashed border-line-2 px-4 py-4">
          <p className="text-body text-muted">Crie atalhos para o que você abre todo dia — uma visão de tarefas, uma coleção, um site. Comece por uma sugestão:</p>
          <div className="flex flex-wrap gap-2">
            {SHORTCUT_PRESETS.slice(0, 6).map((p) => (
              <button
                key={p.href}
                type="button"
                disabled={pending}
                onClick={() => apply(() => saveShortcutAction(p), `Atalho “${p.title}” adicionado.`)}
                className="group inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface pl-1 pr-3 text-body transition-[border-color,box-shadow] hover:border-accent-line hover:shadow-raise"
              >
                <ShortcutGlyph icon={p.icon} color={p.color} size={28} className="rounded-full" />
                {p.title}
                <Plus className="size-3.5 text-muted transition-colors group-hover:text-accent-ink" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {items.map((s, i) => {
            const external = isExternal(s.href);
            const body = (
              <>
                <ShortcutGlyph icon={s.icon} color={s.color} className="group-hover/tile:scale-105" />
                <span className="min-w-0 flex-1 truncate text-body font-medium">{s.title}</span>
                {external && <ArrowUpRight className="size-3.5 shrink-0 text-muted" aria-label="Abre em nova aba" />}
              </>
            );
            const tile = "group/tile flex h-[60px] items-center gap-2.5 rounded-card border border-line bg-surface px-3 shadow-rest transition-[box-shadow,transform,border-color] duration-150";
            return (
              <li
                key={s.id}
                className={cn("relative animate-in", dragged === s.id && "opacity-40")}
                draggable={editing}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDragged(s.id);
                }}
                onDragEnd={() => setDragged(null)}
                onDragOver={(e) => editing && dragged && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = items.findIndex((x) => x.id === dragged);
                  if (from >= 0) move(from, i);
                  setDragged(null);
                }}
              >
                {editing ? (
                  <div className={cn(tile, "cursor-grab border-dashed pr-1 active:cursor-grabbing")}>
                    <ShortcutGlyph icon={s.icon} color={s.color} />
                    <span className="min-w-0 flex-1 truncate text-body font-medium">{s.title}</span>
                    <div className="flex shrink-0 flex-col">
                      <button type="button" className="rounded p-1 text-muted hover:bg-hover hover:text-ink" aria-label={`Editar ${s.title}`} onClick={() => setDialog(s)}>
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-muted hover:bg-danger-soft hover:text-danger"
                        aria-label={`Remover ${s.title}`}
                        onClick={() => {
                          const before = items;
                          setItems(items.filter((x) => x.id !== s.id));
                          apply(() => deleteShortcutAction(s.id), "Atalho removido.", before);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <div className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-full border border-line bg-surface p-0.5 shadow-thumb">
                      <button type="button" className="rounded-full p-0.5 text-muted hover:text-ink disabled:opacity-30" aria-label="Mover para a esquerda" disabled={i === 0} onClick={() => move(i, i - 1)}>
                        <ArrowLeft className="size-3" />
                      </button>
                      <button type="button" className="rounded-full p-0.5 text-muted hover:text-ink disabled:opacity-30" aria-label="Mover para a direita" disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>
                        <ArrowRight className="size-3" />
                      </button>
                    </div>
                  </div>
                ) : external ? (
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className={cn(tile, "hover:-translate-y-px hover:border-line-2 hover:shadow-raise")} title={s.href}>
                    {body}
                  </a>
                ) : (
                  <Link href={s.href} className={cn(tile, "hover:-translate-y-px hover:border-line-2 hover:shadow-raise")} title={s.href}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {dialog && (
        <ShortcutDialog
          shortcut={dialog === "new" ? null : dialog}
          existing={items}
          busy={pending}
          onClose={() => setDialog(null)}
          onSave={(draft, id) =>
            apply(async () => {
              const r = await saveShortcutAction(draft, id);
              if (r.ok) setDialog(null);
              return r;
            }, id ? "Atalho atualizado." : "Atalho adicionado.")
          }
        />
      )}
    </section>
  );
}

function ShortcutDialog({
  shortcut,
  existing,
  busy,
  onClose,
  onSave,
}: {
  shortcut: HomeShortcut | null;
  existing: HomeShortcut[];
  busy: boolean;
  onClose: () => void;
  onSave: (draft: Draft, id?: string) => void;
}) {
  const [draft, setDraft] = React.useState<Draft>(shortcut ? { title: shortcut.title, href: shortcut.href, icon: shortcut.icon, color: shortcut.color } : EMPTY);
  const [error, setError] = React.useState("");
  const presets = SHORTCUT_PRESETS.filter((p) => !existing.some((s) => s.href === p.href));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = shortcutInputSchema.safeParse(draft);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Revise o atalho.");
    setError("");
    onSave(parsed.data, shortcut?.id);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent title={shortcut ? "Editar atalho" : "Novo atalho"} description="Um caminho do Waypoint (como /tasks?scope=today) ou um site (https://…).">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogBody>
            {!shortcut && presets.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-caption font-medium uppercase tracking-wide text-muted">Sugestões</span>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((p) => (
                    <button
                      key={p.href}
                      type="button"
                      title={p.hint}
                      onClick={() => setDraft({ title: p.title, href: p.href, icon: p.icon, color: p.color })}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-full border pl-1 pr-2.5 text-xs transition-colors",
                        draft.href === p.href ? "border-accent-line bg-accent-soft text-accent-ink" : "border-line hover:bg-hover",
                      )}
                    >
                      <ShortcutGlyph icon={p.icon} color={p.color} size={24} className="rounded-full" />
                      {p.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 rounded-card border border-line bg-surface-2 p-3">
              <ShortcutGlyph icon={draft.icon} color={draft.color} size={40} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body font-semibold">{draft.title || "Nome do atalho"}</span>
                <span className="truncate font-mono text-caption text-muted">{draft.href || "/caminho ou https://…"}</span>
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome" htmlFor="sc-title">
                <Input id="sc-title" value={draft.title} maxLength={60} autoFocus onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Ex.: Tarefas do cliente" />
              </Field>
              <Field label="Endereço" htmlFor="sc-href">
                <Input id="sc-href" value={draft.href} maxLength={2000} onChange={(e) => setDraft((d) => ({ ...d, href: e.target.value }))} placeholder="/tasks?scope=today" />
              </Field>
            </div>
            <fieldset>
              <legend className="mb-2 text-caption font-medium text-ink-2">Ícone</legend>
              <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12">
                {SHORTCUT_ICONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    aria-label={`Ícone ${icon}`}
                    aria-pressed={draft.icon === icon}
                    onClick={() => setDraft((d) => ({ ...d, icon }))}
                    className={cn("flex aspect-square items-center justify-center rounded-lg transition-colors", draft.icon === icon ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : "hover:bg-hover")}
                  >
                    <ShortcutGlyph icon={icon} color={draft.icon === icon ? draft.color : "accent"} size={28} />
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-caption font-medium text-ink-2">Cor</legend>
              <div className="flex flex-wrap gap-2">
                {SHORTCUT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={COLOR_LABEL[color]}
                    aria-label={COLOR_LABEL[color]}
                    aria-pressed={draft.color === color}
                    onClick={() => setDraft((d) => ({ ...d, color }))}
                    className={cn("rounded-full transition-transform hover:scale-110", draft.color === color && "ring-2 ring-accent ring-offset-2 ring-offset-surface")}
                  >
                    <ShortcutGlyph icon={draft.color === color ? "check" : draft.icon} color={color} size={30} className="rounded-full" />
                  </button>
                ))}
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="text-body text-danger">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" className="ml-auto" onClick={onClose} disabled={busy}>
              <X /> Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {shortcut ? "Salvar" : "Adicionar atalho"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
