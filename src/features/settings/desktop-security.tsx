"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Lock, LockOpen, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { changeLockPasswordAction, disableLockAction, enableLockAction, updateLockPrefsAction } from "@/app/(app)/settings/desktop-actions";
import { lockNow } from "@/components/shell/desktop-commands";
import type { DesktopSecurity as Security } from "@/server/desktop-security";
import { Card } from "./settings-forms";

const AUTO_LOCK: { value: number; label: string }[] = [
  { value: 0, label: "Nunca" },
  { value: 1, label: "Após 1 minuto" },
  { value: 5, label: "Após 5 minutos" },
  { value: 15, label: "Após 15 minutos" },
  { value: 30, label: "Após 30 minutos" },
  { value: 60, label: "Após 1 hora" },
];

type Result = Awaited<ReturnType<typeof enableLockAction>>;

/** Desktop app only: password lock, auto-lock and lock on sleep (src/server/desktop-security.ts). */
export function DesktopSecurity({ initial, mac }: { initial: Security; mac: boolean }) {
  const router = useRouter();
  const [security, setSecurity] = React.useState(initial);
  const [mode, setMode] = React.useState<"idle" | "change" | "disable">("idle");
  const [pending, start] = React.useTransition();
  const [fields, setFields] = React.useState({ current: "", next: "", confirm: "" });
  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [k]: e.target.value }));

  const submit = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      if (res.security) setSecurity(res.security);
      if (res.message) toast.success(res.message);
      setFields({ current: "", next: "", confirm: "" });
      setMode("idle");
      after?.();
      router.refresh();
    });

  const diskEncryption = mac ? "FileVault (Ajustes do Sistema → Privacidade e Segurança)" : "a criptografia de disco do sistema (BitLocker no Windows)";

  return (
    <Card
      id="seguranca"
      title="Segurança"
      description="Com o bloqueio ativo, o Waypoint pede sua senha ao abrir, depois de um tempo sem uso e quando o computador dorme. Para proteger também os arquivos de dados, ative a criptografia de disco do sistema."
    >
      <div className="flex flex-wrap items-center gap-3 rounded-control border border-line bg-surface-2 px-4 py-3">
        <span className={security.lock ? "flex size-9 items-center justify-center rounded-lg bg-success-bg text-success-ink" : "flex size-9 items-center justify-center rounded-lg bg-subtle text-muted"}>
          {security.lock ? <ShieldCheck className="size-[18px]" /> : <LockOpen className="size-[18px]" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2 text-body font-semibold">
            Bloqueio com senha {security.lock ? <Badge tone="success">Ativo</Badge> : <Badge>Desativado</Badge>}
          </span>
          <span className="text-caption text-muted">
            {security.lock ? "A senha é pedida a cada vez que o Waypoint abre." : "Qualquer pessoa usando este computador abre o Waypoint direto."}
          </span>
        </span>
        {security.lock && (
          <Button onClick={() => void lockNow(router)}>
            <Lock /> Bloquear agora
          </Button>
        )}
      </div>

      {!security.lock && (
        <form
          className="flex max-w-md flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(() => enableLockAction(fields.next, fields.confirm));
          }}
        >
          <Field label="Nova senha" htmlFor="lock-new" hint="Ao menos 6 caracteres. Não há como recuperá-la pelo aplicativo.">
            <Input id="lock-new" type="password" autoComplete="new-password" value={fields.next} onChange={set("next")} />
          </Field>
          <Field label="Repita a senha" htmlFor="lock-confirm">
            <Input id="lock-confirm" type="password" autoComplete="new-password" value={fields.confirm} onChange={set("confirm")} />
          </Field>
          <Button type="submit" variant="primary" className="self-start" disabled={pending || fields.next.length < 6 || !fields.confirm}>
            <Lock /> Ativar bloqueio
          </Button>
        </form>
      )}

      {security.lock && (
        <>
          <div className="flex flex-col gap-3">
            <label className="flex flex-wrap items-center gap-2.5 text-body text-ink-2">
              Bloquear sem uso
              <select
                className="wp-select h-8 rounded-lg border border-line-2 bg-surface pl-2.5 pr-8 text-body"
                value={security.autoLockMinutes}
                onChange={(e) => submit(() => updateLockPrefsAction({ autoLockMinutes: Number(e.target.value) }))}
              >
                {AUTO_LOCK.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-body">
              <input
                type="checkbox"
                className="size-4 accent-[var(--accent)]"
                checked={security.lockOnSleep}
                onChange={(e) => submit(() => updateLockPrefsAction({ lockOnSleep: e.target.checked }))}
              />
              Bloquear quando o computador dormir ou a tela for bloqueada
            </label>
          </div>

          {mode === "idle" && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setMode("change")}>
                <KeyRound /> Alterar senha
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode("disable")}>
                <LockOpen /> Desativar bloqueio
              </Button>
            </div>
          )}

          {mode !== "idle" && (
            <form
              className="flex max-w-md flex-col gap-4 rounded-control border border-line p-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit(() => (mode === "change" ? changeLockPasswordAction(fields.current, fields.next, fields.confirm) : disableLockAction(fields.current)));
              }}
            >
              <Field label="Senha atual" htmlFor="lock-current">
                <Input id="lock-current" type="password" autoComplete="current-password" autoFocus value={fields.current} onChange={set("current")} />
              </Field>
              {mode === "change" && (
                <>
                  <Field label="Nova senha" htmlFor="lock-new2" hint="Ao menos 6 caracteres.">
                    <Input id="lock-new2" type="password" autoComplete="new-password" value={fields.next} onChange={set("next")} />
                  </Field>
                  <Field label="Repita a nova senha" htmlFor="lock-confirm2">
                    <Input id="lock-confirm2" type="password" autoComplete="new-password" value={fields.confirm} onChange={set("confirm")} />
                  </Field>
                </>
              )}
              <div className="flex gap-2">
                <Button type="submit" variant={mode === "disable" ? "danger" : "primary"} disabled={pending || !fields.current}>
                  {mode === "change" ? "Salvar nova senha" : "Desativar bloqueio"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => (setMode("idle"), setFields({ current: "", next: "", confirm: "" }))}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </>
      )}
      <p className="text-caption text-muted">Os arquivos do banco não são criptografados pelo Waypoint. Para isso, use {diskEncryption}.</p>
    </Card>
  );
}
