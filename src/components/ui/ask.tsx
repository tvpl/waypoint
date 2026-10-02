"use client";
import * as React from "react";
import { Button } from "./button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "./dialog";
import { Input } from "./input";

/**
 * Promise-based confirm / prompt dialogs — styled replacements for window.confirm and
 * window.prompt. Render <AskHost /> once (root layout), then:
 *
 *   if (await ask.confirm({ title: "Excluir?", confirmLabel: "Excluir", danger: true })) …
 *   const name = await ask.prompt({ title: "Renomear", initial: tag.name });
 */

type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
};

type PromptOptions = {
  title: string;
  description?: React.ReactNode;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
};

type Request =
  | ({ kind: "confirm"; resolve: (v: boolean) => void } & ConfirmOptions)
  | ({ kind: "prompt"; resolve: (v: string | null) => void } & PromptOptions);

let current: Request | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function open(req: Request) {
  // Deferred so a dropdown item that triggers it can finish closing (and restoring focus) first.
  setTimeout(() => {
    // A new request supersedes one still open (resolving it as cancelled).
    if (current) settle(current, null);
    current = req;
    emit();
  }, 0);
}

function settle(req: Request, value: string | boolean | null) {
  if (req.kind === "confirm") req.resolve(value === true);
  else req.resolve(typeof value === "string" ? value : null);
  if (current === req) {
    current = null;
    emit();
  }
}

export const ask = {
  confirm(opts: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => open({ kind: "confirm", resolve, ...opts }));
  },
  prompt(opts: PromptOptions): Promise<string | null> {
    return new Promise((resolve) => open({ kind: "prompt", resolve, ...opts }));
  },
};

function useCurrent() {
  return React.useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}

export function AskHost() {
  const req = useCurrent();
  // Keep the last request rendered while the dialog animates out.
  const [shown, setShown] = React.useState<Request | null>(null);
  if (req && req !== shown) setShown(req);
  const [value, setValue] = React.useState("");
  const [prev, setPrev] = React.useState<Request | null>(null);
  if (req !== prev) {
    setPrev(req);
    if (req?.kind === "prompt") setValue(req.initial ?? "");
  }

  const r = req ?? shown;
  const cancel = () => req && settle(req, null);
  const submit = () => {
    if (!req) return;
    if (req.kind === "confirm") settle(req, true);
    else if (value.trim()) settle(req, value.trim());
  };

  return (
    <Dialog open={!!req} onOpenChange={(o) => !o && cancel()}>
      {r && (
        <DialogContent title={r.title} description={r.kind === "confirm" ? undefined : r.description} className="max-w-[440px]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <DialogBody>
              {r.kind === "confirm" ? (
                r.description && <div className="text-sm leading-6 text-ink-2">{r.description}</div>
              ) : (
                <label className="flex flex-col gap-1.5">
                  {r.label && <span className="text-body font-medium">{r.label}</span>}
                  <Input autoFocus value={value} placeholder={r.placeholder} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
                </label>
              )}
            </DialogBody>
            <DialogFooter className="justify-end">
              <Button type="button" variant="ghost" onClick={cancel}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant={r.kind === "confirm" && r.danger ? "danger" : "primary"}
                autoFocus={r.kind === "confirm"}
                disabled={r.kind === "prompt" && !value.trim()}
              >
                {r.confirmLabel ?? (r.kind === "confirm" ? "Confirmar" : "Salvar")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
