import * as React from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import { SiteIcon } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { Cover } from "./cover";
import { CollectionGlyph, CollectionTile } from "./collection-style";
import type { PublicCollectionData, PublicLink, PublicNode } from "./public-data";

/**
 * Read-only, rail-less rendering of a shared collection (server-compatible: no hooks).
 * Usage on /share/[token]:
 *   const data = loadPublicCollection(share.resourceId, searchParams.c);
 *   <PublicCollectionView {...data} basePath={`/share/${token}`} />
 * Sub-collection links point to `${basePath}?c=<id>`.
 */
export function PublicCollectionView({
  collection,
  path,
  children,
  links,
  basePath = "",
}: Pick<PublicCollectionData, "collection" | "path" | "children" | "links"> & { basePath?: string }) {
  const href = (id: string) => (id === path[0]?.id ? basePath || "?" : `${basePath}?c=${encodeURIComponent(id)}`);
  const direct = links.filter((l) => l.collectionId === collection.id);
  const sections: { node: PublicNode; trail: string[] }[] = [];
  const walk = (nodes: PublicNode[], trail: string[]) => {
    for (const n of nodes) {
      sections.push({ node: n, trail });
      walk(n.children, [...trail, n.name]);
    }
  };
  walk(children, []);
  const byCollection = new Map<string, PublicLink[]>();
  for (const l of links) if (l.collectionId) byCollection.set(l.collectionId, [...(byCollection.get(l.collectionId) ?? []), l]);

  return (
    <div className="min-h-app bg-bg text-ink">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-5 py-10 sm:px-8">
        <header className="flex flex-col gap-3">
          {path.length > 1 && (
            <nav aria-label="Caminho" className="flex flex-wrap items-center gap-1.5 text-body text-muted">
              {path.map((p, i) => (
                <React.Fragment key={p.id}>
                  {i > 0 && <ChevronRight className="size-3" aria-hidden />}
                  {i === path.length - 1 ? (
                    <span className="text-ink" aria-current="page">
                      {p.name}
                    </span>
                  ) : (
                    <a href={href(p.id)} className="hover:text-ink">
                      {p.name}
                    </a>
                  )}
                </React.Fragment>
              ))}
            </nav>
          )}
          <div className="flex items-start gap-4">
            <CollectionTile icon={collection.icon} color={collection.color} size={44} />
            <div className="flex min-w-0 flex-col gap-1.5">
              <h1 className="font-display font-normal text-display-sm leading-[1.05] tracking-[-0.01em] sm:text-display">{collection.name}</h1>
              {collection.description && <p className="max-w-[720px] text-sm leading-6 text-muted">{collection.description}</p>}
              <p className="text-xs text-muted">
                {links.length} {links.length === 1 ? "link" : "links"}
                {sections.length > 0 && ` · ${sections.length} ${sections.length === 1 ? "subcoleção" : "subcoleções"}`} · somente leitura
              </p>
            </div>
          </div>
          {children.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {children.map((c) => (
                <a key={c.id} href={href(c.id)} className="inline-flex h-8 items-center gap-2 rounded-control border border-line bg-surface px-3 text-body hover:bg-surface-2">
                  <CollectionGlyph icon={c.icon} color={c.color} />
                  {c.name}
                  <span className="text-xs text-muted">{c.totalCount}</span>
                </a>
              ))}
            </div>
          )}
        </header>

        {links.length === 0 && (
          <p className="rounded-2xl border border-dashed border-line-2 px-6 py-14 text-center text-sm text-muted">Esta coleção ainda não tem links.</p>
        )}
        {direct.length > 0 && <PublicGrid links={direct} />}
        {sections.map(({ node, trail }) => {
          const items = byCollection.get(node.id) ?? [];
          if (!items.length) return null;
          return (
            <section key={node.id} aria-labelledby={`pc-${node.id}`} className="flex flex-col gap-3">
              <h2 id={`pc-${node.id}`} className="flex items-center gap-2 text-lead font-semibold">
                <CollectionGlyph icon={node.icon} color={node.color} />
                <a href={href(node.id)} className="hover:text-accent-ink">
                  {trail.length > 0 && <span className="font-normal text-muted">{trail.join(" / ")} / </span>}
                  {node.name}
                </a>
                <span className="text-xs font-normal text-muted">{items.length}</span>
              </h2>
              <PublicGrid links={items} />
            </section>
          );
        })}
        <footer className="pt-6 text-center text-xs text-muted">
          Compartilhado com <span className="font-medium text-ink-2">Waypoint</span>
        </footer>
      </div>
    </div>
  );
}

function PublicGrid({ links }: { links: PublicLink[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-4">
      {links.map((l) => (
        <article
          key={l.id}
          className="group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-raise"
        >
          <div className="relative h-[112px] overflow-hidden">
            <Cover link={l} />
            <span className="absolute right-2.5 top-2.5 inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-surface/95 text-ink opacity-0 shadow-thumb transition-opacity group-hover:opacity-100">
              <ExternalLink className="size-[15px]" aria-hidden />
            </span>
          </div>
          <div className="flex flex-col gap-2 px-4 pb-4 pt-3.5">
            <div className="flex min-w-0 items-center gap-2">
              <SiteIcon src={l.icon || l.favicon} label={l.domain || l.title} size={18} />
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate text-lead font-semibold outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-accent"
              >
                {l.title}
              </a>
            </div>
            <span className="truncate font-mono text-xs text-muted">{l.domain}</span>
            {l.description && l.summaryBehavior !== "hidden" && (
              <p
                className={cn(
                  "line-clamp-2 text-body leading-[19px] text-ink-2",
                  l.summaryBehavior === "hover" && "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
                )}
              >
                {l.description}
              </p>
            )}
            {l.tags.length > 0 && (
              <div className="mt-0.5 flex flex-wrap gap-1.5">
                {l.tags.slice(0, 4).map((t) => (
                  <span key={t} className="rounded-full bg-subtle px-2 py-0.5 text-xs text-ink-2">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
