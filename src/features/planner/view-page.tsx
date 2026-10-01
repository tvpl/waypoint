"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowUpRight, Info, Pencil, Share2 } from "lucide-react";
import type { EdgeKind, PlanDocument } from "@/domain/plan";
import { EDGE_KINDS } from "@/domain/plan";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/input";
import { TagChip } from "@/components/ui/misc";
import { cn, formatDateTime } from "@/lib/utils";
import { PlanCanvasView, type ViewerExport } from "./viewer";
import { EdgeLegend } from "./edges";
import { ResourceIcon } from "./resource-picker";
import { refKey, fallbackResource, type ResolvedResource } from "./resource-types";
import { ExportMenu, type ExportKind } from "./topbar";
import { ShareDialog } from "./share-dialog";

export type ViewPlanMeta = { id: string; title: string; description: string | null; tags: string[] };

export type ViewStatus =
  | { kind: "published"; version: number; at: number }
  | { kind: "draft" }
  | { kind: "version"; version: number; at: number; isPublished: boolean }
  | { kind: "none" };

/** Left column + canvas. Shared by View Mode, the public share page and the editor preview. */
export function ViewBody({
  plan,
  document,
  resources,
  focusNodeId,
  exportRef,
}: {
  plan: ViewPlanMeta;
  document: PlanDocument;
  resources: Record<string, ResolvedResource>;
  focusNodeId?: string | null;
  exportRef?: React.MutableRefObject<ViewerExport | null>;
}) {
  const refs = useMemo(() => {
    const seen = new Set<string>();
    const out: ResolvedResource[] = [];
    for (const n of document.nodes) {
      const r = n.data.resource;
      if (!r) continue;
      const k = refKey(r);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(resources[n.id] ?? fallbackResource(r));
    }
    return out;
  }, [document, resources]);
  const kinds = useMemo(() => {
    const used = new Set<EdgeKind>(document.edges.map((e) => e.kind));
    return EDGE_KINDS.filter((k) => used.has(k));
  }, [document]);
  const meta = useMemo(() => ({ title: plan.title, description: plan.description, tags: plan.tags }), [plan]);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className="scrollbar-thin flex shrink-0 flex-col gap-7 overflow-y-auto px-6 pb-6 pt-6 lg:w-[380px] lg:pb-8 lg:pl-12 lg:pr-8 lg:pt-10">
        <div className="flex flex-col gap-3.5">
          <h1 className="font-display text-[34px] font-normal leading-[1.02] tracking-[-.01em] text-balance lg:text-[46px]">{plan.title}</h1>
          {plan.description && <p className="whitespace-pre-line text-[15px] leading-[23px] text-ink-2 text-pretty">{plan.description}</p>}
          {plan.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {plan.tags.map((t) => (
                <TagChip key={t} name={t} />
              ))}
            </div>
          )}
        </div>
        {refs.length > 0 && (
          <section className="hidden flex-col gap-2 lg:flex">
            <SectionLabel>Referências</SectionLabel>
            <ul className="-mx-2 flex flex-col">
              {refs.map((r, i) => (
                <li key={i}>
                  <RefLink res={r} />
                </li>
              ))}
            </ul>
          </section>
        )}
        {kinds.length > 0 && (
          <section className="hidden flex-col gap-2.5 lg:flex">
            <SectionLabel>Legenda</SectionLabel>
            <EdgeLegend kinds={kinds} />
          </section>
        )}
      </aside>
      <section aria-label="Plan" className="relative min-h-[420px] flex-1">
        <PlanCanvasView document={document} resources={resources} focusNodeId={focusNodeId} meta={meta} exportRef={exportRef} />
      </section>
    </div>
  );
}

function RefLink({ res }: { res: ResolvedResource }) {
  const body = (
    <>
      <ResourceIcon resource={res} size={28} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium">{res.title}</span>
        <span className="truncate text-xs text-muted">{res.subtitle}</span>
      </span>
      {res.href && <ArrowUpRight className="size-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
    </>
  );
  const cls = "group flex items-center gap-2.5 rounded-lg p-2";
  if (!res.href) return <div className={cn(cls, "opacity-70")}>{body}</div>;
  return res.external ? (
    <a href={res.href} target="_blank" rel="noopener noreferrer" className={cn(cls, "hover:bg-hover")}>
      {body}
    </a>
  ) : (
    <Link href={res.href} className={cn(cls, "hover:bg-hover")}>
      {body}
    </Link>
  );
}

function statusText(s: ViewStatus) {
  switch (s.kind) {
    case "published":
      return `Publicado · v${s.version} · ${formatDateTime(s.at)}`;
    case "version":
      return `v${s.version} · ${formatDateTime(s.at)}`;
    case "draft":
      return "Rascunho";
    default:
      return "";
  }
}

/** Full View Mode page: slim header + ViewBody. */
export function PlanViewPage({
  plan,
  document,
  resources,
  status,
  workspaceName,
  canEdit = false,
  focusNodeId,
  homeHref = "/",
}: {
  plan: ViewPlanMeta;
  document: PlanDocument;
  resources: Record<string, ResolvedResource>;
  status: ViewStatus;
  workspaceName?: string | null;
  canEdit?: boolean;
  focusNodeId?: string | null;
  homeHref?: string;
}) {
  const exportRef = useRef<ViewerExport | null>(null);
  const [share, setShare] = useState(false);
  const onExport = (k: ExportKind) => void exportRef.current?.(k);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface-2 text-ink">
      <header className="wp-no-print flex h-14 shrink-0 items-center gap-3 px-5">
        <Link href={homeHref} aria-label="Waypoint — início" className="inline-flex rounded-[10px]">
          <Logo />
        </Link>
        {workspaceName && (
          <nav aria-label="Caminho" className="flex min-w-0 items-center gap-2 text-sm text-muted">
            {canEdit ? (
              <Link href="/plans" className="hover:text-ink">
                {workspaceName}
              </Link>
            ) : (
              <span>{workspaceName}</span>
            )}
          </nav>
        )}
        <div className="flex-1" />
        {status.kind !== "none" && (
          <span className="hidden text-xs text-muted sm:inline" suppressHydrationWarning>
            {statusText(status)}
          </span>
        )}
        {canEdit && (
          <Button asChild variant="ghost" size="sm" className="h-[34px]">
            <Link href={`/plans/${plan.id}/edit`}>
              <Pencil /> Editar
            </Link>
          </Button>
        )}
        {canEdit && (
          <Button variant="secondary" size="sm" className="h-[34px]" onClick={() => setShare(true)}>
            <Share2 /> Compartilhar
          </Button>
        )}
        <ExportMenu onExport={onExport} />
      </header>
      {status.kind === "draft" && (
        <Notice>
          <b className="font-semibold">Ainda não publicado.</b> Você está vendo o rascunho — viewers só verão o plan depois que ele for publicado.
        </Notice>
      )}
      {status.kind === "version" && (
        <Notice>
          Você está vendo a <b className="font-semibold">v{status.version}</b>
          {status.isPublished ? " (versão publicada)" : ", uma versão anterior"}.{" "}
          <Link href={`/plans/${plan.id}`} className="font-medium underline underline-offset-2">
            Ver a versão atual
          </Link>
        </Notice>
      )}
      <ViewBody plan={plan} document={document} resources={resources} focusNodeId={focusNodeId} exportRef={exportRef} />
      {canEdit && <ShareDialog planId={plan.id} open={share} onOpenChange={setShare} workspaceName={workspaceName ?? "seu workspace"} />}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="wp-no-print mx-5 mb-1 flex items-center gap-2.5 rounded-xl border border-amber-line bg-amber-bg px-4 py-2.5 text-[13px] text-amber-ink">
      <Info className="size-4 shrink-0" aria-hidden />
      <p>{children}</p>
    </div>
  );
}
