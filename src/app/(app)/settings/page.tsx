import Link from "next/link";
import { Download, Upload } from "lucide-react";
import { listMembers, requireWorkspace } from "@/server/services/workspaces";
import { Button } from "@/components/ui/button";
import { Card, ProfileForm, ThemePicker, WorkspaceForm } from "@/features/settings/settings-forms";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const ctx = await requireWorkspace();
  const members = listMembers(ctx.workspace.id);
  return (
    <main className="scrollbar-thin flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[960px] flex-col px-6 pb-16 pt-10 sm:px-10">
        <div className="flex flex-col gap-2 pb-8">
          <h1 className="font-display text-[44px] leading-none">Configurações</h1>
          <p className="text-[15px] text-muted">Conta, aparência, workspace e seus dados.</p>
        </div>
        <Card title="Perfil" description="Como você aparece para as pessoas do workspace.">
          <ProfileForm name={ctx.user.name} email={ctx.user.email} />
        </Card>
        <Card title="Aparência" description="Cores dos blocos no Planner não mudam com o tema — o contraste do texto se adapta.">
          <ThemePicker />
        </Card>
        <Card title="Workspace" description="Owners gerenciam o nome e as pessoas. Editors criam e editam; viewers apenas consultam.">
          <WorkspaceForm name={ctx.workspace.name} members={members} isOwner={ctx.role === "owner"} meId={ctx.user.id} />
        </Card>
        <Card title="Seus dados" description="Nada fica preso aqui: exporte sempre que quiser.">
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href="/api/export/links?format=html">
                <Download /> Favoritos (HTML)
              </a>
            </Button>
            <Button asChild>
              <a href="/api/export/links?format=csv">
                <Download /> Links (CSV)
              </a>
            </Button>
            <Button asChild>
              <a href="/api/export/links?format=json">
                <Download /> Links (JSON)
              </a>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/links/import">
                <Upload /> Importar favoritos
              </Link>
            </Button>
          </div>
          <p className="text-[13px] text-muted">Plans podem ser exportados em JSON, PNG, SVG ou PDF pelo menu de cada plan.</p>
        </Card>
      </div>
    </main>
  );
}
