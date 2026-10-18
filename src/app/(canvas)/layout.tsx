import { getWorkspaceContext } from "@/server/services/workspaces";
import { CommandPalette } from "@/components/shell/command-palette";
import { Shortcuts } from "@/components/shell/shortcuts";
import { TooltipProvider } from "@/components/ui/popover";
import { TourHost } from "@/features/help/tour";

/** Full-screen planner surfaces (editor / view mode) without the app rail. */
export default async function CanvasLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getWorkspaceContext();
  return (
    <TooltipProvider>
      {children}
      <Shortcuts />
      {ctx && <TourHost />}
      {ctx && <CommandPalette workspaces={ctx.workspaces.map((w) => ({ id: w.id, name: w.name }))} currentWorkspaceId={ctx.workspace.id} />}
    </TooltipProvider>
  );
}
