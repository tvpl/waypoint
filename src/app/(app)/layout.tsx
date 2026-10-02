import { requireWorkspace } from "@/server/services/workspaces";
import { AppRail, MobileTabBar } from "@/components/shell/app-rail";
import { CommandPalette } from "@/components/shell/command-palette";
import { TooltipProvider } from "@/components/ui/popover";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireWorkspace();
  return (
    <TooltipProvider>
      <div className="flex h-dvh overflow-hidden bg-bg">
        <AppRail user={{ name: ctx.user.name, email: ctx.user.email }} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0">{children}</div>
      </div>
      <MobileTabBar user={{ name: ctx.user.name, email: ctx.user.email }} />
      <CommandPalette workspaces={ctx.workspaces.map((w) => ({ id: w.id, name: w.name }))} currentWorkspaceId={ctx.workspace.id} />
    </TooltipProvider>
  );
}
