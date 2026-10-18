"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { ExternalLink, Folder, Link2, Loader2, Plus, Search, Workflow, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { SiteIcon } from "@/components/ui/misc";
import { setTaskLinksAction, taskLinksAction } from "@/app/(app)/tasks/actions";
import type { ResourceSearchItem } from "@/features/planner/resource-types";
import type { TaskLinkView } from "@/server/services/task-links";
import { cn } from "@/lib/utils";

type Ref = { type: "plan" | "favorite" | "collection"; id: string };
const keyOf = (r: Ref) => `${r.type}:${r.id}`;

function Glyph({ item }: { item: TaskLinkView | ResourceSearchItem }) {
  const r = item.resource;
  const kind = r.kind;
  if (kind === "favorite") return <SiteIcon src={r.favicon} label={r.title} size={26} />;
  return (
    <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink [&_svg]:size-3.5">
      {kind === "plan" ? <Workflow /> : <Folder />}
    </span>
  );
}

/** "Referências": plans, links and collections a task points at; they show the task back. */
export function TaskReferences({ taskId, canEdit, onCount }: { taskId: string; canEdit: boolean; onCount?: (n: number) => void }) {
  const [links, setLinks] = useState<TaskLinkView[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResourceSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const request = useRef(0);

  useEffect(() => {
    taskLinksAction(taskId)
      .then((r) => setLinks(r.ok ? r.data : []))
      .catch(() => setLinks([]));
  }, [taskId]);

  useEffect(() => {
    if (!adding) return;
    const id = ++request.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/resources/search?types=plan,favorite,collection&limit=8&q=${encodeURIComponent(query)}`);
        const body = await res.json();
        if (id === request.current) setResults(body.items ?? []);
      } catch {
        if (id === request.current) setResults([]);
      } finally {
        if (id === request.current) setSearching(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, adding]);

  const save = (next: Ref[]) =>
    start(async () => {
      const r = await setTaskLinksAction(taskId, next).catch(() => null);
      if (!r || !r.ok) return void toast.error(r && !r.ok ? r.error : "Não foi possível salvar as referências.");
      setLinks(r.data);
      onCount?.(r.data.length);
    });
  const current: Ref[] = (links ?? []).map(({ type, id }) => ({ type, id }));
  const linked = new Set(current.map(keyOf));

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface-2/30 p-4" aria-label="Referências">
      <div className="flex items-center gap-2">
        <Link2 className="size-4 text-ink-2" />
        <h3 className="text-body font-medium text-ink-2">Referências</h3>
        <span className="text-[11px] text-muted">plans, links e coleções</span>
        {canEdit && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-accent-ink hover:bg-accent-soft">
            <Plus className="size-3.5" /> Vincular
          </button>
        )}
      </div>
      {links === null ? (
        <div className="h-8 animate-pulse rounded-lg bg-subtle" aria-label="Carregando" />
      ) : links.length === 0 && !adding ? (
        <p className="text-xs leading-5 text-muted">Ligue esta tarefa ao plan da solução, aos links de referência ou à coleção do projeto. Eles mostram a tarefa de volta.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {links.map((l) => (
            <li key={keyOf(l)} className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-surface">
              <Glyph item={l} />
              <a
                href={l.resource.href ?? undefined}
                target={l.resource.external ? "_blank" : undefined}
                rel={l.resource.external ? "noopener noreferrer" : undefined}
                className={cn("flex min-w-0 flex-1 flex-col", !l.resource.href && "pointer-events-none opacity-60")}
              >
                <span className="truncate text-xs font-medium text-ink">{l.resource.title}</span>
                <span className="truncate text-[11px] text-muted">{l.resource.subtitle}</span>
              </a>
              {l.resource.external && l.resource.href && <ExternalLink className="size-3 shrink-0 text-muted" />}
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Remover referência ${l.resource.title}`}
                  disabled={pending}
                  onClick={() => save(current.filter((r) => keyOf(r) !== keyOf(l)))}
                  className="rounded p-1 text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <div className="space-y-2 animate-in">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setAdding(false);
                }
                if (e.key === "Enter") e.preventDefault();
              }}
              placeholder="Buscar plan, link ou coleção…"
              aria-label="Buscar item para vincular"
              className="h-9 pl-8 text-xs"
            />
            {(searching || pending) && <Loader2 className="absolute right-2.5 top-2.5 size-3.5 animate-spin text-muted" />}
          </div>
          <ul className="scrollbar-thin flex max-h-56 flex-col overflow-y-auto">
            {results
              .filter((r) => r.ref.type === "plan" || r.ref.type === "favorite" || r.ref.type === "collection")
              .map((r) => {
                const ref = r.ref as Ref;
                const on = linked.has(keyOf(ref));
                return (
                  <li key={keyOf(ref)}>
                    <button
                      type="button"
                      disabled={on || pending}
                      onClick={() => save([...current, ref])}
                      className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-surface disabled:opacity-50"
                    >
                      <Glyph item={r} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xs font-medium">{r.resource.title}</span>
                        <span className="truncate text-[11px] text-muted">{r.resource.subtitle}</span>
                      </span>
                      <span className="text-[11px] text-accent-ink">{on ? "Vinculado" : "Vincular"}</span>
                    </button>
                  </li>
                );
              })}
            {!searching && results.length === 0 && <li className="px-2 py-2 text-xs text-muted">Nada encontrado.</li>}
          </ul>
          <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setAdding(false)}>
            Fechar a busca
          </button>
        </div>
      )}
    </section>
  );
}

/** Tasks pointing at a plan, link or collection ("Tarefas ligadas"). */
export function TaskBacklinks({ type, id, className }: { type: Ref["type"]; id: string; className?: string }) {
  const [tasks, setTasks] = useState<{ id: string; title: string; status: string; projectName: string | null }[] | null>(null);
  useEffect(() => {
    fetch(`/api/tasks/backlinks?type=${type}&id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : { tasks: [] }))
      .then((b) => setTasks(b.tasks ?? []))
      .catch(() => setTasks([]));
  }, [type, id]);
  if (!tasks?.length) return null;
  return (
    <section className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-caption font-medium uppercase tracking-[.06em] text-muted">Tarefas ligadas</span>
      {tasks.map((t) => (
        <a key={t.id} href={`/tasks?open=${t.id}`} className="-mx-2 flex items-center gap-2.5 rounded-lg p-2 hover:bg-hover">
          <span className={cn("size-2 shrink-0 rounded-full", `wp-task-status-${t.status}`)} />
          <span className="flex min-w-0 flex-col">
            <span className={cn("truncate text-body font-medium", t.status === "done" && "text-muted line-through")}>{t.title}</span>
            {t.projectName && <span className="truncate text-xs text-muted">{t.projectName}</span>}
          </span>
        </a>
      ))}
    </section>
  );
}
