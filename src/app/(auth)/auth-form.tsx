"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Logo } from "@/components/shell/logo";
import { loginAction, signupAction } from "./actions";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, action, pending] = useActionState(mode === "login" ? loginAction : signupAction, undefined);
  return (
    <main className="flex min-h-app items-center justify-center bg-bg px-4 py-12">
      <div className="flex w-full max-w-[400px] flex-col gap-8">
        <div className="flex flex-col items-start gap-5">
          <Logo size={40} />
          <div className="flex flex-col gap-2">
            <h1 className="font-display font-semibold text-display-lg leading-none tracking-[-0.025em]">
              {mode === "login" ? "Bem-vindo de volta" : "Comece a organizar"}
              <span className="text-accent">.</span>
            </h1>
            <p className="text-lead text-muted">
              {mode === "login" ? "Entre para acessar seus plans e links." : "Crie sua conta — seu workspace pessoal é criado automaticamente."}
            </p>
          </div>
        </div>
        <form action={action} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
          {next && <input type="hidden" name="next" value={next} />}
          {mode === "signup" && (
            <Field label="Nome" htmlFor="name">
              <Input id="name" name="name" autoComplete="name" required />
            </Field>
          )}
          <Field label="E-mail" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Senha" htmlFor="password" hint={mode === "signup" ? "Mínimo de 8 caracteres." : undefined}>
            <Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required />
          </Field>
          {state?.error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-body text-danger">
              {state.error}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" disabled={pending} className="mt-1 justify-center">
            {pending ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
          </Button>
        </form>
        <p className="text-center text-body text-muted">
          {mode === "login" ? (
            <>
              Ainda não tem conta? <Link href="/signup" className="font-medium text-accent-ink">Criar conta</Link>
            </>
          ) : (
            <>
              Já tem conta? <Link href="/login" className="font-medium text-accent-ink">Entrar</Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
