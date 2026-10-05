import Link from "next/link";
import { ArrowRight, Folder, Inbox, Pin, Unlink, Upload, Workflow, Zap } from "lucide-react";
import { requireWorkspace } from "@/server/services/workspaces";
import { recentPlans, pinnedPlans } from "@/server/services/home";
import { pinnedCollections, quickAccess, recentFavorites } from "@/server/services/links";
import { libraryCounts, visibleTree } from "@/features/links/server-data";
import { CollectionTile } from "@/features/links/collection-style";
import { SpeedDial } from "@/features/home/speed-dial";
import { WorkspaceSwitcher } from "@/components/shell/workspace-switcher";
import { PlanThumb } from "@/components/plan-thumb";
import { Badge } from "@/components/ui/misc";
import { Greeting } from "@/features/home/greeting";
import { AddLinkButton, NewPlanButton, SearchBar } from "@/features/home/home-actions";
import { LinkRow } from "@/features/home/link-row";
import { cn, timeAgo } from "@/lib/utils";
import { after } from "next/server";
import { recentlyBroken, sweepStaleLinks } from "@/server/services/link-health";
import { isDesktop } from "@/server/desktop";
import { desktopSecurity } from "@/server/desktop-security";
import { DesktopCockpit } from "@/features/home/desktop-cockpit";

export const metadata = { title: "Início" };

function SectionHeader({ title, href, linkLabel, icon }: { title: string; href?: string; linkLabel?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
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
  );
}

export default async function HomePage() {
  const ctx = await requireWorkspace();
  const plans = recentPlans(ctx.user.id, ctx.workspace.id, 3);
  const links = recentFavorites(ctx.user.id, ctx.workspace.id, 5);
  const pinnedCols = pinnedCollections(ctx.user.id, ctx.workspace.id);
  const pinnedPl = pinnedPlans(ctx.user.id, ctx.workspace.id);
  const { tree, hidden } = visibleTree(ctx.workspace.id, ctx.user.id);
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
  const shownCols = pinnedCols.length ? pinnedCols : [...tree].sort((a, b) => b.totalCount - a.totalCount).slice(0, 4);
  const empty = plans.length === 0 && links.length === 0 && tree.length === 0;
  const [lastPlan, ...otherPlans] = plans;

  return (
    <main className="scrollbar-thin flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-10 px-6 pb-16 pt-12 sm:px-12 sm:pt-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col items-start gap-3">
            <WorkspaceSwitcher current={ctx.workspace} workspaces={ctx.workspaces} />
            <Greeting name={ctx.user.name} />
          </div>
          <div className="flex gap-2">
            <NewPlanButton />
            <AddLinkButton />
          </div>
        </div>

        <SearchBar />

        {isDesktop() && <DesktopCockpit security={desktopSecurity()} />}

        {empty && (
          <section className="grid gap-4 sm:grid-cols-3">
            {[
              { href: "/plans", icon: <Workflow />, title: "Desenhe seu primeiro plan", text: "Blocos, containers e conexões para mapear um projeto." },
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

        {!empty && (
          <section className="flex flex-col gap-3.5">
            <SectionHeader title="Acesso rápido" icon={<Zap />} href="/links?sort=foryou" linkLabel="Para você" />
            <SpeedDial links={dial} />
          </section>
        )}

        {(signals.broken > 0 || signals.unsorted > 0 || signals.inbox > 0) && (
          <section aria-label="Pede atenção" className="flex flex-wrap gap-2.5">
            {signals.broken > 0 && (
              <Signal href="/links?scope=broken" icon={<Unlink />} tone="danger">
                {signals.broken} {signals.broken === 1 ? "link quebrado" : "links quebrados"}
                {newlyBroken > 0 && newlyBroken < signals.broken ? ` · ${newlyBroken} esta semana` : newlyBroken === signals.broken ? " esta semana" : ""}
              </Signal>
            )}
            {signals.inbox > 0 && (
              <Signal href="/links?scope=inbox" icon={<Inbox />} tone="accent">
                {signals.inbox} {signals.inbox === 1 ? "link na caixa de entrada" : "links na caixa de entrada"}
              </Signal>
            )}
            {signals.unsorted > 0 && (
              <Signal href="/links?scope=unsorted" icon={<Inbox />}>
                {signals.unsorted} {signals.unsorted === 1 ? "link sem coleção" : "links sem coleção"} para organizar
              </Signal>
            )}
          </section>
        )}

        {lastPlan && (
          <section className="flex flex-col gap-3.5">
            <SectionHeader title="Continuar de onde parou" href="/plans" linkLabel="Todos os plans" />
            <div className="grid gap-4 sm:grid-cols-3 sm:grid-rows-2">
              <PlanCard plan={lastPlan} hero />
              {otherPlans.map((p) => (
                <PlanCard key={p.id} plan={p} />
              ))}
            </div>
          </section>
        )}

        {(links.length > 0 || shownCols.length > 0 || pinnedPl.length > 0) && (
          <div className="grid gap-8 md:grid-cols-2">
            <section className="flex flex-col gap-2.5">
              <SectionHeader title="Links recentes" href="/links" linkLabel="Biblioteca" />
              {links.length ? (
                <div className="-mx-3 flex flex-col gap-0.5">
                  {links.map((l) => (
                    <LinkRow key={l.id} id={l.id} title={l.title} url={l.url} domain={l.domain} favicon={l.icon || l.favicon} openBehavior={l.openBehavior} when={timeAgo(l.at)} />
                  ))}
                </div>
              ) : (
                <p className="text-body text-muted">Os links que você abrir aparecem aqui.</p>
              )}
            </section>
            <section className="flex flex-col gap-3.5">
              <SectionHeader title={pinnedCols.length || pinnedPl.length ? "Fixados" : "Coleções"} icon={<Pin />} href="/links" linkLabel="Organizar" />
              <div className="grid grid-cols-2 gap-3">
                {pinnedPl.map((p) => (
                  <Link
                    key={p.id}
                    href={`/plans/${p.id}`}
                    className="flex flex-col gap-3.5 rounded-card border border-line bg-surface p-4 transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-raise"
                  >
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-control bg-accent-soft text-accent-ink">
                      <Workflow className="size-[18px]" />
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="truncate text-lead font-semibold">{p.title}</span>
                      <span className="text-body text-muted">Plan</span>
                    </span>
                  </Link>
                ))}
                {shownCols.map((c) => (
                  <Link
                    key={c.id}
                    href={`/links?c=${c.id}`}
                    className="flex flex-col gap-3.5 rounded-card border border-line bg-surface p-4 transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-raise"
                  >
                    <CollectionTile icon={c.icon} color={c.color} size={36} />
                    <span className="flex flex-col gap-0.5">
                      <span className="truncate text-lead font-semibold">{c.name}</span>
                      <span className="text-body text-muted">
                        {counts.get(c.id) ?? 0} {(counts.get(c.id) ?? 0) === 1 ? "link" : "links"}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function Signal({ href, icon, tone, children }: { href: string; icon: React.ReactNode; tone?: "danger" | "accent"; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-body transition-colors [&>svg]:size-4",
        tone === "danger"
          ? "border-danger/25 bg-danger-soft text-danger hover:border-danger/50"
          : tone === "accent"
            ? "border-accent-line bg-accent-soft text-accent-ink hover:border-accent"
            : "border-line bg-surface text-ink-2 hover:border-line-2 hover:text-ink",
      )}
    >
      {icon}
      <span>{children}</span>
      <ArrowRight className="!size-3.5 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
    </Link>
  );
}

type PlanCardData = { id: string; title: string; published: boolean; updatedAt: Date; thumbnail: Parameters<typeof PlanThumb>[0]["thumb"] };

function PlanCard({ plan, hero }: { plan: PlanCardData; hero?: boolean }) {
  return (
    <Link
      href={plan.published ? `/plans/${plan.id}` : `/plans/${plan.id}/edit`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-raise",
        hero && "sm:col-span-2 sm:row-span-2",
      )}
    >
      <div className="flex flex-1 flex-col justify-center bg-surface-2">
        <PlanThumb thumb={plan.thumbnail} height={hero ? 248 : 116} />
      </div>
      <div className="flex flex-col gap-1.5 px-4 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("truncate font-semibold", hero ? "text-title" : "text-lead")}>{plan.title}</span>
          {plan.published ? <Badge tone="success">Publicado</Badge> : <Badge tone="amber">Rascunho</Badge>}
        </div>
        <span className="flex items-center justify-between text-body text-muted">
          <span suppressHydrationWarning>editado {timeAgo(plan.updatedAt)}</span>
          {hero && (
            <span className="inline-flex items-center gap-1 font-medium text-accent-ink opacity-0 transition-opacity group-hover:opacity-100 max-sm:hidden">
              Abrir <ArrowRight className="size-3.5" aria-hidden />
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}
