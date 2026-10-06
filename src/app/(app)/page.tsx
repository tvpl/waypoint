import Link from "next/link";
import { ArrowRight, Check, Folder, Inbox, Layers, MessageSquare, Pin, Unlink, Upload, Workflow, Zap } from "lucide-react";
import { canEditWorkspace, requireWorkspace } from "@/server/services/workspaces";
import { plansWithOpenThreads, recentPlans } from "@/server/services/home";
import { listFavorites, pinnedCollections, quickAccess } from "@/server/services/links";
import { libraryCounts, visibleTree } from "@/features/links/server-data";
import { CollectionTile } from "@/features/links/collection-style";
import { SpeedDial } from "@/features/home/speed-dial";
import { WorkspaceSwitcher } from "@/components/shell/workspace-switcher";
import { PlanThumb } from "@/components/plan-thumb";
import { Badge } from "@/components/ui/misc";
import { Greeting } from "@/features/home/greeting";
import { SearchBar } from "@/features/home/home-actions";
import { QuickCreate } from "@/features/home/quick-create";
import { LinkRow } from "@/features/home/link-row";
import { cn, timeAgo } from "@/lib/utils";
import { after } from "next/server";
import { recentlyBroken, sweepStaleLinks } from "@/server/services/link-health";
import type { HomePlan } from "@/server/services/home";

export const metadata = { title: "Início" };

function SectionHeader({ title, href, linkLabel, icon }: { title: string; href?: string; linkLabel?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-1.5 text-body font-semibold text-ink-2 [&_svg]:size-3.5 [&_svg]:text-muted">
        {icon}
        {title}
      </h2>
      {href && (
        <Link href={href} className="inline-flex items-center gap-1 text-body text-accent-ink hover:underline">
          {linkLabel} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/**
 * Home ("mesa de trabalho"): straight to work — create, the diagrams you were on, what needs
 * attention, the inbox and the links you use most.
 */
export default async function HomePage() {
  const ctx = await requireWorkspace();
  const plans = recentPlans(ctx.user.id, ctx.workspace.id, 4);
  const threads = plansWithOpenThreads(ctx.user.id, ctx.workspace.id);
  const pinnedCols = pinnedCollections(ctx.user.id, ctx.workspace.id);
  const { tree, hidden } = visibleTree(ctx.workspace.id, ctx.user.id);
  const inbox = listFavorites(ctx.workspace.id, ctx.user.id, { scope: "inbox", limit: 5 });
  const dial = quickAccess(ctx.user.id, ctx.workspace.id, 12, { padWithRecent: true }).map((l) => ({
    id: l.id,
    title: l.title,
    url: l.url,
    domain: l.domain,
    favicon: l.favicon,
    icon: l.icon,
    openBehavior: l.openBehavior,
    pinned: l.pinned,
  }));
  const signals = libraryCounts(ctx.workspace.id, ctx.user.id, hidden, 0);
  const newlyBroken = recentlyBroken(ctx.workspace.id, hidden);
  after(() => sweepStaleLinks(ctx.workspace.id).catch(() => null));
  const counts = new Map<string, number>();
  const walk = (ns: typeof tree) => ns.forEach((n) => (counts.set(n.id, n.totalCount), walk(n.children)));
  walk(tree);
  // Without pins, suggest the biggest top-level collections.
  const shownCols = pinnedCols.length ? pinnedCols : [...tree].sort((a, b) => b.totalCount - a.totalCount).slice(0, 6);
  const empty = plans.length === 0 && dial.length === 0 && tree.length === 0;
  const attention = threads.length > 0 || signals.broken > 0 || signals.unsorted > 0;

  return (
    <main className="scrollbar-thin flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-9 px-6 pb-16 pt-10 sm:px-10 sm:pt-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Greeting name={ctx.user.name} />
          <WorkspaceSwitcher current={ctx.workspace} workspaces={ctx.workspaces} />
        </header>

        <SearchBar />

        <QuickCreate canCreate={canEditWorkspace(ctx.role)} />

        {empty && (
          <section className="grid gap-4 sm:grid-cols-3">
            {[
              { href: "/plans", icon: <Workflow />, title: "Desenhe seu primeiro plan", text: "Blocos, conexões, camadas e desenho livre para mapear um projeto." },
              { href: "/links?add=1", icon: <Folder />, title: "Salve um link", text: "Cole uma URL — título, imagem e ícone vêm sozinhos." },
              { href: "/links/import", icon: <Upload />, title: "Importe seus favoritos", text: "Traga as pastas do Chrome, Edge, Firefox ou Safari." },
            ].map((c) => (
              <Link key={c.href} href={c.href} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 transition-shadow hover:shadow-pop">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-control bg-accent-soft text-accent-ink [&_svg]:size-[18px]">{c.icon}</span>
                <span className="text-lead font-semibold">{c.title}</span>
                <span className="text-body leading-5 text-muted">{c.text}</span>
              </Link>
            ))}
          </section>
        )}

        {plans.length > 0 && (
          <section className="flex flex-col gap-3">
            <SectionHeader title="Recentes" href="/plans" linkLabel="Todos os plans" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((p) => (
                <PlanCard key={p.id} plan={p} />
              ))}
            </div>
          </section>
        )}

        {!empty && (
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Pede atenção" icon={<Zap />}>
              {attention ? (
                <ul className="flex flex-col">
                  {threads.map((t) => (
                    <AttentionRow key={t.id} href={`/plans/${t.id}/edit`} icon={<MessageSquare />} tone="accent" meta={timeAgo(t.lastAt)}>
                      <b className="font-semibold">{t.threads}</b> {t.threads === 1 ? "conversa aberta" : "conversas abertas"} em <span className="font-medium">{t.title}</span>
                    </AttentionRow>
                  ))}
                  {signals.broken > 0 && (
                    <AttentionRow href="/links?scope=broken" icon={<Unlink />} tone="danger" meta={newlyBroken > 0 ? `${newlyBroken} esta semana` : undefined}>
                      <b className="font-semibold">{signals.broken}</b> {signals.broken === 1 ? "link quebrado" : "links quebrados"}
                    </AttentionRow>
                  )}
                  {signals.unsorted > 0 && (
                    <AttentionRow href="/links?scope=unsorted" icon={<Folder />}>
                      <b className="font-semibold">{signals.unsorted}</b> {signals.unsorted === 1 ? "link sem coleção" : "links sem coleção"}
                    </AttentionRow>
                  )}
                </ul>
              ) : (
                <p className="flex items-center gap-2 px-4 py-6 text-body text-muted">
                  <Check className="size-4 text-success-ink" aria-hidden /> Tudo em dia: nenhuma conversa aberta nem link quebrado.
                </p>
              )}
            </Panel>
            <Panel title="Caixa de entrada" icon={<Inbox />} href="/links?scope=inbox" linkLabel={signals.inbox ? `Organizar (${signals.inbox})` : "Abrir"}>
              {inbox.length ? (
                <div className="flex flex-col px-1 py-1">
                  {inbox.map((l) => (
                    <LinkRow key={l.id} id={l.id} title={l.title} url={l.url} domain={l.domain} favicon={l.icon || l.favicon} openBehavior={l.openBehavior} when={l.inboxAt ? timeAgo(l.inboxAt) : ""} />
                  ))}
                </div>
              ) : (
                <p className="px-4 py-6 text-body leading-5 text-muted">Links salvos pela captura rápida ou pela extensão chegam aqui para você organizar depois.</p>
              )}
            </Panel>
          </div>
        )}

        {dial.length > 0 && (
          <section className="flex flex-col gap-3">
            <SectionHeader title="Acesso rápido" icon={<Zap />} href="/links?sort=foryou" linkLabel="Para você" />
            <SpeedDial links={dial} />
          </section>
        )}

        {shownCols.length > 0 && (
          <section className="flex flex-col gap-3">
            <SectionHeader title={pinnedCols.length ? "Coleções fixadas" : "Coleções"} icon={<Pin />} href="/links" linkLabel="Biblioteca" />
            <div className="flex flex-wrap gap-2">
              {shownCols.map((c) => (
                <Link
                  key={c.id}
                  href={`/links?c=${c.id}`}
                  className="inline-flex h-11 items-center gap-2.5 rounded-xl border border-line bg-surface pl-2 pr-3.5 transition-[box-shadow,border-color] hover:border-line-2 hover:shadow-raise"
                >
                  <CollectionTile icon={c.icon} color={c.color} size={28} />
                  <span className="max-w-[180px] truncate text-body font-medium">{c.name}</span>
                  <span className="text-caption tabular-nums text-muted">{counts.get(c.id) ?? 0}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Panel({ title, icon, href, linkLabel, children }: { title: string; icon: React.ReactNode; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col overflow-hidden rounded-card border border-line bg-surface" aria-label={title}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-body font-semibold text-ink-2 [&_svg]:size-3.5 [&_svg]:text-muted">
          {icon}
          {title}
        </h2>
        {href && (
          <Link href={href} className="text-body text-accent-ink hover:underline">
            {linkLabel}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function AttentionRow({ href, icon, tone, meta, children }: { href: string; icon: React.ReactNode; tone?: "danger" | "accent"; meta?: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="group flex items-center gap-3 px-4 py-2.5 text-body transition-colors hover:bg-surface-2">
        <span
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-3.5",
            tone === "danger" ? "bg-danger-soft text-danger" : tone === "accent" ? "bg-accent-soft text-accent-ink" : "bg-subtle text-ink-2",
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {meta && (
          <span className="shrink-0 text-caption text-muted" suppressHydrationWarning>
            {meta}
          </span>
        )}
        <ArrowRight className="size-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </Link>
    </li>
  );
}

function PlanCard({ plan }: { plan: HomePlan }) {
  const extras = [plan.layerCount > 1 ? `${plan.layerCount} camadas` : null, plan.viewCount ? `${plan.viewCount} ${plan.viewCount === 1 ? "visão" : "visões"}` : null].filter(Boolean);
  return (
    <Link
      href={`/plans/${plan.id}/edit`}
      className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-raise"
    >
      <div className="flex flex-col justify-center border-b border-line bg-surface-2">
        <PlanThumb thumb={plan.thumbnail} height={140} />
      </div>
      <div className="flex flex-col gap-1.5 px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-body font-semibold">{plan.title}</span>
          {plan.published ? <Badge tone="success">Publicado</Badge> : <Badge tone="amber">Rascunho</Badge>}
        </div>
        <span className="flex min-w-0 items-center gap-1.5 text-caption text-muted">
          {extras.length > 0 && (
            <>
              <Layers className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{extras.join(" · ")}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <span className="shrink-0" suppressHydrationWarning>
            {timeAgo(plan.updatedAt)}
          </span>
        </span>
      </div>
    </Link>
  );
}
