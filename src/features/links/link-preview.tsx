"use client";
import * as React from "react";
import Link from "next/link";
import { Dialog as D } from "radix-ui";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Lock, Maximize2, PanelRight, Pencil, Shield, Star, Timer, Workflow, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/input";
import { SiteIcon, TagChip } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CollectionGlyph } from "./collection-style";
import { alwaysNewTab, getPref, PREF_PREVIEW_MODE, setAlwaysNewTab, setPref } from "./prefs";
import { recordOpen } from "./link-opener";
import type { LinkDetail, LinkItem } from "./types";

type Embed = { state: "checking" } | { state: "ok" } | { state: "blocked"; reason?: string };
const LOAD_TIMEOUT_MS = 12_000;

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" });

export function LinkPreview({
  linkId,
  initial,
  onClose,
  onEdit,
  onToggleStar,
}: {
  linkId: string | null;
  initial?: LinkItem;
  onClose: () => void;
  onEdit: (link: LinkItem) => void;
  onToggleStar: (link: LinkItem) => Promise<boolean | null>;
}) {
  const [mode, setMode] = React.useState<"modal" | "side">("modal");
  React.useEffect(() => setMode(getPref(PREF_PREVIEW_MODE, ["modal", "side"] as const, "modal")), []);
  const toggleMode = () =>
    setMode((m) => {
      const next = m === "modal" ? "side" : "modal";
      setPref(PREF_PREVIEW_MODE, next);
      return next;
    });

  return (
    <D.Root open={!!linkId} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className={cn("fixed inset-0 z-50 data-[state=open]:animate-[wp-in_120ms_ease-out]", mode === "modal" ? "bg-scrim" : "bg-scrim/30")} />
        <D.Content
          aria-describedby={undefined}
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden bg-surface text-ink shadow-pop outline-none data-[state=open]:animate-in",
            mode === "modal"
              ? "left-1/2 top-[3vh] h-[94vh] w-[calc(100vw-32px)] max-w-[1160px] -translate-x-1/2 rounded-[18px]"
              : "bottom-0 right-0 top-0 w-[min(720px,100vw)] border-l border-line",
          )}
        >
          {linkId && <PreviewBody key={linkId} linkId={linkId} initial={initial} mode={mode} onToggleMode={toggleMode} onClose={onClose} onEdit={onEdit} onToggleStar={onToggleStar} />}
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
}: {
  linkId: string;
  initial?: LinkItem;
  mode: "modal" | "side";
  onToggleMode: () => void;
  onClose: () => void;
  onEdit: (link: LinkItem) => void;
  onToggleStar: (link: LinkItem) => Promise<boolean | null>;
}) {
  const [detail, setDetail] = React.useState<LinkDetail | null>(null);
  const [missing, setMissing] = React.useState(false);
  const [embed, setEmbed] = React.useState<Embed>({ state: "checking" });
  const [loaded, setLoaded] = React.useState(false);
  const [slow, setSlow] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [starred, setStarred] = React.useState<boolean | null>(null);
  const link = detail?.link ?? initial ?? null;

  React.useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/links/${linkId}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) {
          setMissing(true);
          return;
        }
        setDetail((await r.json()) as LinkDetail);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [linkId]);

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
      className={mode === "modal" ? "w-[280px] shrink-0 border-l border-line" : "border-t border-line"}
    />
  );

  return (
    <>
      <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-line pl-5 pr-3.5">
        <SiteIcon src={iconSrc} label={link.domain || link.title} size={30} />
        <div className="flex min-w-0 flex-col">
          <D.Title className="truncate text-[15px] font-semibold">{link.title}</D.Title>
          <span className="truncate font-mono text-xs text-muted">{link.domain}</span>
        </div>
        <div className="flex-1" />
        <Tooltip content={isStarred ? "Remover dos favoritos" : "Favoritar"}>
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
          <Button size="icon" variant="ghost" aria-label="Alternar modal e painel lateral" onClick={onToggleMode}>
            {mode === "modal" ? <PanelRight /> : <Maximize2 />}
          </Button>
        </Tooltip>
        <Button asChild size="sm" variant="secondary" className="h-[34px]">
          <a href={link.url} target="_blank" rel="noopener noreferrer" onClick={openTab}>
            <ExternalLink />
            Nova aba
          </a>
        </Button>
        <D.Close asChild>
          <Button size="icon" variant="ghost" aria-label="Fechar">
            <X />
          </Button>
        </D.Close>
      </header>
      <div className={cn("flex min-h-0 flex-1", mode === "side" && "flex-col overflow-y-auto")}>
        <div className={cn("flex min-w-0 flex-1 flex-col gap-2.5 bg-surface-2 p-4", mode === "side" && "min-h-[60vh]")}>
          {embed.state === "checking" && (
            <div className="flex flex-1 items-center justify-center rounded-[10px] border border-line bg-surface">
              <span className="inline-flex items-center gap-2 text-[13px] text-muted">
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
              <div className="relative flex flex-1 overflow-hidden rounded-[10px] border border-line bg-white">
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
                    <span className="flex-1 text-[13px] text-ink-2">A página está demorando para carregar. Talvez ela não permita ser exibida aqui.</span>
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
    <div className="flex flex-1 items-center justify-center rounded-[10px] border border-dashed border-line-2 bg-surface-2 p-6">
      <div className="flex max-w-[420px] flex-col items-center gap-3.5 text-center">
        <span className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-amber-bg text-amber-ink">
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
          className="mt-1 inline-flex h-10 items-center gap-2 rounded-[10px] bg-accent px-[18px] text-sm font-medium text-white hover:brightness-110"
        >
          Abrir em nova aba
          <ExternalLink className="size-[15px]" aria-hidden />
        </a>
        {link.domain && (
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
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

function InfoPanel({ link, detail, onEdit, className }: { link: LinkItem; detail: LinkDetail | null; onEdit?: () => void; className?: string }) {
  const path = detail?.path ?? [];
  const parent = path.slice(0, -1).map((p) => p.name).join(" / ");
  return (
    <aside className={cn("scrollbar-thin flex flex-col gap-5 overflow-y-auto p-5", className)} aria-label="Detalhes do link">
      {link.description && (
        <section className="flex flex-col gap-2">
          <SectionLabel>Resumo</SectionLabel>
          <p className="text-[13px] leading-5 text-ink-2">{link.description}</p>
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
          <Link href={`/links?c=${link.collectionId}`} className="flex items-center gap-2 rounded-md text-[13px] hover:text-accent-ink">
            <CollectionGlyph />
            <span className="min-w-0 truncate">
              {parent && <span className="text-muted">{parent} / </span>}
              {path.at(-1)?.name ?? link.collectionName}
            </span>
          </Link>
        ) : (
          <Link href="/links?scope=unsorted" className="text-[13px] text-muted hover:text-ink">
            Sem coleção
          </Link>
        )}
      </section>
      <section className="flex flex-col gap-1.5">
        <SectionLabel>Usado em</SectionLabel>
        {!detail ? (
          <span className="h-4 w-32 animate-pulse rounded bg-subtle" aria-label="Carregando" />
        ) : detail.backlinks.length === 0 ? (
          <p className="text-[13px] text-muted">Ainda não aparece em nenhum plan.</p>
        ) : (
          detail.backlinks.map((b) => (
            <Link
              key={`${b.planId}:${b.nodeId}`}
              href={`/plans/${b.planId}?node=${encodeURIComponent(b.nodeId)}`}
              className="-mx-2 flex items-center gap-2.5 rounded-lg p-2 hover:bg-hover"
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-accent-soft text-accent-ink">
                <Workflow className="size-3.5" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-medium">{b.planTitle}</span>
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
