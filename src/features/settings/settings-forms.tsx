"use client";
import { useEffect, useState, useTransition } from "react";
import { Monitor, Moon, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDesktop } from "@/lib/desktop";
import { Field, Input, selectClass } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { applyMotion, applyTheme, useMotionPref, useThemePref, type MotionPref, type ThemePref } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { ask } from "@/components/ui/ask";
import {
  addMemberAction,
  changePasswordAction,
  removeMemberAction,
  renameWorkspaceAction,
  setMemberRoleAction,
  updateProfileAction,
} from "@/app/(app)/settings/actions";

type Result = { ok: true; message?: string } | { ok: false; error: string };
function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (r.message) toast.success(r.message);
        onOk?.();
      } else toast.error(r.error);
    });
  return { pending, run };
}

export function Card({ title, description, children, id }: { title: string; description?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-5 border-t border-line py-7 first:border-t-0 first:pt-4">
      <div className="flex max-w-2xl flex-col gap-1">
        <h2 className="text-lead font-semibold">{title}</h2>
        {description && <p className="text-body leading-5 text-muted">{description}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  );
}

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [value, setValue] = useState(name);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const { pending, run } = useAction();
  // The desktop app has no login: the e-mail is a placeholder and the password is never asked.
  const desktop = useDesktop();
  return (
    <>
      <div className="flex max-w-md flex-col gap-4">
        <Field label="Nome" htmlFor="p-name">
          <Input id="p-name" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        {!desktop && (
          <Field label="E-mail" htmlFor="p-email">
            <Input id="p-email" value={email} disabled />
          </Field>
        )}
        <Button className="self-start" disabled={pending || value === name} onClick={() => run(() => updateProfileAction(value))}>
          Salvar perfil
        </Button>
      </div>
      {!desktop && (
        <form
          className="flex max-w-md flex-col gap-4 border-t border-line pt-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => changePasswordAction(cur, next), () => (setCur(""), setNext("")));
          }}
        >
          <Field label="Senha atual" htmlFor="p-cur">
            <Input id="p-cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
          </Field>
          <Field label="Nova senha" htmlFor="p-new" hint="Mínimo de 8 caracteres.">
            <Input id="p-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Button type="submit" className="self-start" disabled={pending || !cur || next.length < 8}>
            Alterar senha
          </Button>
        </form>
      )}
    </>
  );
}

export function ThemePicker() {
  const pref = useThemePref();
  return (
    <Segmented
      className="self-start"
      label="Tema"
      value={pref}
      onChange={(v: ThemePref) => applyTheme(v)}
      options={[
        { value: "light", label: "Claro", icon: <Sun /> },
        { value: "dark", label: "Escuro", icon: <Moon /> },
        { value: "system", label: "Sistema", icon: <Monitor /> },
      ]}
    />
  );
}

/** Animations: as the system says, or always reduced. */
export function MotionPicker() {
  const pref = useMotionPref();
  return (
    <Segmented
      className="self-start"
      label="Animações"
      value={pref}
      onChange={(v: MotionPref) => applyMotion(v)}
      options={[
        { value: "system", label: "Como no sistema" },
        { value: "reduce", label: "Reduzir animações" },
      ]}
    />
  );
}

type Member = { userId: string; name: string; email: string; role: "owner" | "editor" | "viewer" };
const ROLE_LABEL = { owner: "Owner", editor: "Editor", viewer: "Viewer" } as const;

export function WorkspaceForm({ name, members, isOwner, meId }: { name: string; members: Member[]; isOwner: boolean; meId: string }) {
  const [value, setValue] = useState(name);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["role"]>("editor");
  const { pending, run } = useAction();
  return (
    <>
      <div className="flex max-w-md items-end gap-2">
        <Field label="Nome do workspace" htmlFor="w-name" className="flex-1">
          <Input id="w-name" value={value} disabled={!isOwner} onChange={(e) => setValue(e.target.value)} />
        </Field>
        {isOwner && (
          <Button disabled={pending || value === name || !value.trim()} onClick={() => run(() => renameWorkspaceAction(value))}>
            Salvar
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-ink-2">Membros</span>
        <div className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
          {members.map((m) => (
            <div key={m.userId} className="flex items-center gap-3 px-4 py-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">
                {(m.name[0] ?? "?").toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {m.name}
                  {m.userId === meId && <span className="text-muted"> (você)</span>}
                </span>
                <span className="truncate text-xs text-muted">{m.email}</span>
              </span>
              {isOwner ? (
                <>
                  <select
                    aria-label={`Papel de ${m.name}`}
                    value={m.role}
                    disabled={pending}
                    onChange={(e) => run(() => setMemberRoleAction(m.userId, e.target.value))}
                    className={cn(selectClass, "h-8 w-auto text-body")}
                  >
                    {Object.entries(ROLE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover ${m.name}`}
                    disabled={pending}
                    onClick={async () => {
                      const ok = await ask.confirm({
                        title: `Remover ${m.name}?`,
                        description: "A pessoa perde o acesso a este workspace na hora, incluindo tokens de API criados aqui.",
                        confirmLabel: "Remover",
                        danger: true,
                      });
                      if (ok) run(() => removeMemberAction(m.userId));
                    }}
                  >
                    <Trash2 />
                  </Button>
                </>
              ) : (
                <span className="text-body text-muted">{ROLE_LABEL[m.role]}</span>
              )}
            </div>
          ))}
        </div>
      </div>
      {isOwner && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addMemberAction(email, role), () => setEmail(""));
          }}
        >
          <Field label="Convidar por e-mail" htmlFor="w-invite" className="min-w-[220px] flex-1" hint="A pessoa precisa ter uma conta no Waypoint.">
            <Input id="w-invite" type="email" placeholder="nome@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <select aria-label="Papel" value={role} onChange={(e) => setRole(e.target.value as Member["role"])} className={cn(selectClass, "mb-[22px] w-auto")}>
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="owner">Owner</option>
          </select>
          <Button type="submit" variant="primary" className="mb-[22px]" disabled={pending || !email}>
            Adicionar
          </Button>
        </form>
      )}
    </>
  );
}
