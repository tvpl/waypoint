"use client";
import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ConfirmDialog, type ConfirmRequest } from "@/features/links/confirm-dialog";
import { createApiTokenAction, revokeApiTokenAction } from "@/app/(app)/settings/actions";
import { timeAgo } from "@/lib/utils";

export type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  workspaceId: string;
  workspaceName: string;
  createdAt: number;
  lastUsedAt: number | null;
};

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" });

export function ApiTokens({ initial, workspaceName, role }: { initial: TokenRow[]; workspaceName: string; role: "owner" | "editor" | "viewer" }) {
  const [tokens, setTokens] = useState(initial);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [pending, start] = useTransition();
  const multiWorkspace = new Set(tokens.map((t) => t.workspaceId)).size > 1;

  const create = () =>
    start(async () => {
      const r = await createApiTokenAction(name);
      if (!r.ok) return void toast.error(r.error);
      setCreated({ token: r.token, name: name.trim() });
      setCopied(false);
      setTokens(r.tokens);
      setName("");
    });

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.token);
      setCopied(true);
      toast.success("Token copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  };

  const revoke = (t: TokenRow) =>
    setConfirm({
      title: `Revogar “${t.name}”?`,
      description: (
        <>
          Extensões e integrações que usam <code className="rounded bg-subtle px-1 font-mono text-[12px]">{t.prefix}…</code> deixam de funcionar
          imediatamente. Esta ação não pode ser desfeita.
        </>
      ),
      confirmLabel: "Revogar token",
      danger: true,
      run: async () => {
        const r = await revokeApiTokenAction(t.id);
        if (!r.ok) return void toast.error(r.error);
        setTokens(r.tokens);
        toast.success("Token revogado");
      },
    });

  return (
    <>
      <form
        className="flex max-w-xl flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create();
        }}
      >
        <Field
          label="Nome do token"
          htmlFor="t-name"
          className="min-w-[220px] flex-1"
          hint={
            <>
              Age em seu nome no workspace <strong className="font-medium text-ink-2">{workspaceName}</strong>, com o seu papel atual
              {role === "viewer" ? " (viewer: somente leitura)" : ""}.
            </>
          }
        >
          <Input id="t-name" placeholder="Ex.: Extensão do Chrome — notebook" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" className="mb-[22px]" disabled={pending || !name.trim()}>
          <KeyRound />
          Criar token
        </Button>
      </form>

      {created && (
        <div role="status" className="flex max-w-xl flex-col gap-3 rounded-xl border border-accent-line bg-accent-soft p-4">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden />
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-semibold text-accent-ink">Copie o token “{created.name}” agora</p>
              <p className="text-body leading-5 text-ink-2">Por segurança, ele não será exibido de novo. Se perder, revogue e crie outro.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              aria-label="Novo token de API"
              value={created.token}
              onFocus={(e) => e.target.select()}
              className="h-9 min-w-0 flex-1 rounded-control border border-line-2 bg-surface px-3 font-mono text-body text-ink outline-none transition-[border,box-shadow] focus:border-accent focus:ring-3 focus:ring-accent/15"
            />
            <Button variant={copied ? "secondary" : "primary"} onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="-ml-1.5 self-start" onClick={() => setCreated(null)}>
            Concluído
          </Button>
        </div>
      )}

      {tokens.length === 0 ? (
        <p className="max-w-xl rounded-xl border border-dashed border-line-2 px-4 py-5 text-body leading-5 text-muted">
          Nenhum token ainda. Crie um para conectar a extensão <span className="text-ink-2">Salvar no Waypoint</span> ou outras integrações à API.
        </p>
      ) : (
        <ul aria-label="Tokens de API" className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-ink-2">
                <KeyRound className="size-4" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <span className="truncate text-sm font-medium">{t.name}</span>
                  <code className="font-mono text-xs text-muted">{t.prefix}…</code>
                </span>
                <span className="truncate text-xs text-muted" suppressHydrationWarning>
                  Criado em {dateFmt.format(t.createdAt)} · {t.lastUsedAt ? `usado ${timeAgo(t.lastUsedAt)}` : "nunca usado"}
                  {multiWorkspace ? ` · ${t.workspaceName}` : ""}
                </span>
              </span>
              <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft hover:text-danger" aria-label={`Revogar token ${t.name}`} onClick={() => revoke(t)}>
                <Trash2 />
                <span className="max-sm:sr-only">Revogar</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-body leading-5 text-muted">
        Use com a extensão de navegador <span className="text-ink-2">Salvar no Waypoint</span> (pasta <code className="font-mono text-xs">extension/</code>) ou chame a
        API REST em <code className="font-mono text-xs">/api/v1</code> com o cabeçalho <code className="font-mono text-xs">Authorization: Bearer wp_…</code>.
      </p>
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
