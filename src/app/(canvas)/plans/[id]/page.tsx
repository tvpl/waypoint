import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/server/auth";
import { atLeast } from "@/server/services/permissions";
import { getDraft, getPlanWithAccess, getPublished, getVersion, type PlanSnapshot } from "@/server/services/plans";
import { tagsForPlans } from "@/server/services/tags";
import { touchRecent } from "@/server/services/links";
import { planContextInfo, resolveDocumentResources } from "@/server/services/resources";
import { PlanViewPage, type ViewStatus } from "@/features/planner/view-page";
import { Logo } from "@/components/shell/logo";
import { commentAccess } from "@/server/services/comments";

/** Comments are for people who belong to the plan, not share-link visitors. */
function canDiscuss(planId: string, userId: string) {
  try {
    commentAccess(planId, { userId });
    return true;
  } catch {
    return false;
  }
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

async function access(id: string, token: string | null) {
  const user = await getCurrentUser();
  const res = getPlanWithAccess(id, user?.id ?? null, token);
  return { user, res };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const sp = await searchParams;
  const { res } = await access(id, one(sp.token));
  if (!res) return { title: "Plan", robots: { index: false } };
  const pub = getPublished(res.plan);
  const canEdit = atLeast(res.access, "editor");
  if (!pub && !canEdit) return { title: "Plan", robots: { index: false } };
  const title = pub?.snapshot.title ?? res.plan.title;
  return {
    title,
    description: (pub?.snapshot.description ?? res.plan.description) || undefined,
    robots: { index: res.plan.visibility === "public" && !!pub },
  };
}

export default async function PlanViewRoute({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const token = one(sp.token);
  const { user, res } = await access(id, token);

  if (!res || (res.plan.archivedAt && !atLeast(res.access, "editor"))) {
    return <Unavailable signedIn={!!user} next={`/plans/${id}${token ? `?token=${encodeURIComponent(token)}` : ""}`} />;
  }
  const { plan } = res;
  const canEdit = atLeast(res.access, "editor");

  let snapshot: PlanSnapshot | null = null;
  let status: ViewStatus = { kind: "none" };
  const versionId = one(sp.version);
  const requested = versionId && canEdit ? getVersion(versionId) : null;
  if (requested && requested.planId === plan.id) {
    snapshot = requested.snapshot;
    status = { kind: "version", version: requested.version, at: requested.createdAt.getTime(), isPublished: plan.publishedVersionId === requested.id };
  } else {
    const pub = getPublished(plan);
    if (pub) {
      snapshot = pub.snapshot;
      status = { kind: "published", version: pub.version, at: pub.createdAt.getTime() };
    } else if (canEdit) {
      snapshot = { title: plan.title, description: plan.description, document: getDraft(plan.id).document };
      status = { kind: "draft" };
    }
  }

  if (!snapshot) return <NotPublished signedIn={!!user} />;

  if (user) touchRecent(user.id, "plan", plan.id);
  const resources = resolveDocumentResources(snapshot.document, user?.id ?? null, plan.workspaceId);
  const info = planContextInfo(plan);

  return (
    <PlanViewPage
      plan={{ id: plan.id, title: snapshot.title, description: snapshot.description, tags: tagsForPlans([plan.id]).get(plan.id) ?? [] }}
      document={snapshot.document}
      resources={resources}
      status={status}
      workspaceName={user ? info.workspaceName : null}
      canEdit={canEdit}
      focusNodeId={one(sp.node)}
      homeHref={user ? "/" : "/login"}
      viewer={user && canDiscuss(id, user.id) ? { id: user.id, name: user.name } : null}
      shareToken={token}
      present={one(sp.present) === "1"}
    />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-app flex-col items-center justify-center gap-6 bg-bg px-6 text-center">
      <Logo size={40} />
      {children}
    </main>
  );
}

function Unavailable({ signedIn, next }: { signedIn: boolean; next: string }) {
  return (
    <Shell>
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="font-display font-semibold text-display-lg leading-none tracking-[-0.025em]">Plan indisponível</h1>
        <p className="text-lead text-muted">
          {signedIn ? "Este plan não existe ou você não tem acesso a ele. Peça ao dono para compartilhar com você." : "Este plan é privado ou o link expirou. Entre para ver se você tem acesso."}
        </p>
      </div>
      <Link
        href={signedIn ? "/plans" : `/login?next=${encodeURIComponent(next)}`}
        className="inline-flex h-9 items-center rounded-control bg-accent px-4 text-sm font-medium text-white"
      >
        {signedIn ? "Ver meus plans" : "Entrar"}
      </Link>
    </Shell>
  );
}

function NotPublished({ signedIn }: { signedIn: boolean }) {
  return (
    <Shell>
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="font-display font-semibold text-display-lg leading-none tracking-[-0.025em]">Ainda não publicado</h1>
        <p className="text-lead text-muted">Este plan ainda está em rascunho. Ele aparece aqui assim que o dono publicar a primeira versão.</p>
      </div>
      <Link href={signedIn ? "/plans" : "/"} className="inline-flex h-9 items-center rounded-control border border-line-2 bg-surface px-4 text-sm font-medium">
        {signedIn ? "Ver meus plans" : "Ir para o Waypoint"}
      </Link>
    </Shell>
  );
}
