"use client";
import * as React from "react";
import { Check, DatabaseZap, FolderOpen, TriangleAlert } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useDesktop } from "@/lib/desktop";
import { cn } from "@/lib/utils";
import type { PendingUpdate } from "@/server/services/database-update";

type Phase = "ask" | "backup" | "update" | "done";
const NOTE = "Antes de atualizar";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const cleanError = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

function Spinner() {
  return <span className="size-3.5 animate-spin rounded-full border-2 border-line-2 border-t-accent" />;
}

function Step({ label, state }: { label: string; state: "waiting" | "running" | "done" }) {
  return (
    <li className={cn("flex items-center gap-2.5 text-body", state === "waiting" ? "text-muted" : "text-ink")}>
      <span className="flex size-5 items-center justify-center">
        {state === "running" ? <Spinner /> : state === "done" ? <Check className="size-4 text-success-ink" /> : <span className="size-1.5 rounded-full bg-line-2" />}
      </span>
      {label}
    </li>
  );
}

/**
 * Shown by the root layout in place of every page while this version's database update is pending
 * (src/server/db): offers a full backup first, then applies the migrations in one transaction.
 * The desktop app backs up through its backup center; a server keeps a copy of the database file.
 */
export function DatabaseUpdate({ update }: { update: PendingUpdate }) {
  const desktop = useDesktop();
  const [backup, setBackup] = React.useState(true);
  const [phase, setPhase] = React.useState<Phase>("ask");
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<{ label: string; revealId?: string } | null>(null);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const running = phase === "backup" || phase === "update";

  async function post(step: "backup" | "update") {
    const res = await fetch("/api/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step, ...(update.needsSignIn ? { email, password } : {}) }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string; file?: string } | null;
    if (!res.ok) throw new Error(body?.error ?? `Erro ${res.status}`);
    return body ?? {};
  }

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    try {
      if (backup && !saved) {
        setPhase("backup");
        if (desktop?.backups) {
          const state = await desktop.backups("create", NOTE);
          setSaved({ label: `Na central de backups do app, como “${NOTE}”.`, revealId: state.items[0]?.id });
        } else {
          const { file } = await post("backup");
          setSaved({ label: `Cópia do banco “${file}”, na pasta backups ao lado dele no servidor.` });
        }
      }
      setPhase("update");
      await post("update");
      setPhase("done");
    } catch (err) {
      setError(cleanError(err));
      setPhase("ask");
    }
  }

  const changes = update.schemaChanges + update.changes.length;
  const stepState = (step: "backup" | "update") =>
    phase === step ? "running" : phase === "done" || (step === "backup" && (phase === "update" || !!saved)) ? "done" : "waiting";

  return (
    <main className="relative min-h-app overflow-hidden bg-bg">
      <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <Dialog open>
        <DialogContent
          hideClose
          title={phase === "done" ? "Dados atualizados" : "Atualizar os dados"}
          description={phase === "done" ? "Tudo no formato desta versão do Waypoint." : "Esta versão do Waypoint muda a estrutura dos dados salvos."}
          className="max-w-[520px]"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <form onSubmit={run} className="flex min-h-0 flex-col">
            <DialogBody>
              <div className="flex items-start gap-3 rounded-control border border-line bg-surface-2 px-3.5 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
                  <DatabaseZap className="size-[18px]" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-body font-medium">
                    {update.schemaChanges ? `Versão dos dados ${update.version} → ${update.target}` : "Ajustes nos dados"}
                  </span>
                  <span className="text-caption text-muted">{phase === "done" ? plural(changes, "alteração aplicada", "alterações aplicadas") : plural(changes, "alteração pendente", "alterações pendentes")}</span>
                  {update.changes.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-caption text-ink-2">
                      {update.changes.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {phase === "done" ? (
                <div className="flex flex-col gap-2 text-body text-ink-2">
                  {saved ? (
                    <p>
                      <span className="font-medium text-ink">Backup de antes da atualização:</span> {saved.label}
                    </p>
                  ) : (
                    <p>A atualização foi feita sem backup.</p>
                  )}
                  {saved?.revealId && desktop && (
                    <Button variant="ghost" size="sm" className="self-start" onClick={() => void desktop.backups("reveal", saved.revealId)}>
                      <FolderOpen /> Mostrar na pasta
                    </Button>
                  )}
                </div>
              ) : running ? (
                <ul className="flex flex-col gap-2">
                  {backup && <Step label="Backup completo" state={stepState("backup")} />}
                  <Step label="Atualização dos dados" state={stepState("update")} />
                </ul>
              ) : (
                <>
                  <p className="text-body leading-5 text-ink-2">
                    O Waypoint fica pausado até a atualização terminar. Ela roda de uma vez só: se algo falhar, nada é alterado e você pode tentar de novo.
                  </p>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-control border px-3.5 py-3 transition-colors",
                      backup ? "border-accent bg-accent-soft/40" : "border-line-2 hover:bg-hover",
                    )}
                  >
                    <input type="checkbox" className="mt-0.5 size-4 accent-accent" checked={backup} disabled={!!saved} onChange={(e) => setBackup(e.target.checked)} />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-body font-medium">{saved ? "Backup feito" : "Fazer um backup completo antes (recomendado)"}</span>
                      <span className="text-caption leading-4 text-muted">
                        {saved
                          ? saved.label
                          : desktop
                            ? "Vai para a central de backups, com o banco, as imagens e o bloqueio. Não é apagado pela limpeza automática e restaura o estado de agora."
                            : "Uma cópia completa do arquivo do banco, na pasta backups ao lado dele (e em WAYPOINT_BACKUP_DIR, se definida)."}
                      </span>
                    </span>
                  </label>
                  {!backup && (
                    <p className="flex items-center gap-2 text-caption text-amber-ink">
                      <TriangleAlert className="size-3.5 shrink-0" /> Sem backup, não há como voltar aos dados como estão agora.
                    </p>
                  )}
                  {update.needsSignIn && (
                    <div className="flex flex-col gap-3">
                      <p className="text-caption text-muted">Confirme com o e-mail e a senha de uma conta deste Waypoint.</p>
                      <Field label="E-mail" htmlFor="update-email">
                        <Input id="update-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                      </Field>
                      <Field label="Senha" htmlFor="update-password">
                        <Input id="update-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                      </Field>
                    </div>
                  )}
                </>
              )}

              {error && (
                <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-body text-danger">
                  {error}
                </p>
              )}
            </DialogBody>
            <DialogFooter className="justify-end">
              {phase === "done" ? (
                <Button variant="primary" onClick={() => window.location.reload()} autoFocus>
                  Continuar
                </Button>
              ) : (
                <Button type="submit" variant="primary" disabled={running}>
                  {running && <Spinner />}
                  {backup && !saved ? "Fazer backup e atualizar" : "Atualizar"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
