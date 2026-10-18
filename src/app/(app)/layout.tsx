import { requireWorkspace } from "@/server/services/workspaces";
import { AppRail, MobileTabBar } from "@/components/shell/app-rail";
import { CommandPalette } from "@/components/shell/command-palette";
import { Shortcuts } from "@/components/shell/shortcuts";
import { TooltipProvider } from "@/components/ui/popover";
import { pinnedCollections } from "@/server/services/links";
import { pinnedPlans } from "@/server/services/home";
import type { RailPin } from "@/components/shell/app-rail";
import { after } from "next/server";
import { TourHost } from "@/features/help/tour";
import { TimeZoneCookie } from "@/components/shell/time-zone-cookie";
import { TourInvite } from "@/features/help/tour-invite";
import { maybeAutoBackup } from "@/server/services/backups";
import { purgeTrash } from "@/server/services/trash";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireWorkspace();
  // The scheduled restore point is taken after the response, at most once per period.
  after(() => maybeAutoBackup(ctx.workspace.id));
  // Items trashed more than 30 days ago are deleted for good.
  after(() => purgeTrash(ctx.workspace.id));
  const pins: RailPin[] = [
    ...pinnedCollections(ctx.user.id, ctx.workspace.id).map((c) => ({ kind: "collection" as const, id: c.id, name: c.name, icon: c.icon, color: c.color })),
    ...pinnedPlans(ctx.user.id, ctx.workspace.id).map((p) => ({ kind: "plan" as const, id: p.id, name: p.title })),
  ];
  return (
    <TooltipProvider>
      <div className="flex h-app overflow-hidden bg-bg">
        <AppRail user={{ name: ctx.user.name, email: ctx.user.email }} workspace={ctx.workspace} workspaces={ctx.workspaces} pins={pins} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0">{children}</div>
      </div>
      <MobileTabBar user={{ name: ctx.user.name, email: ctx.user.email }} />
      <Shortcuts />
      <TourHost />
      <TimeZoneCookie />
      <TourInvite />
      <CommandPalette workspaces={ctx.workspaces.map((w) => ({ id: w.id, name: w.name }))} currentWorkspaceId={ctx.workspace.id} />
    </TooltipProvider>
  );
}
