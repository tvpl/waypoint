"use client";
import * as React from "react";
import { Archive, FolderInput, FolderOpen, History, MoreHorizontal, RotateCcw, Search, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Segmented } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { ask } from "@/components/ui/ask";
import { formatBytes, useBackupState, useDesktop, type BackupState } from "@/lib/desktop";
import { timeAgo } from "@/lib/utils";
import { Card } from "./settings-forms";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });
const FREQUENCY: { value: BackupState["frequency"]; label: string }[] = [
  { value: "daily", label: "Diário" },
  { value: "weekly", label: "Semanal" },
  { value: "off", label: "Desligado" },
];
const errorText = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : "Algo deu errado.");

/** Desktop app only: full backups (database, images, lock settings), schedule, folder and restore. */
export function DesktopBackups() {
  const desktop = useDesktop();
  const [state, act] = useBackupState();
  const [busy, setBusy] = React.useState<string | null>(null);

  if (!desktop || !state) return null;

  const run = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    try {
      await fn();
      if (success) toast.success(success);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const restore = async (id: string, createdAt: number) => {
    const ok = await ask.confirm({
      title: "Restaurar este backup?",
      description: `Os dados voltam a ser como estavam em ${dateFmt.format(createdAt)}. Antes, o Waypoint salva um backup do estado atual, para você poder desfazer.`,
      confirmLabel: "Restaurar",
      danger: true,
    });
    if (ok) await run(`restore-${id}`, () => act("restore", id));
  };

  return (
    <Card
      id="backups"
      title="Backups"
      description="Cópias completas dos seus dados: plans, links, imagens e configurações de bloqueio. Escolha uma pasta sincronizada (iCloud Drive, Google Drive, Dropbox) para ter uma cópia fora deste computador."
    >
      <div className="flex flex-wrap items-center gap-3 rounded-control border border-line bg-surface-2 px-4 py-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-success-bg text-success-ink">
          <History className="size-[18px]" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body font-semibold">{state.lastAt ? `Último backup ${timeAgo(state.lastAt)}` : "Nenhum backup ainda"}</span>
          <span className="truncate text-caption text-muted" title={state.dir}>
            {state.dir}
          </span>
        </span>
        <Button variant="primary" disabled={!!busy} onClick={() => run("create", () => act("create"), "Backup salvo.")}>
          <Archive /> {busy === "create" ? "Salvando…" : "Fazer backup agora"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2.5">
          <span className="text-body text-ink-2">Automático</span>
          <Segmented label="Frequência do backup automático" value={state.frequency} options={FREQUENCY} onChange={(v) => run("freq", () => act("frequency", v))} />
        </div>
        <label className="flex items-center gap-2.5 text-body text-ink-2">
          Manter os últimos
          <select
            className="wp-select h-8 rounded-lg border border-line-2 bg-surface pl-2.5 pr-8 text-body"
            value={state.keep}
            onChange={(e) => run("keep", () => act("keep", Number(e.target.value)))}
          >
            {[5, 10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => run("dir", () => act("choose-dir"))}>
          <FolderInput /> Escolher pasta…
        </Button>
        <Button size="sm" variant="ghost" onClick={() => run("open", () => act("open-dir"))}>
          <FolderOpen /> Abrir pasta
        </Button>
        {state.customDir && (
          <Button size="sm" variant="ghost" onClick={() => run("reset", () => act("reset-dir"), "Voltando a usar a pasta de dados.")}>
            <Undo2 /> Usar a pasta padrão
          </Button>
        )}
      </div>

      {state.items.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-control border border-line">
          {state.items.map((b) => (
            <li key={b.id} className="flex items-center gap-3 bg-surface px-4 py-2.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-medium">{dateFmt.format(b.createdAt)}</span>
                <span className="text-caption text-muted">
                  {formatBytes(b.size)} · {timeAgo(b.createdAt)}
                </span>
              </span>
              {b.note ? <Badge tone="amber">{b.note}</Badge> : <Badge tone={b.auto ? "neutral" : "accent"}>{b.auto ? "Automático" : "Manual"}</Badge>}
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => restore(b.id, b.createdAt)}>
                <RotateCcw /> {busy === `restore-${b.id}` ? "Restaurando…" : "Restaurar"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" aria-label="Mais ações">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => run("reveal", () => act("reveal", b.id))}>
                    <Search /> Mostrar na pasta
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    danger
                    onSelect={async () => {
                      if (await ask.confirm({ title: "Excluir este backup?", description: dateFmt.format(b.createdAt), confirmLabel: "Excluir", danger: true }))
                        await run(`rm-${b.id}`, () => act("remove", b.id), "Backup excluído.");
                    }}
                  >
                    <Trash2 /> Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-muted">Os backups aparecem aqui. O primeiro automático é feito alguns segundos depois de abrir o aplicativo.</p>
      )}
    </Card>
  );
}
