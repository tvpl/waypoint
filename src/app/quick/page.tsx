import { notFound } from "next/navigation";
import { canEditWorkspace, requireWorkspace } from "@/server/services/workspaces";
import { isDesktop } from "@/server/desktop";
import { QuickCapture } from "@/features/quick/quick-capture";

export const metadata = { title: "Captura rápida" };

/** Desktop app only: the floating capture window (global shortcut, tray). */
export default async function QuickPage() {
  const ctx = await requireWorkspace();
  if (!isDesktop()) notFound();
  return <QuickCapture workspaceName={ctx.workspace.name} canEdit={canEditWorkspace(ctx.role)} />;
}
