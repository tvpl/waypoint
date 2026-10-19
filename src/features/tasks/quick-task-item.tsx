"use client";
import { useState } from "react";
import { Command } from "cmdk";
import { CalendarDays, Flag, ListPlus, Repeat } from "lucide-react";
import { toast } from "sonner";
import { saveTaskAction } from "@/app/(app)/tasks/actions";
import { parseQuickTask } from "@/domain/task-capture";
import { RECURRENCE_LABELS } from "@/domain/task-recurrence";
import { dateLabel, PRIORITY_LABELS } from "@/domain/tasks";

/** Text after a leading "+" is a task to create ("+ Ligar para a Ana amanhã #cliente !alta"). */
export const quickTaskText = (query: string) => (query.trimStart().startsWith("+") ? query.trimStart().slice(1).trim() : null);

/**
 * "Criar tarefa" in the search (⌘K) and the desktop capture window. Understands the board's
 * quick syntax: #marcador, @pessoa, hoje, amanhã, AAAA-MM-DD, !alta|!média|!baixa, ~semanal…
 */
export function QuickTaskItem({ text, className, iconClassName, onDone }: { text: string; className: string; iconClassName?: string; onDone: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  let parsed: ReturnType<typeof parseQuickTask> | null = null;
  try {
    parsed = parseQuickTask(text);
  } catch {
    parsed = null;
  }
  if (!parsed || !parsed.title) return null;
  const task = parsed;
  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await saveTaskAction(task);
      if (!r.ok) return void toast.error(r.error);
      const id = (r.data as { id: string }).id;
      toast.success(`Tarefa “${task.title}” criada.`, { action: { label: "Abrir", onClick: () => (window.location.href = `/tasks?open=${id}`) } });
      onDone(id);
    } catch {
      toast.error("Não foi possível criar a tarefa.");
    } finally {
      setBusy(false);
    }
  };
  const chips = [
    task.dueDate && { icon: <CalendarDays />, label: dateLabel(task.dueDate) },
    task.priority !== "none" && { icon: <Flag />, label: PRIORITY_LABELS[task.priority] },
    task.recurrence && { icon: <Repeat />, label: RECURRENCE_LABELS[task.recurrence] },
    ...task.tags.map((t) => ({ icon: null, label: `#${t}` })),
    ...task.people.map((p) => ({ icon: null, label: `@${p}` })),
  ].filter(Boolean) as { icon: React.ReactNode; label: string }[];
  return (
    <Command.Item value={`create-task-${text}`} onSelect={() => void create()} className={className} disabled={busy}>
      <span className={iconClassName ?? "inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink [&_svg]:size-3.5"}>
        <ListPlus />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">
          Criar tarefa <span className="font-medium">“{task.title}”</span>
        </span>
        {chips.length > 0 && (
          <span className="flex min-w-0 flex-wrap gap-1 pt-0.5">
            {chips.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-0.5 rounded bg-subtle px-1 text-[10px] text-ink-2 [&_svg]:size-2.5">
                {c.icon}
                {c.label}
              </span>
            ))}
          </span>
        )}
      </span>
    </Command.Item>
  );
}
