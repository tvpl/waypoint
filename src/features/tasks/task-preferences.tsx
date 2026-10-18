"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Bookmark, Check, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, selectClass } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TASK_STATUSES } from "@/domain/tasks";
import { hideRulesSchema, noHideRules } from "@/domain/task-visibility";

export const viewFiltersSchema = z.object({
  scope: z.enum([
    "all",
    "today",
    "week",
    "waiting",
    "done",
    "archived",
    "followup",
  ]),
  projectId: z.string().max(64),
  query: z.string().max(1000),
  statusFilter: z.enum([...TASK_STATUSES, ""]),
  hideDone: z.boolean(),
  priority: z.enum(["", "none", "low", "medium", "high"]),
  tag: z.string().max(48),
  person: z.string().max(100),
  pending: z.enum(["", "note", "waiting", "blocked", "decision"]),
  sort: z.enum(["manual", "due", "priority"]),
  /** Hide rules of the folder when the view was saved (older views have none). */
  hide: hideRulesSchema.optional(),
});
export type ViewFilters = z.infer<typeof viewFiltersSchema>;
const fieldsSchema = z.object({
  due: z.boolean(),
  people: z.boolean(),
  tags: z.boolean(),
  progress: z.boolean(),
  priority: z.boolean(),
  pending: z.boolean(),
  project: z.boolean(),
  dependencies: z.boolean().default(true),
  followUp: z.boolean().default(true),
});
const preferencesSchema = z.object({
  density: z.union([z.literal(3), z.literal(4)]),
  limit: z.union([z.literal(0), z.literal(3), z.literal(5), z.literal(10)]),
  fields: fieldsSchema,
  collapsedColumns: z.array(z.string()).max(300),
  collapsedBlocks: z.array(z.string()).max(100),
  widths: z.record(z.string(), z.number().min(200).max(420)),
  /** "Ocultar itens": per stage, everything or only older items (see domain/task-visibility.ts). */
  hide: hideRulesSchema.default(noHideRules),
});
export type CardFields = z.infer<typeof fieldsSchema>;
export type BoardPreferences = z.infer<typeof preferencesSchema>;
export const defaultPreferences = (): BoardPreferences => ({
  density: 4,
  limit: 0,
  fields: {
    due: true,
    people: true,
    tags: true,
    progress: true,
    priority: true,
    pending: true,
    project: true,
    dependencies: true,
    followUp: true,
  },
  collapsedColumns: [],
  collapsedBlocks: [],
  widths: {},
  hide: noHideRules(),
});
const savedViewSchema = z.object({
  id: z.string().max(64),
  name: z.string().trim().min(1).max(50),
  filters: viewFiltersSchema,
});
export type SavedTaskView = z.infer<typeof savedViewSchema>;
const storageSchema = z.object({
  version: z.literal(1),
  projects: z.record(z.string(), preferencesSchema),
  views: z.array(savedViewSchema).max(20),
});
type Storage = z.infer<typeof storageSchema>;
export function useTaskPreferences(key: string, project: string) {
  const [storage, setStorage] = useState<Storage>({
    version: 1,
    projects: {},
    views: [],
  });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      const value = raw && storageSchema.safeParse(JSON.parse(raw));
      if (value && value.success) setStorage(value.data);
    } catch {}
    setLoaded(true);
  }, [key]);
  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem(key, JSON.stringify(storage));
      } catch {}
    }
  }, [key, storage, loaded]);
  const scope = project || "all";
  return {
    preferences: storage.projects[scope] ?? defaultPreferences(),
    setPreferences: (patch: Partial<BoardPreferences>) =>
      setStorage((s) => ({
        ...s,
        projects: {
          ...s.projects,
          [scope]: { ...(s.projects[scope] ?? defaultPreferences()), ...patch },
        },
      })),
    views: storage.views,
    saveView: (name: string, filters: ViewFilters) =>
      setStorage((s) => ({
        ...s,
        views: [
          ...s.views.filter(
            (v) => v.name.toLocaleLowerCase() !== name.toLocaleLowerCase(),
          ),
          { id: crypto.randomUUID(), name, filters },
        ].slice(-20),
      })),
    removeView: (id: string) =>
      setStorage((s) => ({ ...s, views: s.views.filter((v) => v.id !== id) })),
  };
}
export function BoardDisplaySettings({
  preferences,
  onChange,
}: {
  preferences: BoardPreferences;
  onChange: (patch: Partial<BoardPreferences>) => void;
}) {
  const labels: Record<keyof CardFields, string> = {
    due: "Prazo",
    people: "Pessoas de apoio",
    tags: "Marcadores",
    progress: "Subtarefas e progresso",
    priority: "Prioridade",
    pending: "Pendências",
    project: "Nome do projeto",
    dependencies: "Dependências",
    followUp: "Acompanhamento",
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Personalizar cards">
          <Settings2 />
          <span className="hidden sm:inline">Exibição</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="space-y-4">
        <div>
          <p className="text-sm font-semibold">Seu jeito de organizar</p>
          <p className="mt-1 text-xs text-muted">
            Preferências salvas neste dispositivo, por projeto.
          </p>
        </div>
        <label className="block space-y-1.5 text-xs text-muted">
          <span>Cards por coluna</span>
          <select
            className={selectClass}
            aria-label="Limite de cards por coluna"
            value={preferences.limit}
            onChange={(e) =>
              onChange({
                limit: Number(e.target.value) as BoardPreferences["limit"],
              })
            }
          >
            <option value={0}>Todos</option>
            <option value={3}>3, depois ver mais</option>
            <option value={5}>5, depois ver mais</option>
            <option value={10}>10, depois ver mais</option>
          </select>
        </label>
        <fieldset className="space-y-1">
          <legend className="mb-2 text-xs font-medium">
            Marcações visíveis
          </legend>
          {Object.entries(labels).map(([key, label]) => (
            <label
              key={key}
              className="flex min-h-8 items-center gap-2 text-body text-ink-2"
            >
              <input
                type="checkbox"
                checked={preferences.fields[key as keyof CardFields]}
                onChange={(e) =>
                  onChange({
                    fields: { ...preferences.fields, [key]: e.target.checked },
                  })
                }
                className="size-3.5 accent-accent"
              />
              {label}
            </label>
          ))}
        </fieldset>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(defaultPreferences())}
        >
          Restaurar exibição
        </Button>
      </PopoverContent>
    </Popover>
  );
}
export function SavedTaskViews({
  views,
  filters,
  onApply,
  onSave,
  onRemove,
}: {
  views: SavedTaskView[];
  filters: ViewFilters;
  onApply: (filters: ViewFilters) => void;
  onSave: (name: string, filters: ViewFilters) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-1.5"
      aria-label="Visões salvas"
    >
      {views
        .filter((v) => v.filters.projectId === filters.projectId)
        .map((v) => (
          <div
            key={v.id}
            className="flex max-w-full items-center rounded-control border border-line bg-surface"
          >
            <button
              onClick={() => onApply(v.filters)}
              aria-pressed={
                JSON.stringify(v.filters) === JSON.stringify(filters)
              }
              className="flex min-h-7 min-w-0 items-center gap-1.5 px-2 text-[11px] text-ink-2 hover:text-accent-ink aria-pressed:bg-accent-soft aria-pressed:text-accent-ink"
            >
              <Bookmark className="size-3 shrink-0" />
              <span className="truncate">{v.name}</span>
            </button>
            <button
              className="mr-1 flex size-6 shrink-0 items-center justify-center rounded hover:bg-hover"
              aria-label={`Remover visão ${v.name}`}
              onClick={() => onRemove(v.id)}
            >
              <X className="size-3 text-muted" />
            </button>
          </div>
        ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 text-[11px]">
            <Bookmark />
            Salvar visão
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              onSave(name.trim(), filters);
              setName("");
              setOpen(false);
            }}
          >
            <label className="block space-y-2 text-xs text-muted">
              Nome da visão
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                placeholder="Ex.: Aguardando a Ana"
                aria-label="Nome da visão"
                required
              />
            </label>
            <p className="text-xs text-muted">
              Guarda busca, filtros e ordenação deste projeto.
            </p>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={!name.trim()}
            >
              <Check />
              Salvar visão
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
