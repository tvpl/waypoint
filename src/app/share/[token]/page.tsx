import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { resolveShareToken } from "@/server/services/plans";
import { getCollection } from "@/server/services/links";
import { collectionAccess } from "@/server/services/permissions";
import { getCurrentUser } from "@/server/auth";
import { loadPublicCollection } from "@/features/links/public-data";
import { PublicCollectionView } from "@/features/links/public-collection-view";
import { Logo } from "@/components/shell/logo";

export const metadata = { robots: { index: false } };

/** Public entry point for anything shared "by link". */
export default async function SharePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ c?: string }> }) {
  const { token } = await params;
  const { c } = await searchParams;
  const share = resolveShareToken(token);
  if (!share) notFound();

  if (share.resourceType === "plan") redirect(`/plans/${share.resourceId}?token=${encodeURIComponent(token)}`);

  const col = getCollection(share.resourceId);
  const user = await getCurrentUser();
  if (!col || !collectionAccess(user?.id ?? null, col, token)) notFound();
  const data = loadPublicCollection(share.resourceId, c);
  if (!data) notFound();

  return (
    <div className="min-h-dvh bg-bg">
      <header className="flex h-14 items-center gap-3 px-5">
        <Link href={user ? "/" : "/login"} aria-label="Waypoint">
          <Logo />
        </Link>
        <span className="text-sm text-muted">Coleção compartilhada</span>
        <span className="flex-1" />
        {!user && (
          <Link href="/signup" className="text-body font-medium text-accent-ink hover:underline">
            Criar sua biblioteca
          </Link>
        )}
      </header>
      <PublicCollectionView {...data} basePath={`/share/${token}`} />
    </div>
  );
}
