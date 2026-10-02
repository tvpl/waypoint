"use client";
/**
 * Read-only plan page for public / share-link visitors.
 *
 * The server resolves resources (src/server/services/resources.ts →
 * resolveDocumentResources) and passes the map; nothing here can edit.
 *
 *   const resources = resolveDocumentResources(doc, userId ?? null, plan.workspaceId);
 *   <PublicPlanView plan={{ id, title, description, tags }} document={doc} resources={resources} />
 */
import type { PlanDocument } from "@/domain/plan";
import { TooltipProvider } from "@/components/ui/popover";
import { PlanViewPage, type ViewStatus } from "./view-page";
import type { ResolvedResource } from "./resource-types";

export function PublicPlanView({
  plan,
  document,
  resources,
  status,
  workspaceName,
}: {
  plan: { id: string; title: string; description?: string | null; tags?: string[] };
  document: PlanDocument;
  resources: Record<string, ResolvedResource>;
  /** Optional "Publicado · vN · data" label. */
  status?: ViewStatus;
  workspaceName?: string | null;
}) {
  return (
    <TooltipProvider>
      <PlanViewPage
        plan={{ id: plan.id, title: plan.title, description: plan.description ?? null, tags: plan.tags ?? [] }}
        document={document}
        resources={resources}
        status={status ?? { kind: "none" }}
        workspaceName={workspaceName}
        canEdit={false}
      />
    </TooltipProvider>
  );
}
