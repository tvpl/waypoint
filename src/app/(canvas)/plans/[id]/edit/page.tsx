import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { atLeast } from "@/server/services/permissions";
import { getDraft, getPlanWithAccess, getPublished, hasUnpublishedChanges, listPlanMembers } from "@/server/services/plans";
import { tagsForPlans } from "@/server/services/tags";
import { planContextInfo, resolveDocumentResources } from "@/server/services/resources";
import { PlanEditor } from "@/features/planner/editor";
import { byRefFromByNode } from "@/features/planner/resource-types";

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/plans/${id}/edit`)}`);
  const res = getPlanWithAccess(id, user.id);
  if (!res) notFound();
  // viewers never reach the editor — not even its HTML
  if (!atLeast(res.access, "editor")) redirect(`/plans/${id}`);
  return { user, ...res };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  const res = user ? getPlanWithAccess(id, user.id) : null;
  return { title: res && atLeast(res.access, "editor") ? `${res.plan.title} — editar` : "Plan" };
}

export default async function EditPlanPage({ params }: Props) {
  const { id } = await params;
  const { user, plan } = await load(id);
  const draft = getDraft(id);
  const published = getPublished(plan);
  const info = planContextInfo(plan);
  const byNode = resolveDocumentResources(draft.document, user.id, plan.workspaceId);
  const members = listPlanMembers(id);
  const people = [
    { name: user.name, email: user.email },
    ...(info.owner && info.owner.email !== user.email ? [info.owner] : []),
    ...members.filter((m) => m.email !== user.email && m.email !== info.owner?.email).map((m) => ({ name: m.name, email: m.email })),
  ];

  return (
    <PlanEditor
      plan={{ id: plan.id, title: plan.title, description: plan.description, tags: tagsForPlans([id]).get(id) ?? [], visibility: plan.visibility }}
      workspaceName={info.workspaceName}
      initial={{ document: draft.document, version: draft.version, updatedAt: draft.updatedAt.getTime() }}
      published={published ? { version: published.version } : null}
      unpublished={hasUnpublishedChanges(plan)}
      resources={byRefFromByNode(draft.document.nodes, byNode)}
      people={people}
    />
  );
}
