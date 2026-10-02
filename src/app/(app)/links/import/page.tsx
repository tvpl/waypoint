import type { Metadata } from "next";
import { canEditWorkspace, requireWorkspace } from "@/server/services/workspaces";
import { visibleTree } from "@/features/links/server-data";
import { ImportScreen } from "@/features/links/import-screen";

export const metadata: Metadata = { title: "Importar e exportar links" };

export default async function ImportPage() {
  const ctx = await requireWorkspace();
  const { tree } = visibleTree(ctx.workspace.id, ctx.user.id);
  return <ImportScreen tree={tree} canEdit={canEditWorkspace(ctx.role)} workspaceName={ctx.workspace.name} />;
}
