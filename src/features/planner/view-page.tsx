"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Download, FileJson, ImageDown, Info, MoreHorizontal, Pencil, Presentation, Printer, Share2 } from "lucide-react";
import type { EdgeKind, PlanDocument } from "@/domain/plan";
import { EDGE_KINDS } from "@/domain/plan";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/input";
import { TagChip } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogContent } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { cn, formatDateTime } from "@/lib/utils";
import { PlanCanvasView, type CanvasExtras, type ViewerExport } from "./viewer";
import { EdgeLegend } from "./edges";
import { ResourceIcon } from "./resource-picker";
import { refKey, fallbackResource, type ResolvedResource } from "./resource-types";
import { ExportMenu, type ExportKind } from "./topbar";
import { ShareDialog } from "./share-dialog";
import { PresentationMode } from "./presentation";
import { CommentsPanel, CommentsToggle, useComments, useCommentsPanel } from "./comments";

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
  canvas,
}: {
  plan: ViewPlanMeta;
  document: PlanDocument;
  resources: Record<string, ResolvedResource>;
  focusNodeId?: string | null;
  exportRef?: React.MutableRefObject<ViewerExport | null>;
  /** Comment badges / focus requests forwarded to the canvas. */
  canvas?: CanvasExtras;
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
      {/* desktop: info column */}
      <aside className="scrollbar-thin hidden shrink-0 flex-col gap-7 overflow-y-auto pb-8 pl-12 pr-8 pt-10 lg:flex lg:w-[380px]">
        <div className="flex flex-col gap-3.5">
          <h1 className="font-display text-[46px] font-normal leading-[1.02] tracking-[-.01em] text-balance">{plan.title}</h1>
          {plan.description && <p className="whitespace-pre-line text-[15px] leading-[23px] text-ink-2 text-pretty">{plan.description}</p>}
          {plan.tags.length > 0 && <Tags tags={plan.tags} />}
        </div>
        {refs.length > 0 && <References refs={refs} />}
        {kinds.length > 0 && <Legend kinds={kinds} />}
      </aside>
      {/* phones & tablets: compact header + "Detalhes" sheet */}
      <CompactInfo plan={plan} refs={refs} kinds={kinds} />
      <section aria-label="Plan" className="relative min-h-0 flex-1 lg:min-h-[420px]">
        <PlanCanvasView document={document} resources={resources} focusNodeId={focusNodeId} meta={meta} exportRef={exportRef} {...canvas} />
      </section>
    </div>
  );
}

function Tags({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <TagChip key={t} name={t} />
      ))}
    </div>
  );
}

function References({ refs }: { refs: ResolvedResource[] }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Referências</SectionLabel>
      <ul className="-mx-2 flex flex-col">
        {refs.map((r, i) => (
          <li key={i}>
            <RefLink res={r} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Legend({ kinds }: { kinds: EdgeKind[] }) {
  return (
    <section className="flex flex-col gap-2.5">
      <SectionLabel>Legenda</SectionLabel>
      <EdgeLegend kinds={kinds} />
    </section>
  );
}

function CompactInfo({ plan, refs, kinds }: { plan: ViewPlanMeta; refs: ResolvedResource[]; kinds: EdgeKind[] }) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const [sheet, setSheet] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);
  const hasDetails = refs.length > 0 || kinds.length > 0 || plan.tags.length > 0;

  useLayoutEffect(() => {
    const el = descRef.current;
    if (!el || expanded) return;
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [plan.description, expanded]);

  return (
    <div className="flex shrink-0 flex-col gap-1.5 px-4 pb-3 pt-1 lg:hidden">
      <div className="flex items-start gap-3">
        <h1 className="min-w-0 flex-1 font-display text-[28px] font-normal leading-[1.05] tracking-[-.01em] text-balance">{plan.title}</h1>
        {hasDetails && (
          <Button size="sm" variant="secondary" className="mt-0.5" onClick={() => setSheet(true)} aria-haspopup="dialog">
            <Info /> Detalhes
          </Button>
        )}
      </div>
      {plan.description && (
        <div className="flex flex-col items-start">
          <p ref={descRef} className={cn("whitespace-pre-line text-[14px] leading-[21px] text-ink-2", !expanded && "line-clamp-3")}>
            {plan.description}
          </p>
          {(clamped || expanded) && (
            <button type="button" className="text-[13px] font-medium text-accent-ink" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
              {expanded ? "menos" : "mais"}
            </button>
          )}
        </div>
      )}
      {hasDetails && (
        <Dialog open={sheet} onOpenChange={setSheet}>
          <DialogContent
            title="Detalhes do plan"
            className="bottom-0 left-0 top-auto max-h-[80dvh] w-full max-w-none translate-x-0 rounded-b-none rounded-t-[18px] pb-[env(safe-area-inset-bottom)]"
          >
            <DialogBody className="gap-6 pb-6">
              {plan.tags.length > 0 && (
                <section className="flex flex-col gap-2">
                  <SectionLabel>Tags</SectionLabel>
                  <Tags tags={plan.tags} />
                </section>
              )}
              {refs.length > 0 && <References refs={refs} />}
              {kinds.length > 0 && <Legend kinds={kinds} />}
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
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

/** Adds/removes `?present=1` without a navigation (keeps token/version params). */
function setPresentParam(on: boolean) {
  try {
    const url = new URL(window.location.href);
    if (on) url.searchParams.set("present", "1");
    else url.searchParams.delete("present");
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {}
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
  viewer = null,
  shareToken = null,
  present = false,
}: {
  plan: ViewPlanMeta;
  document: PlanDocument;
  resources: Record<string, ResolvedResource>;
  status: ViewStatus;
  workspaceName?: string | null;
  canEdit?: boolean;
  focusNodeId?: string | null;
  homeHref?: string;
  /** Signed-in user (comments need one; anonymous visitors see none). */
  viewer?: { id: string; name: string } | null;
  /** Share token the page was opened with (forwarded to comment actions). */
  shareToken?: string | null;
  /** Open directly in presentation mode (?present=1). */
  present?: boolean;
}) {
  const exportRef = useRef<ViewerExport | null>(null);
  const [share, setShare] = useState(false);
  const [presenting, setPresenting] = useState(present);
  const presentBtn = useRef<HTMLButtonElement>(null);
  const onExport = (k: ExportKind) => void exportRef.current?.(k);

  const panel = useCommentsPanel();
  const comments = useComments({ planId: plan.id, token: shareToken, enabled: !!viewer, open: panel.open });
  const [focus, setFocus] = useState<{ id: string; seq: number } | null>(null);
  const byNode = comments.counts.byNode;
  const commentCount = useCallback((id: string) => byNode[id] ?? 0, [byNode]);
  const openPanel = panel.openPanel;
  const openNodeComments = useCallback((id: string) => openPanel(id), [openPanel]);
  const canvas = useMemo<CanvasExtras>(
    () => (viewer ? { commentCount, openNodeComments, focusRequest: focus } : {}),
    [viewer, commentCount, openNodeComments, focus],
  );
  const commentNodes = useMemo(() => document.nodes.map((n) => ({ id: n.id, kind: n.kind, title: n.data.title || (resources[n.id]?.title ?? "") })), [document, resources]);

  const startPresenting = () => {
    setPresenting(true);
    setPresentParam(true);
  };
  const stopPresenting = useCallback(() => {
    setPresenting(false);
    setPresentParam(false);
    requestAnimationFrame(() => presentBtn.current?.focus());
  }, []);

  // the page can be re-rendered by the router with a new ?present
  useEffect(() => setPresenting(present), [present]);

  const empty = document.nodes.length === 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface-2 text-ink">
      <header className="wp-no-print flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-5">
        <Link href={homeHref} aria-label="Waypoint — início" className="inline-flex shrink-0 rounded-[10px]">
          <Logo />
        </Link>
        {workspaceName && (
          <nav aria-label="Caminho" className="hidden min-w-0 items-center gap-2 text-sm text-muted sm:flex">
            {canEdit ? (
              <Link href="/plans" className="truncate hover:text-ink">
                {workspaceName}
              </Link>
            ) : (
              <span className="truncate">{workspaceName}</span>
            )}
          </nav>
        )}
        <div className="flex-1" />
        {status.kind !== "none" && (
          <span className="hidden text-xs text-muted xl:inline" suppressHydrationWarning>
            {statusText(status)}
          </span>
        )}
        {!empty && (
          <Tooltip content="Apresentar (tela cheia)">
            <Button ref={presentBtn} variant="ghost" size="sm" className="h-[34px] px-2 sm:px-3" onClick={startPresenting} aria-label="Apresentar">
              <Presentation /> <span className="hidden sm:inline">Apresentar</span>
            </Button>
          </Tooltip>
        )}
        {viewer && <CommentsToggle count={comments.counts.unresolvedThreads} open={panel.open} onClick={panel.toggle} />}
        {canEdit && (
          <Button asChild variant="ghost" size="sm" className="hidden h-[34px] md:inline-flex">
            <Link href={`/plans/${plan.id}/edit`}>
              <Pencil /> Editar
            </Link>
          </Button>
        )}
        {canEdit && (
          <Button variant="secondary" size="sm" className="hidden h-[34px] md:inline-flex" onClick={() => setShare(true)}>
            <Share2 /> Compartilhar
          </Button>
        )}
        <div className="hidden md:block">
          <ExportMenu onExport={onExport} />
        </div>
        <MobileMenu planId={plan.id} canEdit={canEdit} onShare={() => setShare(true)} onExport={onExport} />
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
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ViewBody plan={plan} document={document} resources={resources} focusNodeId={focusNodeId} exportRef={exportRef} canvas={canvas} />
        </div>
        {viewer && panel.open && (
          <CommentsPanel
            store={comments}
            target={panel}
            onClose={panel.close}
            nodes={commentNodes}
            onSelectNode={(id) => setFocus((f) => ({ id, seq: (f?.seq ?? 0) + 1 }))}
            className="fixed inset-0 z-30 w-full border-l-0 lg:static lg:z-auto lg:w-[340px] lg:border-l"
          />
        )}
      </div>
      {canEdit && <ShareDialog planId={plan.id} open={share} onOpenChange={setShare} workspaceName={workspaceName ?? "seu workspace"} />}
      {presenting && !empty && <PresentationMode title={plan.title} document={document} resources={resources} onExit={stopPresenting} />}
    </div>
  );
}

/** Phones/tablets: header actions collapse into one menu. */
function MobileMenu({ planId, canEdit, onShare, onExport }: { planId: string; canEdit: boolean; onShare: () => void; onExport: (k: ExportKind) => void }) {
  const router = useRouter();
  return (
    <div className="md:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Mais opções">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && (
            <>
              <DropdownMenuItem onSelect={() => router.push(`/plans/${planId}/edit`)}>
                <Pencil /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onShare}>
                <Share2 /> Compartilhar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuLabel>Exportar</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => onExport("png")}>
            <ImageDown /> Imagem PNG
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onExport("svg")}>
            <Download /> Vetor SVG
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onExport("pdf")}>
            <Printer /> PDF (imprimir)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onExport("json")}>
            <FileJson /> JSON
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="wp-no-print mx-3 mb-1 flex items-center gap-2.5 rounded-xl border border-amber-line bg-amber-bg px-4 py-2.5 text-[13px] text-amber-ink sm:mx-5">
      <Info className="size-4 shrink-0" aria-hidden />
      <p>{children}</p>
    </div>
  );
}
