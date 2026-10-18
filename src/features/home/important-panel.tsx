"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, Star, Workflow } from "lucide-react";
import { toast } from "sonner";
import { toggleImportantAction } from "@/app/(app)/dashboard-actions";
import { CollectionTile } from "@/features/links/collection-style";
import type { ImportantItem } from "@/server/services/marks";
import { STATUS_LABELS, dateLabel, type TaskStatus } from "@/domain/tasks";
import { cn } from "@/lib/utils";

type Filter = "all" | ImportantItem["type"];
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tudo" },
  { id: "task", label: "Tarefas" },
  { id: "plan", label: "Plans" },
  { id: "collection", label: "Coleções" },
];
const href = (i: ImportantItem) => (i.type === "task" ? `/tasks?open=${i.id}` : i.type === "plan" ? `/plans/${i.id}` : `/links?c=${i.id}`);

/** "Importantes": what this person starred — open tasks, plans and collections. */
export function ImportantPanel({ items: initial, today }: { items: ImportantItem[]; today: string }) {
  const [items, setItems] = React.useState(initial);
  const [filter, setFilter] = React.useState<Filter>("all");
  React.useEffect(() => setItems(initial), [initial]);
  const shown = items.filter((i) => filter === "all" || i.type === filter);
  const unstar = (item: ImportantItem) => {
    const before = items;
    setItems(items.filter((i) => !(i.type === item.type && i.id === item.id)));
    toggleImportantAction(item.type, item.id)
      .then((r) => {
        if (!r.ok) {
          setItems(before);
          toast.error(r.error);
        } else
          toast.success("Removido de importantes.", {
            action: { label: "Desfazer", onClick: () => toggleImportantAction(item.type, item.id).then((u) => u.ok && setItems(before)) },
          });
      })
      .catch(() => setItems(before));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {items.length > 0 && (
        <div className="flex gap-1 border-b border-line px-3 py-2" role="radiogroup" aria-label="Filtrar importantes">
          {FILTERS.filter((f) => f.id === "all" || items.some((i) => i.type === f.id)).map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn("h-6 rounded-md px-2 text-caption font-medium transition-colors", filter === f.id ? "bg-accent-soft text-accent-ink" : "text-muted hover:bg-hover hover:text-ink")}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      {shown.length ? (
        <ul className="scrollbar-thin flex max-h-[296px] flex-col overflow-y-auto py-1">
          {shown.map((i) => (
            <li key={`${i.type}:${i.id}`} className="group flex items-center gap-1 pr-2 animate-in">
              <Link href={href(i)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2">
                {i.type === "task" ? (
                  <span data-color={i.projectColor ?? undefined} className="wp-task-color inline-flex size-7 shrink-0 items-center justify-center rounded-lg border-0">
                    <span className={cn("size-2 rounded-full", `wp-task-status-${i.status}`)} />
                  </span>
                ) : i.type === "plan" ? (
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
                    <Workflow className="size-3.5" />
                  </span>
                ) : (
                  <CollectionTile icon={i.icon} color={i.color} size={28} />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body font-medium">{i.title}</span>
                  <span className="truncate text-caption text-muted">
                    {i.type === "task"
                      ? [STATUS_LABELS[i.status as TaskStatus], i.projectName, i.dueDate ? (i.dueDate < today ? `atrasada · ${dateLabel(i.dueDate)}` : `até ${dateLabel(i.dueDate)}`) : null]
                          .filter(Boolean)
                          .join(" · ")
                      : i.type === "plan"
                        ? "Plan"
                        : "Coleção de links"}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => unstar(i)}
                aria-label={`Remover ${i.title} de importantes`}
                title="Remover de importantes"
                className="rounded-md p-1.5 text-amber-ink transition-[opacity,background] hover:bg-amber-bg sm:opacity-60 sm:group-hover:opacity-100"
              >
                <Star className="size-3.5 fill-current" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex flex-1 items-center gap-2 px-4 py-6 text-body leading-5 text-muted">
          <Star className="size-4 shrink-0" />
          {items.length ? "Nada deste tipo." : "Marque tarefas, plans e coleções como importantes (menu ⋯ ou detalhes) para tê-los sempre à mão aqui."}
        </p>
      )}
      <div className="mt-auto flex gap-3 border-t border-line px-4 py-2 text-caption">
        <Link href="/tasks" className="inline-flex items-center gap-1 text-accent-ink hover:underline">
          Tarefas <ArrowRight className="size-3" />
        </Link>
        <Link href="/links?scope=starred" className="inline-flex items-center gap-1 text-accent-ink hover:underline">
          Links com estrela <ArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}
