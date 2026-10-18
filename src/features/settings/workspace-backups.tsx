"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  CheckCircle2,
  Download,
  FolderPlus,
  HardDrive,
  Lock,
  History,
  LifeBuoy,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge, EmptyState, Segmented } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { ask } from "@/components/ui/ask";
import { formatBytes } from "@/lib/desktop";
import { cn, timeAgo } from "@/lib/utils";
import {
  BACKUP_KIND_LABELS,
  describeCounts,
  RECOVERABLE_LABELS,
  RECOVERABLE_TYPES,
  type BackupSummary,
  type RecoverableItem,
  type RecoverableType,
} from "@/domain/backup";
import {
  createBackupAction,
  deleteBackupAction,
  listRecoverableAction,
  recoverItemsAction,
  restoreAsNewWorkspaceAction,
  restoreWorkspaceAction,
  saveBackupSettingsAction,
} from "@/app/(app)/settings/backup-actions";

type Frequency = "daily" | "weekly" | "off";
const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });
const KIND_TONE = { auto: "neutral", manual: "accent", safety: "amber", upload: "success" } as const;

/** Restore points kept by the server: automatic, manual, uploaded; restore all or pick items back. */
export function WorkspaceBackups({
  initial,
  settings: initialSettings,
  isOwner,
  workspaceName,
  folder = null,
}: {
  initial: BackupSummary[];
  settings: { frequency: Frequency; keep: number };
  isOwner: boolean;
  workspaceName: string;
  /** WAYPOINT_BACKUP_DIR, when the server copies every restore point there. */
  folder?: string | null;
}) {
  const router = useRouter();
  const [backups, setBackups] = React.useState(initial);
  const [settings, setSettings] = React.useState(initialSettings);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [recover, setRecover] = React.useState<BackupSummary | null>(null);
  const [password, setPassword] = React.useState<{ mode: "download"; backup: BackupSummary } | { mode: "upload"; file: File } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => setBackups(initial), [initial]);

  const run = async <T,>(key: string, fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, success?: string) => {
    setBusy(key);
    try {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error);
        return null;
      }
      if (success) toast.success(success);
      return r.data;
    } catch {
      toast.error("Não foi possível conectar. Tente novamente.");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    const note = await ask.prompt({ title: "Criar backup agora", description: "Uma nota ajuda a reconhecer este ponto depois.", label: "Nota", initial: "Backup manual", placeholder: "Ex.: antes de reorganizar os projetos", confirmLabel: "Criar backup" });
    if (note === null) return;
    const list = await run("create", () => createBackupAction(note), "Backup criado.");
    if (list) setBackups(list);
  };

  const upload = async (file: File, secret?: string) => {
    setBusy("upload");
    try {
      const res = await fetch("/api/backups/upload", {
        method: "POST",
        body: file,
        headers: secret ? { "x-backup-password": encodeURIComponent(secret) } : undefined,
      });
      const body = await res.json().catch(() => ({}));
      if (body.needsPassword) return setPassword({ mode: "upload", file });
      if (!res.ok) return void toast.error(body.error ?? "Não foi possível enviar o backup.");
      setBackups((list) => [body.backup as BackupSummary, ...list]);
      toast.success(body.backup.foreign ? "Backup enviado. Ele é de outro workspace: crie um workspace a partir dele." : "Backup enviado. Agora você pode recuperar itens ou restaurar.");
    } catch {
      toast.error("Não foi possível enviar o backup.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const downloadProtected = async (b: BackupSummary, secret: string) => {
    setBusy(`dl-${b.id}`);
    try {
      const res = await fetch(`/api/backups/${b.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: secret }) });
      if (!res.ok) return void toast.error((await res.json().catch(() => ({}))).error ?? "Não foi possível gerar o arquivo.");
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "waypoint-backup.protegido.json";
      const url = URL.createObjectURL(await res.blob());
      Object.assign(document.createElement("a"), { href: url, download: name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Backup protegido baixado. Guarde a senha: sem ela o arquivo não abre.");
    } finally {
      setBusy(null);
    }
  };

  const changeSettings = async (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    const list = await run("settings", () => saveBackupSettingsAction(next), "Preferência de backup salva.");
    if (list) setBackups(list);
    else setSettings(settings);
  };

  const restoreAll = async (b: BackupSummary) => {
    const ok = await ask.confirm({
      title: "Restaurar o workspace inteiro?",
      description: `Plans, links, coleções, tarefas e projetos de “${workspaceName}” voltam a ser como estavam em ${dateFmt.format(b.takenAt)}. O que foi criado depois sai. Antes, o Waypoint guarda um backup “Antes de restaurar” para você poder desfazer. Itens privados de outras pessoas não são alterados.`,
      confirmLabel: "Restaurar tudo",
      danger: true,
    });
    if (!ok) return;
    const list = await run(`restore-${b.id}`, () => restoreWorkspaceAction(b.id), "Workspace restaurado.");
    if (list) {
      setBackups(list);
      router.refresh();
    }
  };

  const asNewWorkspace = async (b: BackupSummary) => {
    const ok = await ask.confirm({
      title: "Criar workspace a partir do backup?",
      description: `Um workspace novo, “${b.sourceWorkspaceName} (restaurado)”, recebe uma cópia de tudo o que está neste backup. Você será o owner; nada do workspace atual muda.`,
      confirmLabel: "Criar workspace",
    });
    if (!ok) return;
    const result = await run(`new-${b.id}`, () => restoreAsNewWorkspaceAction(b.id));
    if (result) {
      toast.success(`Workspace “${result.name}” criado. Você já está nele.`);
      router.push("/");
      router.refresh();
    }
  };

  const remove = async (b: BackupSummary) => {
    if (!(await ask.confirm({ title: "Excluir este backup?", description: dateFmt.format(b.takenAt), confirmLabel: "Excluir", danger: true }))) return;
    const list = await run(`rm-${b.id}`, () => deleteBackupAction(b.id), "Backup excluído.");
    if (list) setBackups(list);
  };

  const last = backups.find((b) => b.kind !== "upload");
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5 shadow-rest">
        <span className={cn("flex size-10 items-center justify-center rounded-xl", last ? "bg-success-bg text-success-ink" : "bg-amber-bg text-amber-ink")}>
          {last ? <ShieldCheck className="size-5" /> : <History className="size-5" />}
        </span>
        <span className="flex min-w-[200px] flex-1 flex-col">
          <span className="text-body font-semibold" suppressHydrationWarning>
            {last ? `Último backup ${timeAgo(last.createdAt)}` : "Nenhum backup ainda"}
          </span>
          <span className="text-caption text-muted">
            {settings.frequency === "off" ? "Backup automático desligado" : `Automático ${settings.frequency === "daily" ? "todo dia" : "toda semana"} · mantém os últimos ${settings.keep}`}
          </span>
        </span>
        <div className="flex flex-wrap gap-2">
          {isOwner && (
            <>
              <input ref={fileRef} type="file" accept=".json,.gz,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <Button data-tour="settings-backup-upload" disabled={!!busy} onClick={() => fileRef.current?.click()}>
                {busy === "upload" ? <Loader2 className="animate-spin" /> : <Upload />} Enviar backup
              </Button>
            </>
          )}
          <Button variant="primary" data-tour="settings-backup-now" disabled={!!busy} onClick={create}>
            {busy === "create" ? <Loader2 className="animate-spin" /> : <Archive />} Criar backup agora
          </Button>
        </div>
      </div>

      {isOwner && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2.5">
            <span className="text-body text-ink-2">Automático</span>
            <Segmented<Frequency>
              label="Frequência do backup automático"
              value={settings.frequency}
              onChange={(frequency) => changeSettings({ frequency })}
              options={[
                { value: "daily", label: "Diário" },
                { value: "weekly", label: "Semanal" },
                { value: "off", label: "Desligado" },
              ]}
            />
          </div>
          <label className="flex items-center gap-2.5 text-body text-ink-2">
            Manter os últimos
            <select className="wp-select h-8 rounded-lg border border-line-2 bg-surface pl-2.5 pr-8 text-body" value={settings.keep} onChange={(e) => changeSettings({ keep: Number(e.target.value) })}>
              {[7, 14, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {n} automáticos
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {backups.length ? (
        <ul data-tour="settings-backup-list" className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {backups.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 animate-in">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-body font-medium">{dateFmt.format(b.takenAt)}</span>
                  <Badge tone={KIND_TONE[b.kind]}>{BACKUP_KIND_LABELS[b.kind]}</Badge>
                  {b.foreign && <Badge tone="amber">De “{b.sourceWorkspaceName}”</Badge>}
                </span>
                {b.note && <span className="truncate text-caption text-ink-2">{b.note}</span>}
                <span className="truncate text-caption text-muted">
                  {describeCounts(b.counts) || "Workspace vazio"} · {formatBytes(b.size)}
                  {b.createdByName ? ` · por ${b.createdByName}` : ""}
                </span>
              </span>
              {!b.foreign ? (
                <Button size="sm" variant="soft" disabled={!!busy} onClick={() => setRecover(b)}>
                  <LifeBuoy /> Recuperar itens
                </Button>
              ) : (
                isOwner && (
                  <Button size="sm" variant="soft" disabled={!!busy} onClick={() => asNewWorkspace(b)}>
                    {busy === `new-${b.id}` ? <Loader2 className="animate-spin" /> : <FolderPlus />} Criar workspace
                  </Button>
                )
              )}
              {isOwner && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" aria-label="Mais ações do backup" disabled={!!busy}>
                      {busy?.endsWith(b.id) ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <a href={`/api/backups/${b.id}`} download>
                        <Download /> Baixar (.json)
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setPassword({ mode: "download", backup: b })}>
                      <Lock /> Baixar protegido por senha…
                    </DropdownMenuItem>
                    {!b.foreign && (
                      <DropdownMenuItem onSelect={() => restoreAll(b)}>
                        <RotateCcw /> Restaurar tudo…
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => asNewWorkspace(b)}>
                      <FolderPlus /> Criar workspace a partir dele
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem danger onSelect={() => remove(b)}>
                      <Trash2 /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<History />}
          title="Seus pontos de restauração aparecem aqui"
          description="O primeiro backup automático é feito na próxima visita. Você também pode criar um agora."
          className="py-10"
        />
      )}
      {isOwner && (
        <p className="flex items-start gap-2 rounded-control border border-line bg-surface-2 px-3 py-2.5 text-caption leading-5 text-muted">
          <HardDrive className="mt-0.5 size-3.5 shrink-0" />
          {folder ? (
            <span>
              Cada ponto de restauração também é copiado para <code className="font-mono text-ink-2">{folder}</code>. Use uma pasta sincronizada ou outro disco para ter uma cópia fora deste
              banco.
            </span>
          ) : (
            <span>
              Estes pontos ficam no mesmo banco do Waypoint. Para uma cópia fora dele, baixe o arquivo de vez em quando — ou peça a quem administra o servidor para definir{" "}
              <code className="font-mono text-ink-2">WAYPOINT_BACKUP_DIR</code> (uma pasta sincronizada recebe cada backup automaticamente).
            </span>
          )}
        </p>
      )}
      {password && (
        <PasswordDialog
          mode={password.mode}
          onClose={() => setPassword(null)}
          onSubmit={(secret) => {
            const p = password;
            setPassword(null);
            if (p.mode === "download") void downloadProtected(p.backup, secret);
            else void upload(p.file, secret);
          }}
        />
      )}
      {recover && <RecoverDialog backup={recover} onClose={() => setRecover(null)} onDone={() => router.refresh()} />}
    </div>
  );
}

function PasswordDialog({ mode, onClose, onSubmit }: { mode: "download" | "upload"; onClose: () => void; onSubmit: (password: string) => void }) {
  const [value, setValue] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const download = mode === "download";
  const error = download && value.length > 0 && value.length < 8 ? "Use pelo menos 8 caracteres." : download && confirm && confirm !== value ? "As senhas não conferem." : "";
  const ready = download ? value.length >= 8 && value === confirm : value.length > 0;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={download ? "Baixar protegido por senha" : "Backup protegido"}
        description={download ? "O arquivo é criptografado (AES-256). Sem a senha, ninguém consegue abrir — nem o Waypoint." : "Informe a senha usada ao baixar este backup."}
        className="max-w-[440px]"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) onSubmit(value);
          }}
          className="flex flex-col"
        >
          <DialogBody>
            <label className="flex flex-col gap-1.5 text-body text-ink-2">
              Senha
              <Input type="password" autoFocus autoComplete="new-password" value={value} onChange={(e) => setValue(e.target.value)} maxLength={200} />
            </label>
            {download && (
              <label className="flex flex-col gap-1.5 text-body text-ink-2">
                Confirme a senha
                <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={200} />
              </label>
            )}
            {error && <p className="text-caption text-danger">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" className="ml-auto" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={!ready}>
              <Lock /> {download ? "Baixar" : "Enviar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const STATE_LABEL = { deleted: "Excluído", changed: "Diferente hoje" } as const;

function RecoverDialog({ backup, onClose, onDone }: { backup: BackupSummary; onClose: () => void; onDone: () => void }) {
  const [items, setItems] = React.useState<RecoverableItem[] | null>(null);
  const [type, setType] = React.useState<RecoverableType | "all">("all");
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    listRecoverableAction(backup.id)
      .then((r) => {
        if (r.ok) setItems(r.data.items);
        else {
          toast.error(r.error);
          onClose();
        }
      })
      .catch(() => {
        toast.error("Não foi possível abrir o backup.");
        onClose();
      });
  }, [backup.id, onClose]);

  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const shown = (items ?? []).filter((i) => (type === "all" || i.type === type) && (!query.trim() || fold(`${i.title} ${i.detail}`).includes(fold(query.trim()))));
  const counts = new Map(RECOVERABLE_TYPES.map((t) => [t, (items ?? []).filter((i) => i.type === t).length]));
  const allShown = shown.length > 0 && shown.every((i) => selected.has(i.key));
  const toggle = (key: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const submit = async () => {
    setBusy(true);
    try {
      const r = await recoverItemsAction(backup.id, [...selected]);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.data === 1 ? "1 item recuperado." : `${r.data} itens recuperados.`);
      onDone();
      onClose();
    } catch {
      toast.error("Não foi possível recuperar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent title="Recuperar itens" description={`Do backup de ${dateFmt.format(backup.takenAt)}: o que foi excluído ou está diferente hoje.`} className="max-w-[720px]">
        <DialogBody className="gap-3">
          {!items ? (
            <div className="flex h-48 items-center justify-center text-muted">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={<CheckCircle2 />} title="Nada a recuperar" description="Tudo o que está neste backup existe hoje do mesmo jeito." className="py-10" />
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {(["all", ...RECOVERABLE_TYPES] as const)
                  .filter((t) => t === "all" || counts.get(t))
                  .map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={type === t}
                      onClick={() => setType(t)}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
                        type === t ? "border-accent-line bg-accent-soft font-medium text-accent-ink" : "border-line text-ink-2 hover:bg-hover",
                      )}
                    >
                      {t === "all" ? "Tudo" : RECOVERABLE_LABELS[t]}
                      <span className="tabular-nums opacity-70">{t === "all" ? items.length : counts.get(t)}</span>
                    </button>
                  ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar pelo nome…" aria-label="Buscar itens do backup" className="pl-8" />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setSelected((s) => {
                      const next = new Set(s);
                      for (const i of shown) allShown ? next.delete(i.key) : next.add(i.key);
                      return next;
                    })
                  }
                >
                  {allShown ? "Desmarcar" : "Marcar"} {shown.length}
                </Button>
              </div>
              <ul className="scrollbar-thin flex max-h-[46vh] flex-col overflow-y-auto rounded-control border border-line">
                {shown.map((i) => (
                  <li key={i.key} className="border-b border-line last:border-b-0">
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-surface-2">
                      <input type="checkbox" className="size-4 accent-accent" checked={selected.has(i.key)} onChange={() => toggle(i.key)} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-body font-medium">{i.title}</span>
                        <span className="truncate text-caption text-muted">
                          {RECOVERABLE_LABELS[i.type]} · {i.detail}
                        </span>
                      </span>
                      <Badge tone={i.state === "deleted" ? "amber" : "accent"}>{STATE_LABEL[i.state]}</Badge>
                    </label>
                  </li>
                ))}
                {!shown.length && <li className="px-3 py-6 text-center text-body text-muted">Nada com esse nome.</li>}
              </ul>
              <p className="text-caption leading-5 text-muted">
                Excluídos voltam como eram, com o mesmo endereço. Tarefas diferentes voltam à versão do backup (fica registrado no histórico). Plans diferentes voltam como
                cópia, sem mexer no atual. Coleções trazem de volta os links que estavam nelas.
              </p>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <span className="mr-auto text-caption text-muted">{selected.size ? `${selected.size} selecionado(s)` : ""}</span>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!selected.size || busy} onClick={submit}>
            {busy ? <Loader2 className="animate-spin" /> : <LifeBuoy />} Recuperar {selected.size || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
