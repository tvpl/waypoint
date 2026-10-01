import Link from "next/link";
import { Pin, Folder, Workflow, Upload } from "lucide-react";
import { requireWorkspace } from "@/server/services/workspaces";
import { recentPlans, pinnedPlans } from "@/server/services/home";
import { pinnedCollections, recentFavorites, getCollectionTree } from "@/server/services/links";
import { WorkspaceSwitcher } from "@/components/shell/workspace-switcher";
import { PlanThumb } from "@/components/plan-thumb";
import { Badge } from "@/components/ui/misc";
import { Greeting } from "@/features/home/greeting";
import { AddLinkButton, NewPlanButton, SearchBar } from "@/features/home/home-actions";
import { LinkRow } from "@/features/home/link-row";
import { monogramColors } from "@/lib/color";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Início" };

function SectionHeader({ title, href, linkLabel, icon }: { title: string; href?: string; linkLabel?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 [&_svg]:size-3.5 [&_svg]:text-muted">
        {icon}
        {title}
      </h2>
      {href && (
        <Link href={href} className="text-[13px] text-accent-ink hover:underline">
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
  const tree = getCollectionTree(ctx.workspace.id);
  const counts = new Map<string, number>();
  const walk = (ns: typeof tree) => ns.forEach((n) => (counts.set(n.id, n.totalCount), walk(n.children)));
  walk(tree);
  // Without pins, suggest the biggest top-level collections.
  const shownCols = pinnedCols.length ? pinnedCols : [...tree].sort((a, b) => b.totalCount - a.totalCount).slice(0, 4);
  const empty = plans.length === 0 && links.length === 0 && tree.length === 0;

  return (
    <main className="scrollbar-thin flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-10 px-6 pb-16 pt-12 sm:px-12 sm:pt-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-3">
            <WorkspaceSwitcher current={ctx.workspace} workspaces={ctx.workspaces} />
            <Greeting name={ctx.user.name} />
          </div>
          <div className="flex gap-2">
            <NewPlanButton />
            <AddLinkButton />
          </div>
        </div>

        <SearchBar />

        {empty && (
          <section className="grid gap-4 sm:grid-cols-3">
            {[
              { href: "/plans", icon: <Workflow />, title: "Desenhe seu primeiro plan", text: "Blocos, containers e conexões para mapear um projeto." },
              { href: "/links?add=1", icon: <Folder />, title: "Salve um link", text: "Cole uma URL — título, imagem e ícone vêm sozinhos." },
              { href: "/links/import", icon: <Upload />, title: "Importe seus favoritos", text: "Traga as pastas do Chrome, Edge, Firefox ou Safari." },
            ].map((c) => (
              <Link key={c.href} href={c.href} className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-5 transition-shadow hover:shadow-pop">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent-soft text-accent-ink [&_svg]:size-[18px]">{c.icon}</span>
                <span className="text-[15px] font-semibold">{c.title}</span>
                <span className="text-[13px] leading-5 text-muted">{c.text}</span>
              </Link>
            ))}
          </section>
        )}

        {plans.length > 0 && (
          <section className="flex flex-col gap-3.5">
            <SectionHeader title="Plans recentes" href="/plans" linkLabel="Ver todos" />
            <div className="grid gap-4 sm:grid-cols-3">
              {plans.map((p) => (
                <Link
                  key={p.id}
                  href={p.published ? `/plans/${p.id}` : `/plans/${p.id}/edit`}
                  className="flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-pop"
                >
                  <PlanThumb nodes={p.thumbnail} />
                  <div className="flex flex-col gap-1.5 px-4 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[15px] font-semibold">{p.title}</span>
                      {p.published ? <Badge tone="success">Publicado</Badge> : <Badge tone="amber">Rascunho</Badge>}
                    </div>
                    <span className="text-[13px] text-muted">editado {timeAgo(p.updatedAt)}</span>
                  </div>
                </Link>
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
                    <LinkRow key={l.id} id={l.id} title={l.title} url={l.url} domain={l.domain} favicon={l.favicon} openBehavior={l.openBehavior} when={timeAgo(l.at)} />
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-muted">Os links que você abrir aparecem aqui.</p>
              )}
            </section>
            <section className="flex flex-col gap-3.5">
              <SectionHeader title={pinnedCols.length || pinnedPl.length ? "Fixados" : "Coleções"} icon={<Pin />} href="/links" linkLabel="Organizar" />
              <div className="grid grid-cols-2 gap-3">
                {pinnedPl.map((p) => (
                  <Link key={p.id} href={`/plans/${p.id}`} className="flex flex-col gap-3.5 rounded-[14px] border border-line bg-surface p-4 transition-shadow hover:shadow-pop">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent-soft text-accent-ink">
                      <Workflow className="size-[18px]" />
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="truncate text-[15px] font-semibold">{p.title}</span>
                      <span className="text-[13px] text-muted">Plan</span>
                    </span>
                  </Link>
                ))}
                {shownCols.map((c) => {
                  const tone = c.color ? { bg: c.color, fg: "#17171C" } : monogramColors(c.name);
                  return (
                    <Link key={c.id} href={`/links?c=${c.id}`} className="flex flex-col gap-3.5 rounded-[14px] border border-line bg-surface p-4 transition-shadow hover:shadow-pop">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px]" style={{ background: tone.bg, color: tone.fg }}>
                        <Folder className="size-[18px]" />
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="truncate text-[15px] font-semibold">{c.name}</span>
                        <span className="text-[13px] text-muted">{counts.get(c.id) ?? 0} links</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
