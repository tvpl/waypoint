"use client";
import {
  Archive,
  Bell,
  CheckCheck,
  ChevronDown,
  Copy,
  FolderInput,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  STATUS_LABELS,
  TASK_STATUSES,
  type TaskBulkChange,
  type TaskProject,
} from "@/domain/tasks";
import { TaskDate } from "./task-controls";
export function TaskBulkBar({
  count,
  visibleCount,
  allSelected,
  busy,
  archived,
  today,
  projects,
  onSelectAll,
  onChange,
  onExport,
  onRemind,
  onClose,
}: {
  count: number;
  visibleCount: number;
  allSelected: boolean;
  busy: boolean;
  archived: boolean;
  today: string;
  projects: TaskProject[];
  onSelectAll: () => void;
  onChange: (change: TaskBulkChange) => void;
  onExport: () => void;
  onRemind: () => void;
  onClose: () => void;
}) {
  return (
    <div
      role="region"
      aria-label="Ações da seleção"
      className="wp-task-bulk absolute inset-x-3 bottom-4 z-20 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-line-2 bg-surface p-2.5 shadow-pop sm:inset-x-6 sm:gap-3"
    >
      <span className="ml-1 flex size-7 items-center justify-center rounded-lg bg-accent-soft text-xs font-semibold tabular-nums text-accent-ink">
        {count}
      </span>
      <button
        disabled={busy}
        className="mr-auto text-xs text-muted hover:text-ink"
        onClick={onSelectAll}
      >
        {allSelected
          ? "Limpar seleção"
          : `Selecionar ${visibleCount > 200 ? "até 200" : "todas"}`}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={!count || busy}>
            <CheckCheck />
            <span className="hidden sm:inline">Etapa</span>
            <ChevronDown className="size-3!" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {TASK_STATUSES.map((s) => (
            <DropdownMenuItem
              key={s}
              onSelect={() => onChange({ type: "status", value: s })}
            >
              {STATUS_LABELS[s]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={!count || busy}>
            <FolderInput />
            <span className="hidden sm:inline">Projeto</span>
            <ChevronDown className="size-3!" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onSelect={() => onChange({ type: "project", value: null })}
          >
            Sem projeto
          </DropdownMenuItem>
          {projects.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onSelect={() => onChange({ type: "project", value: p.id })}
            >
              <span
                data-color={p.color}
                className="wp-task-color size-2 rounded-full"
              />
              {p.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <TaskDate
        allowClear
        date={null}
        today={today}
        disabled={!count || busy}
        onChange={(value) => onChange({ type: "due", value })}
      />
      <Button
        variant="ghost"
        size="icon"
        aria-label="Agendar lembretes para seleção"
        title="Agendar lembretes"
        disabled={!count || busy}
        onClick={onRemind}
      >
        <Bell />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="Copiar seleção em Markdown"
        aria-label="Copiar seleção em Markdown"
        disabled={!count}
        onClick={onExport}
      >
        <Copy />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title={archived ? "Restaurar seleção" : "Arquivar seleção"}
        aria-label={archived ? "Restaurar seleção" : "Arquivar seleção"}
        disabled={!count || busy}
        onClick={() => onChange({ type: "archive", value: !archived })}
      >
        <Archive />
      </Button>
      <span className="mx-0.5 h-5 w-px bg-line" />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Sair da seleção"
        disabled={busy}
        onClick={onClose}
      >
        <X />
      </Button>
    </div>
  );
}
