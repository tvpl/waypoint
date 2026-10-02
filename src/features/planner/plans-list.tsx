"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  CopyPlus,
  Eye,
  FileJson,
  LayoutTemplate,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  Upload,
  Workflow,
} from "lucide-react";
import type { Thumb } from "@/server/services/plans";
import { PlanThumb } from "@/components/plan-thumb";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { cn, timeAgo } from "@/lib/utils";
import { archivePlanAction, createPlanAction, deletePlanAction, duplicatePlanAction, importPlanAction } from "@/app/(app)/plans/actions";

export type PlanFilter = "mine" | "shared" | "templates" | "archived";

export type PlanCardData = {
  id: string;
  title: string;
  description: string | null;
  updatedAt: number;
  publishedVersion: number | null;
  access: "owner" | "editor" | "viewer";
  isTemplate: boolean;
  archived: boolean;
  thumbnail: Thumb;
  tags: string[];
};

const TABS: { value: PlanFilter; label: string }[] = [
  { value: "mine", label: "Meus plans" },
  { value: "shared", label: "Compartilhados" },
  { value: "templates", label: "Templates" },
  { value: "archived", label: "Arquivados" },
];

import { NewPlanButton } from "./new-plan-dialog";
export { NewPlanButton };

export function ImportPlanButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="secondary" disabled={disabled || pending} onClick={() => ref.current?.click()}>
        {pending ? <Loader2 className="animate-spin" /> : <Upload />} Importar JSON
      </Button>
      <input
        ref={ref}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          start(async () => {
            const text = await file.text();
            const r = await importPlanAction(text, file.name);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Plan importado");
            router.push(`/plans/${r.id}/edit`);
          });
        }}
      />
    </>
  );
}

export function PlansList({ filter, plans, canCreate }: { filter: PlanFilter; plans: PlanCardData[]; canCreate: boolean }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const shown = query ? plans.filter((p) => [p.title, p.description ?? "", ...p.tags].join(" ").toLowerCase().includes(query)) : plans;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line">
        <nav aria-label="Filtrar plans" className="-mx-6 -mb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex max-w-[calc(100%+48px)] gap-5 overflow-x-auto whitespace-nowrap px-6 text-sm sm:mx-0 sm:max-w-full sm:px-0">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={t.value === "mine" ? "/plans" : `/plans?f=${t.value}`}
              aria-current={filter === t.value ? "page" : undefined}
              className={cn("shrink-0 border-b-2 pb-2.5 transition-colors", filter === t.value ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:text-ink")}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        {plans.length > 0 && (
          <label className="mb-2 flex h-8 w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-muted focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15 sm:w-60">
            <Search className="size-3.5 shrink-0" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Filtrar plans" aria-label="Filtrar plans" className="w-full bg-transparent text-body text-ink outline-none" />
          </label>
        )}
      </div>

      {plans.length === 0 ? (
        <Empty filter={filter} canCreate={canCreate} />
      ) : shown.length === 0 ? (
        <EmptyState icon={<Search />} title={`Nenhum plan com “${q}”`} description="Tente outro termo ou limpe o filtro." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <li key={p.id}>
              <PlanCard plan={p} canCreate={canCreate} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Empty({ filter, canCreate }: { filter: PlanFilter; canCreate: boolean }) {
  if (filter === "shared")
    return <EmptyState icon={<Workflow />} title="Nada compartilhado com você" description="Plans criados por outras pessoas do workspace — ou compartilhados diretamente com você — aparecem aqui." />;
  if (filter === "templates")
    return (
      <EmptyState
        icon={<LayoutTemplate />}
        title="Nenhum template ainda"
        description="Transforme um plan em ponto de partida: no menu de um card, escolha “Salvar como template”."
      />
    );
  if (filter === "archived") return <EmptyState icon={<Archive />} title="Nada arquivado" description="Plans arquivados saem da busca e das listas, e podem ser restaurados a qualquer momento." />;
  return (
    <EmptyState
      icon={<Workflow />}
      title="Seu primeiro plan começa aqui"
      description="Mapeie arquiteturas, roadmaps e fluxos com blocos, containers e conexões — e ligue cada bloco aos seus links."
      action={canCreate ? <NewPlanButton variant="primary" /> : undefined}
    />
  );
}

function StatusBadge({ p }: { p: PlanCardData }) {
  if (p.archived) return <Badge>Arquivado</Badge>;
  if (p.isTemplate) return <Badge tone="accent">Template</Badge>;
  if (p.publishedVersion != null) return <Badge tone="success">Publicado</Badge>;
  return <Badge tone="amber">Rascunho</Badge>;
}

function PlanCard({ plan: p, canCreate }: { plan: PlanCardData; canCreate: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const editor = p.access === "owner" || p.access === "editor";
  const owner = p.access === "owner";
  const href = p.isTemplate || p.publishedVersion != null || !editor ? `/plans/${p.id}` : `/plans/${p.id}/edit`;

  const act = (fn: () => Promise<{ ok: boolean; error?: string } | void>, success?: string) =>
    start(async () => {
      const r = await fn();
      if (r && !r.ok) return void toast.error(r.error ?? "Algo deu errado.");
      if (success) toast.success(success);
      router.refresh();
    });

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface transition-[box-shadow,transform] focus-within:shadow-pop hover:-translate-y-px hover:shadow-pop">
      <Link href={href} className="flex flex-1 flex-col outline-none">
        <PlanThumb thumb={p.thumbnail} />
        <div className="flex flex-col gap-1.5 px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-lead font-semibold">{p.title}</h3>
            <StatusBadge p={p} />
          </div>
          <p className="flex items-center gap-1.5 text-body text-muted">
            <span suppressHydrationWarning>editado {timeAgo(p.updatedAt)}</span>
            {p.access === "viewer" && <span>· somente leitura</span>}
          </p>
        </div>
      </Link>
      {p.isTemplate && canCreate && (
        <div className="border-t border-line px-4 py-2.5">
          <Button
            variant="soft"
            size="sm"
            disabled={pending}
            className="w-full justify-center"
            onClick={() =>
              start(async () => {
                try {
                  const id = await createPlanAction({ templateId: p.id });
                  router.push(`/plans/${id}/edit`);
                } catch {
                  toast.error("Não foi possível usar o template.");
                }
              })
            }
          >
            <LayoutTemplate /> Usar template
          </Button>
        </div>
      )}
      <div className={cn("absolute right-2 top-2 transition-opacity", pending ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" aria-label={`Ações de ${p.title}`} className="shadow-sm">
              {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => router.push(`/plans/${p.id}`)}>
              <Eye /> Abrir
            </DropdownMenuItem>
            {editor && (
              <DropdownMenuItem onSelect={() => router.push(`/plans/${p.id}/edit`)}>
                <Pencil /> Editar
              </DropdownMenuItem>
            )}
            {p.isTemplate && canCreate && (
              <DropdownMenuItem
                onSelect={() =>
                  start(async () => {
                    try {
                      const id = await createPlanAction({ templateId: p.id });
                      router.push(`/plans/${id}/edit`);
                    } catch {
                      toast.error("Não foi possível usar o template.");
                    }
                  })
                }
              >
                <LayoutTemplate /> Usar template
              </DropdownMenuItem>
            )}
            {canCreate && (
              <DropdownMenuItem onSelect={() => act(() => duplicatePlanAction(p.id), "Cópia criada")}>
                <CopyPlus /> Duplicar
              </DropdownMenuItem>
            )}
            {!p.isTemplate && canCreate && (
              <DropdownMenuItem onSelect={() => act(() => duplicatePlanAction(p.id, { asTemplate: true }), "Template criado — veja em Templates")}>
                <LayoutTemplate /> Salvar como template
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <a href={`/api/plans/${p.id}/export`} download>
                <FileJson /> Exportar JSON
              </a>
            </DropdownMenuItem>
            {owner && (
              <>
                <DropdownMenuSeparator />
                {p.archived ? (
                  <DropdownMenuItem onSelect={() => act(() => archivePlanAction(p.id, false), "Plan restaurado")}>
                    <ArchiveRestore /> Restaurar
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => act(() => archivePlanAction(p.id, true), "Plan arquivado")}>
                    <Archive /> Arquivar
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem danger onSelect={() => setConfirm(true)}>
                  <Trash2 /> Excluir
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent title="Excluir plan?" description={p.title} className="max-w-[440px]">
          <DialogBody>
            <p className="text-sm text-ink-2">O plan, seu histórico de versões e os links compartilhados serão removidos permanentemente. Esta ação não pode ser desfeita.</p>
          </DialogBody>
          <DialogFooter className="justify-end">
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => {
                setConfirm(false);
                act(() => deletePlanAction(p.id), "Plan excluído");
              }}
            >
              <Trash2 /> Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
