"use client";
import * as React from "react";
import Link from "next/link";
import { Dialog as D } from "radix-ui";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Lock, Maximize2, PanelRight, Pencil, RefreshCw, Shield, Star, Timer, Waypoints, Workflow, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/input";
import { SiteIcon, TagChip } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CollectionGlyph } from "./collection-style";
import { alwaysNewTab, getPref, PREF_PREVIEW_MODE, setAlwaysNewTab, setPref } from "./prefs";
import { recordOpen } from "./link-opener";
import { checkedAgo, checkLinksNow, healthText, HealthMark, toHealthPatch } from "./health";
import { applyRedirectAction } from "@/app/(app)/links/actions";
import type { LinkDetail, LinkItem } from "./types";
import { isTypingTarget } from "@/lib/dom";

type Embed = { state: "checking" } | { state: "ok" } | { state: "blocked"; reason?: string };
const LOAD_TIMEOUT_MS = 12_000;

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" });

/** Previous / next link of the list behind the preview (← → or the header arrows). */
export type PreviewNav = { prev: string | null; next: string | null; index: number; total: number; go: (id: string) => void };

export function LinkPreview({
  linkId,
  initial,
  onClose,
  onEdit,
  onToggleStar,
  nav,
}: {
  linkId: string | null;
  initial?: LinkItem;
  onClose: () => void;
  onEdit: (link: LinkItem) => void;
  onToggleStar: (link: LinkItem) => Promise<boolean | null>;
  nav?: PreviewNav;
}) {
  const [mode, setMode] = React.useState<"modal" | "side">("modal");
  React.useEffect(() => setMode(getPref(PREF_PREVIEW_MODE, ["modal", "side"] as const, "modal")), []);
  // Keep the last link on screen while the panel animates out after linkId turns null.
  const [shown, setShown] = React.useState<{ id: string; initial?: LinkItem } | null>(linkId ? { id: linkId, initial } : null);
  if (linkId && linkId !== shown?.id) setShown({ id: linkId, initial });
  const toggleMode = () =>
    setMode((m) => {
      const next = m === "modal" ? "side" : "modal";
      setPref(PREF_PREVIEW_MODE, next);
      return next;
    });

  return (
    <D.Root open={!!linkId} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className={cn("fixed inset-0 z-50 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out", mode === "modal" ? "bg-scrim" : "bg-scrim/30")} />
        <D.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden bg-surface text-ink shadow-pop outline-none",
            mode === "modal"
              ? "left-1/2 top-[3vh] h-[94vh] w-[calc(100vw-32px)] max-w-[1160px] -translate-x-1/2 rounded-panel max-md:inset-0 max-md:h-full max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:rounded-none data-[state=open]:animate-in data-[state=closed]:animate-out"
              : "bottom-0 right-0 top-0 w-[min(720px,100vw)] border-l border-line data-[state=open]:animate-panel-in data-[state=closed]:animate-panel-out",
          )}
        >
          {shown && (
            <PreviewBody
              key={shown.id}
              linkId={shown.id}
              initial={shown.initial}
              mode={mode}
              onToggleMode={toggleMode}
              onClose={onClose}
              onEdit={onEdit}
              onToggleStar={onToggleStar}
              nav={linkId ? nav : undefined}
            />
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function PreviewBody({
  linkId,
  initial,
  mode,
  onToggleMode,
  onClose,
  onEdit,
  onToggleStar,
  nav,
}: {
  linkId: string;
  initial?: LinkItem;
  mode: "modal" | "side";
  onToggleMode: () => void;
  onClose: () => void;
  onEdit: (link: LinkItem) => void;
  onToggleStar: (link: LinkItem) => Promise<boolean | null>;
  nav?: PreviewNav;
}) {
  const [detail, setDetail] = React.useState<LinkDetail | null>(null);
  const [missing, setMissing] = React.useState(false);
  const [embed, setEmbed] = React.useState<Embed>({ state: "checking" });
  const [loaded, setLoaded] = React.useState(false);
  const [slow, setSlow] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [starred, setStarred] = React.useState<boolean | null>(null);
  const [rev, setRev] = React.useState(0);
  const link = detail?.link ?? initial ?? null;

  React.useEffect(() => {
    if (!nav) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const to = e.key === "ArrowLeft" ? nav.prev : e.key === "ArrowRight" ? nav.next : null;
      if (!to) return;
      e.preventDefault();
      nav.go(to);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  React.useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/links/${linkId}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          setMissing(true);
          return;
        }
        setDetail((await r.json()) as LinkDetail);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [linkId, rev]);

  const url = link?.url;
  React.useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    setEmbed({ state: "checking" });
    fetch(`/api/embed-check?url=${encodeURIComponent(url)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: { embeddable: boolean; reason?: string }) => setEmbed(d.embeddable ? { state: "ok" } : { state: "blocked", reason: d.reason }))
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setEmbed({ state: "blocked", reason: "Não foi possível verificar o site." });
      });
    return () => ctrl.abort();
  }, [url]);

  React.useEffect(() => {
    if (embed.state !== "ok" || loaded) return;
    const t = setTimeout(() => setSlow(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [embed.state, loaded]);

  if (missing && !link) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
        <D.Title className="text-lg font-semibold">Link não encontrado</D.Title>
        <p className="text-sm text-muted">Ele pode ter sido excluído ou você não tem acesso.</p>
        <Button onClick={onClose}>Fechar</Button>
      </div>
    );
  }
  if (!link) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <D.Title className="sr-only">Carregando link</D.Title>
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-2 border-t-accent" aria-label="Carregando" />
      </div>
    );
  }

  const isStarred = starred ?? link.starred;
  const iconSrc = link.icon || link.favicon;
  const openTab = () => {
    recordOpen(link.id);
  };

  const info = (
    <InfoPanel
      link={link}
      detail={detail}
      onEdit={detail?.canEdit ? () => onEdit(detail.link) : undefined}
      onHealthPatch={(patch) => setDetail((d) => (d ? { ...d, link: { ...d.link, ...patch } } : d))}
      onReload={() => setRev((r) => r + 1)}
      className={mode === "modal" ? "w-[280px] shrink-0 border-l border-line max-md:w-full max-md:border-l-0 max-md:border-t" : "border-t border-line"}
    />
  );

  return (
    <>
      <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-line pl-4 pr-2 sm:gap-3 sm:pl-5 sm:pr-3.5">
        <SiteIcon src={iconSrc} label={link.domain || link.title} size={30} />
        <div className="flex min-w-0 flex-col">
          <D.Title className="truncate text-lead font-semibold">{link.title}</D.Title>
          <span className="truncate font-mono text-xs text-muted">{link.domain}</span>
        </div>
        <div className="flex-1" />
        {nav && nav.total > 1 && (
          <div className="flex items-center gap-0.5 max-sm:hidden">
            <Tooltip content="Link anterior · ←">
              <Button size="icon" variant="ghost" aria-label="Link anterior" disabled={!nav.prev} onClick={() => nav.prev && nav.go(nav.prev)}>
                <ChevronLeft />
              </Button>
            </Tooltip>
            <span className="min-w-[52px] text-center font-mono text-caption text-muted" aria-live="polite">
              {nav.index + 1} / {nav.total}
            </span>
            <Tooltip content="Próximo link · →">
              <Button size="icon" variant="ghost" aria-label="Próximo link" disabled={!nav.next} onClick={() => nav.next && nav.go(nav.next)}>
                <ChevronRight />
              </Button>
            </Tooltip>
          </div>
        )}
        <Tooltip content={isStarred ? "Remover estrela" : "Marcar com estrela"}>
          <Button
            size="icon"
            variant="ghost"
            aria-label={isStarred ? "Remover dos favoritos" : "Favoritar"}
            aria-pressed={isStarred}
            onClick={async () => {
              setStarred(!isStarred);
              const res = await onToggleStar({ ...link, starred: isStarred });
              if (res === null) setStarred(isStarred);
            }}
          >
            <Star className={cn(isStarred && "fill-amber-ink text-amber-ink")} />
          </Button>
        </Tooltip>
        <Tooltip content={copied ? "Copiado" : "Copiar URL"}>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Copiar URL"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                toast.error("Não foi possível copiar.");
              }
            }}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </Tooltip>
        <Tooltip content={mode === "modal" ? "Abrir como painel lateral" : "Abrir como modal"}>
          <Button size="icon" variant="ghost" aria-label="Alternar modal e painel lateral" onClick={onToggleMode} className="max-md:hidden">
            {mode === "modal" ? <PanelRight /> : <Maximize2 />}
          </Button>
        </Tooltip>
        <Button asChild size="sm" variant="secondary" className="h-[34px]">
          <a href={link.url} target="_blank" rel="noopener noreferrer" onClick={openTab} aria-label="Abrir em nova aba">
            <ExternalLink />
            <span className="max-sm:hidden">Nova aba</span>
          </a>
        </Button>
        <D.Close asChild>
          <Button size="icon" variant="ghost" aria-label="Fechar">
            <X />
          </Button>
        </D.Close>
      </header>
      <div className={cn("flex min-h-0 flex-1", mode === "side" ? "flex-col overflow-y-auto" : "max-md:flex-col max-md:overflow-y-auto")}>
        <div className={cn("flex min-w-0 flex-1 flex-col gap-2.5 bg-surface-2 p-4 max-md:p-3", mode === "side" ? "min-h-[60vh]" : "max-md:min-h-[62vh]")}>
          {embed.state === "checking" && (
            <div className="flex flex-1 items-center justify-center rounded-control border border-line bg-surface">
              <span className="inline-flex items-center gap-2 text-body text-muted">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-2 border-t-accent" aria-hidden />
                Verificando se o site pode ser exibido aqui…
              </span>
            </div>
          )}
          {embed.state === "ok" && (
            <>
              <div className="flex items-center gap-2 text-xs text-muted">
                <Shield className="size-3.5" aria-hidden />
                <span>Exibido em iframe isolado (sandbox) · sem acesso à sua sessão do Waypoint</span>
              </div>
              <div className="relative flex flex-1 overflow-hidden rounded-control border border-line bg-white">
                <iframe
                  title={`Preview de ${link.title}`}
                  src={link.url}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                  referrerPolicy="no-referrer"
                  onLoad={() => {
                    setLoaded(true);
                    setSlow(false);
                  }}
                  className="h-full w-full flex-1 border-0"
                />
                {!loaded && !slow && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-2 border-t-accent" aria-label="Carregando página" />
                  </div>
                )}
                {slow && !loaded && (
                  <div className="absolute inset-x-4 bottom-4 flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-pop">
                    <Timer className="size-4 shrink-0 text-amber-ink" aria-hidden />
                    <span className="flex-1 text-body text-ink-2">A página está demorando para carregar. Talvez ela não permita ser exibida aqui.</span>
                    <Button asChild size="sm" variant="primary">
                      <a href={link.url} target="_blank" rel="noopener noreferrer" onClick={openTab}>
                        Abrir em nova aba
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
          {embed.state === "blocked" && <Blocked link={link} reason={embed.reason} />}
        </div>
        {info}
      </div>
    </>
  );
}

function Blocked({ link, reason }: { link: LinkItem; reason?: string }) {
  const [always, setAlways] = React.useState(false);
  React.useEffect(() => setAlways(alwaysNewTab(link.domain)), [link.domain]);
  return (
    <div className="flex flex-1 items-center justify-center rounded-control border border-dashed border-line-2 bg-surface-2 p-6">
      <div className="flex max-w-[420px] flex-col items-center gap-3.5 text-center">
        <span className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-card bg-amber-bg text-amber-ink">
          <Lock className="size-6" aria-hidden />
        </span>
        <p className="text-lg font-semibold">Este site não permite ser exibido aqui</p>
        <p className="text-sm leading-[21px] text-ink-2">
          {link.domain} {reason && !/bloqueia/.test(reason) ? `não pôde ser verificado (${reason.replace(/\.$/, "")}).` : "bloqueia incorporação em outras páginas."} Abra em
          uma nova aba para continuar — o Waypoint não contorna essa proteção.
        </p>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => recordOpen(link.id)}
          className="mt-1 inline-flex h-10 items-center gap-2 rounded-control bg-accent px-[18px] text-sm font-medium text-white hover:brightness-110"
        >
          Abrir em nova aba
          <ExternalLink className="size-[15px]" aria-hidden />
        </a>
        {link.domain && (
          <label className="flex items-center gap-2 text-body text-ink-2">
            <input
              type="checkbox"
              checked={always}
              onChange={(e) => {
                setAlways(e.target.checked);
                setAlwaysNewTab(link.domain, e.target.checked);
              }}
              className="m-0 accent-[var(--accent)]"
            />
            Sempre abrir {link.domain} em nova aba
          </label>
        )}
      </div>
    </div>
  );
}

function HealthSection({
  link,
  canEdit,
  onPatch,
  onReload,
}: {
  link: LinkItem;
  canEdit: boolean;
  onPatch: (patch: Partial<LinkItem>) => void;
  onReload: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"check" | "apply" | null>(null);
  const check = async () => {
    setBusy("check");
    try {
      const [r] = await checkLinksNow([link.id]);
      if (r) onPatch(toHealthPatch(r));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const apply = async () => {
    setBusy("apply");
    const r = await applyRedirectAction(link.id);
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success("URL atualizada");
    onReload();
  };
  const tone =
    link.healthStatus === "broken" || link.healthStatus === "unreachable"
      ? "text-danger"
      : link.healthStatus === "redirect"
        ? "text-amber-ink"
        : link.healthStatus === "ok"
          ? "text-success-ink"
          : "text-muted";
  return (
    <section className="flex flex-col gap-2" aria-live="polite">
      <SectionLabel>Status do link</SectionLabel>
      <p className={cn("flex items-start gap-2 text-body leading-5", tone)}>
        <HealthMark status={link.healthStatus} className="mt-1.5" />
        <span className="min-w-0" suppressHydrationWarning>
          {healthText(link, { withTime: false })}
          {link.healthCheckedAt && (
            <span className="block text-xs text-muted" suppressHydrationWarning>
              {checkedAgo(link.healthCheckedAt)}
            </span>
          )}
        </span>
      </p>
      {link.healthStatus === "redirect" && link.healthFinalUrl && (
        <a
          href={link.healthFinalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all rounded-md bg-subtle px-2 py-1.5 font-mono text-caption leading-4 text-ink-2 hover:text-ink"
        >
          {link.healthFinalUrl}
        </a>
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-1.5">
          {link.healthStatus === "redirect" && link.healthFinalUrl && (
            <Button size="sm" variant="soft" onClick={apply} disabled={!!busy}>
              <Waypoints />
              Atualizar para a nova URL
            </Button>
          )}
          {!link.archived && (
            <Button size="sm" variant="ghost" onClick={check} disabled={!!busy} className="-ml-1.5">
              <RefreshCw className={cn(busy === "check" && "animate-spin")} />
              {busy === "check" ? "Verificando…" : "Verificar agora"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function InfoPanel({
  link,
  detail,
  onEdit,
  onHealthPatch,
  onReload,
  className,
}: {
  link: LinkItem;
  detail: LinkDetail | null;
  onEdit?: () => void;
  onHealthPatch: (patch: Partial<LinkItem>) => void;
  onReload: () => void;
  className?: string;
}) {
  const path = detail?.path ?? [];
  const parent = path.slice(0, -1).map((p) => p.name).join(" / ");
  return (
    <aside className={cn("scrollbar-thin flex flex-col gap-5 overflow-y-auto p-5", className)} aria-label="Detalhes do link">
      {link.notes && (
        <section className="flex flex-col gap-2">
          <SectionLabel>Notas</SectionLabel>
          <p className="whitespace-pre-wrap rounded-control border border-amber-line/60 bg-amber-bg/50 px-3 py-2.5 text-body leading-5 text-amber-ink">{link.notes}</p>
        </section>
      )}
      {link.description && (
        <section className="flex flex-col gap-2">
          <SectionLabel>Resumo</SectionLabel>
          <p className="text-body leading-5 text-ink-2">{link.description}</p>
        </section>
      )}
      {link.tags.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionLabel>Tags</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {link.tags.map((t) => (
              <TagChip key={t} name={t} href={`/links?tag=${encodeURIComponent(t)}`} className="hover:bg-hover" />
            ))}
          </div>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <SectionLabel>Coleção</SectionLabel>
        {link.collectionId ? (
          <Link href={`/links?c=${link.collectionId}`} className="flex items-center gap-2 rounded-md text-body hover:text-accent-ink">
            <CollectionGlyph />
            <span className="min-w-0 truncate">
              {parent && <span className="text-muted">{parent} / </span>}
              {path.at(-1)?.name ?? link.collectionName}
            </span>
          </Link>
        ) : (
          <Link href="/links?scope=unsorted" className="text-body text-muted hover:text-ink">
            Sem coleção
          </Link>
        )}
      </section>
      {detail && <HealthSection link={detail.link} canEdit={detail.canEdit} onPatch={onHealthPatch} onReload={onReload} />}
      <section className="flex flex-col gap-1.5">
        <SectionLabel>Usado em</SectionLabel>
        {!detail ? (
          <span className="h-4 w-32 animate-pulse rounded bg-subtle" aria-label="Carregando" />
        ) : detail.backlinks.length === 0 ? (
          <p className="text-body text-muted">Ainda não aparece em nenhum plan.</p>
        ) : (
          detail.backlinks.map((b) => (
            <Link
              key={`${b.planId}:${b.nodeId}`}
              href={`/plans/${b.planId}?node=${encodeURIComponent(b.nodeId)}`}
              className="-mx-2 flex items-center gap-2.5 rounded-lg p-2 hover:bg-hover"
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-chip bg-accent-soft text-accent-ink">
                <Workflow className="size-3.5" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body font-medium">{b.planTitle}</span>
                <span className="truncate text-xs text-muted">Plan{b.nodeTitle ? ` · bloco “${b.nodeTitle}”` : ""}</span>
              </span>
            </Link>
          ))
        )}
      </section>
      <div className="flex-1" />
      <div className="flex flex-col gap-3">
        {onEdit && (
          <Button variant="secondary" size="sm" onClick={onEdit} className="self-start">
            <Pencil />
            Editar link
          </Button>
        )}
        <span className="text-xs text-muted">
          Adicionado em {dateFmt.format(link.createdAt)} · aberto {link.openCount} {link.openCount === 1 ? "vez" : "vezes"}
        </span>
      </div>
    </aside>
  );
}
