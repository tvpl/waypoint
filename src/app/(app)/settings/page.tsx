import Link from "next/link";
import { Download, FileBarChart2, FolderInput, KeyRound, ListTodo, Monitor, Palette, ShieldCheck, Upload, User, Users, Workflow, Link2 } from "lucide-react";
import { canEditWorkspace, listMembers, requireWorkspace } from "@/server/services/workspaces";
import { Button } from "@/components/ui/button";
import { Card, MotionPicker, ProfileForm, ThemePicker, WorkspaceForm } from "@/features/settings/settings-forms";
import { ApiTokens } from "@/features/settings/api-tokens";
import { DesktopSettings } from "@/features/settings/desktop-settings";
import { DesktopSecurity } from "@/features/settings/desktop-security";
import { DesktopBackups } from "@/features/settings/desktop-backups";
import { WorkspaceBackups } from "@/features/settings/workspace-backups";
import { TrashSummary } from "@/features/trash/trash-summary";
import { SettingsTabs, type SettingsTab } from "@/features/settings/settings-tabs";
import { isDesktop } from "@/server/desktop";
import { desktopSecurity } from "@/server/desktop-security";
import { listApiTokens } from "@/server/services/api-tokens";
import { backupFolder, backupSettings, listBackups } from "@/server/services/backups";

export const metadata = { title: "Configurações" };

const ARCHIVED = [
  { href: "/tasks?scope=archived", icon: <ListTodo />, label: "Tarefas arquivadas" },
  { href: "/plans?f=archived", icon: <Workflow />, label: "Plans arquivados" },
  { href: "/links?scope=archived", icon: <Link2 />, label: "Links arquivados" },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const members = listMembers(ctx.workspace.id);
  const actor = { workspaceId: ctx.workspace.id, userId: ctx.user.id };
  const editor = canEditWorkspace(ctx.role);
  const desktop = isDesktop();

  const tabs: SettingsTab[] = [
    {
      id: "conta",
      label: "Conta",
      icon: <User />,
      title: "Conta",
      description: "Seu nome e sua senha. É assim que você aparece para as pessoas do workspace.",
      keywords: ["perfil", "nome", "e-mail", "senha", "login", "usuário"],
      content: (
        <Card id="perfil" title="Perfil" description="Nome, e-mail e senha de acesso.">
          <ProfileForm name={ctx.user.name} email={ctx.user.email} />
        </Card>
      ),
    },
    {
      id: "aparencia",
      label: "Aparência",
      icon: <Palette />,
      title: "Aparência",
      description: "Tema e animações. Vale só para este dispositivo.",
      keywords: ["tema", "claro", "escuro", "sistema", "cores", "animações", "movimento", "acessibilidade"],
      content: (
        <Card id="aparencia" title="Tema e movimento" description="Cores dos blocos no Planner não mudam com o tema — o contraste do texto se adapta.">
          <ThemePicker />
          <MotionPicker />
        </Card>
      ),
    },
    {
      id: "workspace",
      label: "Workspace",
      icon: <Users />,
      title: `Workspace · ${ctx.workspace.name}`,
      description: "Owners gerenciam o nome e as pessoas. Editors criam e editam; viewers apenas consultam.",
      keywords: ["pessoas", "membros", "convidar", "equipe", "papéis", "permissões", "owner", "editor", "viewer"],
      content: (
        <Card id="workspace" title="Nome e pessoas" description="Convide por e-mail quem já tem conta e escolha o papel de cada pessoa.">
          <WorkspaceForm name={ctx.workspace.name} members={members} isOwner={ctx.role === "owner"} meId={ctx.user.id} />
        </Card>
      ),
    },
    {
      id: "integracoes",
      label: "Integrações",
      icon: <KeyRound />,
      title: "Integrações",
      description: "Conecte a extensão do navegador e outras ferramentas ao Waypoint.",
      keywords: ["tokens", "api", "extensão", "navegador", "chave", "integração", "automação"],
      content: (
        <Card
          id="api-tokens"
          title="Tokens de API"
          description="Tokens pessoais para a extensão do navegador e integrações. Cada token vale para um workspace e pode ser revogado a qualquer momento."
        >
          <ApiTokens initial={listApiTokens(ctx.user.id)} workspaceName={ctx.workspace.name} role={ctx.role} />
        </Card>
      ),
    },
    {
      id: "backup",
      label: "Backup e dados",
      icon: <ShieldCheck />,
      title: "Backup e dados",
      description: "Pontos de restauração para não perder nada, recuperação de itens excluídos e exportações dos seus dados.",
      keywords: ["backup", "restaurar", "recuperar", "exportar", "importar", "arquivados", "lixeira", "excluídos", "dados"],
      content: (
        <>
          <Card
            id="pontos-de-restauracao"
            title="Pontos de restauração"
            description="Cópias de tudo deste workspace — plans, links, coleções, projetos, tarefas com histórico e configurações pessoais. Recupere um item excluído, volte o workspace inteiro ou baixe um arquivo para guardar fora daqui."
          >
            {editor ? (
              <WorkspaceBackups initial={listBackups(actor)} settings={backupSettings(ctx.workspace.id)} isOwner={ctx.role === "owner"} workspaceName={ctx.workspace.name} folder={ctx.role === "owner" ? backupFolder() : null} />
            ) : (
              <p className="text-body text-muted">Owners e editors do workspace gerenciam os backups. Peça a um deles para recuperar algo.</p>
            )}
          </Card>
          <Card id="lixeira" title="Lixeira" description="Plans, coleções e links excluídos ficam na lixeira por 30 dias. Restaure com um clique ou exclua de vez.">
            <TrashSummary actor={actor} />
          </Card>
          {desktop && <DesktopBackups />}
          <Card id="dados" title="Exportar" description="Nada fica preso aqui: leve seus dados quando quiser.">
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
              <Button asChild>
                <Link href="/tasks?report=1">
                  <FileBarChart2 /> Relatório de concluídas (Markdown)
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/links/import">
                  <Upload /> Importar favoritos
                </Link>
              </Button>
            </div>
            <p className="text-body text-muted">Plans podem ser exportados em JSON, PNG, SVG, PDF ou Excalidraw pelo menu de cada plan. Tarefas exportam em Markdown pelo menu da página de Tarefas.</p>
          </Card>
          <Card id="arquivados" title="Arquivados" description="Arquivar tira um item do caminho sem apagar. Restaure quando quiser.">
            <div className="flex flex-wrap gap-2">
              {ARCHIVED.map((a) => (
                <Button key={a.href} asChild variant="ghost">
                  <Link href={a.href}>
                    {a.icon} {a.label}
                  </Link>
                </Button>
              ))}
            </div>
          </Card>
        </>
      ),
    },
  ];
  if (desktop)
    tabs.push({
      id: "aplicativo",
      label: "Aplicativo",
      icon: <Monitor />,
      title: "Aplicativo",
      description: "Bloqueio com senha, captura rápida e o endereço local para a extensão do navegador.",
      keywords: ["desktop", "aplicativo", "bloqueio", "senha", "segurança", "captura rápida", "atalho", "endereço local"],
      content: (
        <>
          <DesktopSecurity initial={desktopSecurity()} mac={process.platform === "darwin"} />
          <DesktopSettings />
        </>
      ),
    });

  const tab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  return (
    <main className="scrollbar-thin flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col px-6 pb-16 pt-10 sm:px-10">
        <div className="flex flex-col gap-2 pb-8">
          <h1 className="font-display font-semibold text-display-sm leading-[1.05] tracking-[-0.025em] sm:text-display">Configurações</h1>
          <p className="text-lead text-muted">Conta, aparência, workspace, integrações e seus dados — cada coisa no seu lugar.</p>
        </div>
        <SettingsTabs tabs={tabs} initial={tab ?? "conta"} />
      </div>
    </main>
  );
}
