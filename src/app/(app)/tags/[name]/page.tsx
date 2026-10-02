import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { ChevronLeft, Boxes } from "lucide-react";
import { requireWorkspace } from "@/server/services/workspaces";
import { getTagByName } from "@/server/services/tags";
import { listFavorites } from "@/server/services/links";
import { listPlans } from "@/server/services/plans";
import { getDb, schema } from "@/server/db";
import { planAccess } from "@/server/services/permissions";
import { PlanThumb } from "@/components/plan-thumb";
import { Badge, EmptyState } from "@/components/ui/misc";
import { LinkRow } from "@/features/home/link-row";
import { timeAgo } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }) {
  return { title: `#${decodeURIComponent((await params).name)}` };
}

export default async function TagPage({ params }: { params: Promise<{ name: string }> }) {
  const ctx = await requireWorkspace();
  const name = decodeURIComponent((await params).name);
  const tag = getTagByName(ctx.workspace.id, name);
  if (!tag) notFound();

  const taggedPlanIds = new Set(
    getDb().select({ id: schema.planTags.planId }).from(schema.planTags).where(eq(schema.planTags.tagId, tag.id)).all().map((r) => r.id),
  );
  const plans = listPlans(ctx.user.id, ctx.workspace.id, "all").filter((p) => taggedPlanIds.has(p.id) && !p.isTemplate);
  const links = listFavorites(ctx.workspace.id, ctx.user.id, { tags: [tag.name], sort: "recent" });

  // Blocks (plan nodes) carrying this tag, via the FTS "tags" column.
  const nodeHits = getDb()
    .$client.prepare(
      `SELECT parent_id AS planId, entity_id AS id, title FROM search_index
        WHERE search_index MATCH ? AND workspace_id = ? AND entity_type = 'node' LIMIT 30`,
    )
    .all(`tags : "${tag.name.replace(/"/g, "")}"`, ctx.workspace.id) as { planId: string; id: string; title: string }[];
  const nodePlans = nodeHits.length
    ? getDb()
        .select()
        .from(schema.plans)
        .where(and(inArray(schema.plans.id, [...new Set(nodeHits.map((n) => n.planId))]), isNull(schema.plans.archivedAt)))
        .all()
        .filter((p) => planAccess(ctx.user.id, p))
    : [];
  const planTitle = new Map(nodePlans.map((p) => [p.id, p.title]));
  const nodes = nodeHits.filter((n) => planTitle.has(n.planId));

  return (
    <main className="scrollbar-thin flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-10 px-6 pb-16 pt-10 sm:px-10">
        <div className="flex flex-col gap-3">
          <Link href="/tags" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
            <ChevronLeft className="size-4" /> Tags
          </Link>
          <h1 className="font-display text-[48px] leading-none">
            <span className="text-muted">#</span>
            {tag.name}
          </h1>
          <div className="flex gap-6 text-sm text-muted">
            <span>
              <b className="text-2xl font-semibold text-ink">{plans.length}</b> plans
            </span>
            <span>
              <b className="text-2xl font-semibold text-ink">{links.length}</b> links
            </span>
            {nodes.length > 0 && (
              <span>
                <b className="text-2xl font-semibold text-ink">{nodes.length}</b> blocos
              </span>
            )}
          </div>
        </div>

        {plans.length + links.length + nodes.length === 0 && <EmptyState title="Nada com esta tag ainda" description="Adicione a tag a links, plans ou blocos." />}

        {plans.length > 0 && (
          <section className="flex flex-col gap-3.5">
            <h2 className="text-[13px] font-semibold text-ink-2">Plans</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((p) => (
                <Link key={p.id} href={`/plans/${p.id}`} className="flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface transition-shadow hover:shadow-pop">
                  <PlanThumb nodes={p.thumbnail} />
                  <div className="flex items-center justify-between gap-2 px-4 py-3.5">
                    <span className="truncate text-[15px] font-semibold">{p.title}</span>
                    {p.publishedVersionId ? <Badge tone="success">Publicado</Badge> : <Badge tone="amber">Rascunho</Badge>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {nodes.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[13px] font-semibold text-ink-2">Blocos</h2>
            <div className="flex flex-wrap gap-2">
              {nodes.map((n) => (
                <Link
                  key={n.id}
                  href={`/plans/${n.planId}?node=${n.id.split(":")[1]}`}
                  className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] hover:border-accent-line"
                >
                  <Boxes className="size-4 text-muted" />
                  <span className="text-muted">{planTitle.get(n.planId)} →</span>
                  <span className="font-medium">{n.title}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {links.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-ink-2">Links</h2>
              <Link href={`/links?tag=${encodeURIComponent(tag.name)}`} className="text-[13px] text-accent-ink hover:underline">
                Abrir na biblioteca
              </Link>
            </div>
            <div className="-mx-3 grid gap-0.5 md:grid-cols-2">
              {links.map((l) => (
                <LinkRow key={l.id} id={l.id} title={l.title} url={l.url} domain={l.domain} favicon={l.favicon} openBehavior={l.openBehavior} when={l.collectionName ?? timeAgo(l.createdAt)} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
