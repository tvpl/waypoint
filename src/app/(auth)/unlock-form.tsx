"use client";
import * as React from "react";
import { useActionState } from "react";
import { ArrowRight, KeyRound, Lock } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { unlockAction } from "./actions";

/** Desktop app lock screen: the local person's name and a password field. */
export function UnlockForm({ name, next }: { name: string; next?: string }) {
  const [state, action, pending] = useActionState(unlockAction, undefined);
  const [help, setHelp] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  // A wrong password clears the field and keeps the focus there.
  React.useEffect(() => {
    if (state?.error && input.current) {
      input.current.value = "";
      input.current.focus();
    }
  }, [state]);

  return (
    <main className="relative flex min-h-app items-center justify-center overflow-hidden bg-bg px-4 py-12">
      <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div className="relative flex w-full max-w-[380px] flex-col items-center gap-7 text-center">
        <div className="relative">
          <span className="flex size-20 items-center justify-center rounded-full bg-accent-soft font-display font-semibold text-[40px] leading-none text-accent-ink shadow-raise">
            {(name.trim()[0] ?? "?").toUpperCase()}
          </span>
          <span className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full border-2 border-bg bg-ink text-bg">
            <Lock className="size-[15px]" strokeWidth={2.25} />
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display font-semibold text-display-sm leading-none tracking-[-0.025em]">Olá, {name}</h1>
          <p className="text-body text-muted">O Waypoint está bloqueado. Digite sua senha para continuar.</p>
        </div>
        <form action={action} className="flex w-full flex-col gap-3">
          {next && <input type="hidden" name="next" value={next} />}
          <label className="group flex h-12 items-center gap-2.5 rounded-control border border-line-2 bg-surface pl-3.5 pr-1.5 shadow-rest transition-colors focus-within:border-accent">
            <KeyRound className="size-[17px] shrink-0 text-muted" />
            <span className="sr-only">Senha</span>
            <input
              ref={input}
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              placeholder="Senha"
              className="h-full min-w-0 flex-1 bg-transparent text-lead outline-none placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={pending}
              aria-label="Desbloquear"
              className="wp-btn-primary flex size-9 shrink-0 items-center justify-center rounded-lg text-white disabled:opacity-60"
            >
              {pending ? <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <ArrowRight className="size-[17px]" />}
            </button>
          </label>
          {state?.error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-body text-danger">
              {state.error}
            </p>
          )}
        </form>
        <div className="flex flex-col items-center gap-2">
          <button type="button" className="text-body text-muted underline-offset-4 hover:text-ink hover:underline" onClick={() => setHelp((h) => !h)}>
            Esqueceu a senha?
          </button>
          {help && (
            <p className="rounded-control border border-line bg-surface px-4 py-3 text-left text-body leading-5 text-ink-2">
              Feche o Waypoint e apague o arquivo <code className="font-mono text-caption">security.json</code> da pasta de dados. O bloqueio é desativado e seus
              plans e links continuam intactos.
            </p>
          )}
        </div>
        <span className="flex items-center gap-2 text-caption text-muted">
          <Logo size={18} /> Waypoint
        </span>
      </div>
    </main>
  );
}
