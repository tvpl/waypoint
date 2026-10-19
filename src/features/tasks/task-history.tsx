"use client";
import { useEffect, useState, useTransition } from "react";
import {
  Archive,
  ArrowRightLeft,
  CheckCircle2,
  CircleDot,
  History,
  MessageSquareText,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { addTaskNoteAction, deleteTaskNoteAction, taskHistoryAction } from "@/app/(app)/tasks/actions";
import { eventSummary, type TaskEvent } from "@/domain/task-history";
import { cn, timeAgo } from "@/lib/utils";

const ICONS = {
  created: CircleDot,
  imported: Upload,
  status: ArrowRightLeft,
  updated: Pencil,
  archived: Archive,
  restored: RotateCcw,
  note: MessageSquareText,
} as const;
const full = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });

/** Observations (dated notes) and the lifecycle of a task, newest first. */
export function TaskHistory({ taskId, canEdit, meId, isOwner }: { taskId: string; canEdit: boolean; meId: string; isOwner: boolean }) {
  const [events, setEvents] = useState<TaskEvent[] | null>(null);
  const [filter, setFilter] = useState<"all" | "notes">("all");
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    taskHistoryAction(taskId)
      .then((r) => {
        if (!live) return;
        if (r.ok) setEvents(r.data);
        else {
          setEvents([]);
          toast.error(r.error);
        }
      })
      .catch(() => live && setEvents([]));
    return () => {
      live = false;
    };
  }, [taskId]);

  const add = () => {
    const body = text.trim();
    if (!body || pending) return;
    start(async () => {
      const r = await addTaskNoteAction(taskId, body);
      if (!r.ok) return void toast.error(r.error);
      setEvents((list) => [...(list ?? []), r.data]);
      setText("");
      setFilter("all");
    });
  };
  const remove = (id: string) =>
    start(async () => {
      if (!window.confirm("Excluir esta observação?")) return;
      const r = await deleteTaskNoteAction(id);
      if (!r.ok) return void toast.error(r.error);
      setEvents((list) => (list ?? []).filter((e) => e.id !== id));
    });

  const shown = [...(events ?? [])].reverse().filter((e) => filter === "all" || e.kind === "note");
  const notes = events?.filter((e) => e.kind === "note").length ?? 0;

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface-2/30 p-4" aria-labelledby={`history-${taskId}`}>
      <div className="flex items-center gap-2">
        <History className="size-4 text-ink-2" />
        <h3 id={`history-${taskId}`} className="text-body font-medium text-ink-2">
          Observações e histórico
        </h3>
        <div role="radiogroup" aria-label="Mostrar" className="ml-auto inline-flex gap-0.5 rounded-lg bg-subtle p-[3px]">
          {(
            [
              ["all", "Tudo"],
              ["notes", `Observações${notes ? ` (${notes})` : ""}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={filter === value}
              onClick={() => setFilter(value)}
              className={cn("h-6 rounded-md px-2 text-[11px] font-medium transition-colors", filter === value ? "bg-surface text-ink shadow-thumb" : "text-muted hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {canEdit && (
        <div className="space-y-2">
          <Textarea
            aria-label="Nova observação"
            value={text}
            maxLength={5000}
            rows={2}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                // Saves the note, not the whole task form.
                e.preventDefault();
                e.stopPropagation();
                add();
              }
            }}
            placeholder="Registre um andamento, decisão ou retorno…"
            className="min-h-[64px] resize-y text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted">Fica com data e autor no histórico e entra no relatório.</span>
            <Button type="button" size="sm" variant="soft" disabled={!text.trim() || pending} onClick={add}>
              <Send />
              Registrar
            </Button>
          </div>
        </div>
      )}

      {events === null ? (
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-4 w-2/3 rounded" />
          <Skeleton className="h-4 w-1/2 rounded" />
        </div>
      ) : shown.length === 0 ? (
        <p className="text-xs text-muted">{filter === "notes" ? "Nenhuma observação ainda." : "O histórico começa a partir das próximas alterações."}</p>
      ) : (
        <ol className="relative space-y-3 before:absolute before:bottom-1 before:left-[11px] before:top-1 before:w-px before:bg-line">
          {shown.map((e) => {
            const Icon = e.kind === "status" && e.toStatus === "done" ? CheckCircle2 : ICONS[e.kind];
            const note = e.kind === "note";
            return (
              <li key={e.id} className="group/event relative flex gap-3 animate-in">
                <span
                  className={cn(
                    "relative z-[1] mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface [&_svg]:size-3",
                    note && "border-accent-line bg-accent-soft text-accent-ink",
                    e.kind === "status" && e.toStatus === "done" && "border-transparent bg-success-bg text-success-ink",
                  )}
                >
                  <Icon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
                    <span className={cn("font-medium", note ? "text-ink" : "text-ink-2")}>{note ? (e.userName ?? "Alguém") : eventSummary(e)}</span>
                    {!note && e.userName && <span className="text-muted">· {e.userName}</span>}
                    <time className="text-[11px] text-muted" dateTime={new Date(e.createdAt).toISOString()} title={full.format(e.createdAt)} suppressHydrationWarning>
                      {timeAgo(e.createdAt)}
                    </time>
                    {note && canEdit && (e.userId === meId || isOwner) && (
                      <button
                        type="button"
                        aria-label="Excluir observação"
                        onClick={() => remove(e.id)}
                        className="ml-auto rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover/event:opacity-100"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </p>
                  {note && <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-surface px-2.5 py-2 text-xs leading-5 text-ink shadow-rest">{e.body}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
