"use client";
import { useRef, useState, useTransition } from "react";
import { ArrowRight, FileCheck2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import type { MarkdownReview } from "@/domain/task-markdown-review";

type PreviewResult =
  | { ok: true; data: MarkdownReview }
  | { ok: false; error: string };
export function MarkdownUpdateDialog({
  busy,
  onClose,
  onPreview,
  onApply,
}: {
  busy: boolean;
  onClose: () => void;
  onPreview: (text: string) => Promise<PreviewResult>;
  onApply: (
    text: string,
    token: string,
    selection: number[],
  ) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [review, setReview] = useState<MarkdownReview | null>(null);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [checking, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const working = busy || checking;
  const update = (value: string) => {
    setText(value);
    setReview(null);
    setSelection(new Set());
    setError("");
  };
  const preview = () =>
    start(async () => {
      setError("");
      try {
        const result = await onPreview(text);
        if (!result.ok) return setError(result.error);
        setReview(result.data);
        setSelection(
          new Set(
            result.data.rows
              .filter((r) => r.kind === "update")
              .map((r) => r.index),
          ),
        );
      } catch {
        setError("Não foi possível revisar agora. Tente novamente.");
      }
    });
  return (
    <Dialog open onOpenChange={(v) => !v && !working && onClose()}>
      <DialogContent
        title="Atualizar via Markdown"
        description="Revise as diferenças antes de alterar as tarefas existentes."
        className="max-w-3xl"
      >
        <DialogBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={working}
              onClick={() => input.current?.click()}
            >
              <Upload />
              Abrir .md
            </Button>
            <p className="min-w-0 flex-1 text-xs leading-5 text-muted">
              Use um arquivo exportado pelo Waypoint e preserve os comentários
              de referência. Tarefas novas podem ser criadas em Importar
              Markdown.
            </p>
          </div>
          <input
            ref={input}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            className="hidden"
            aria-label="Arquivo para atualizar tarefas"
            disabled={working}
            onChange={async (event) => {
              const el = event.currentTarget,
                file = el.files?.[0];
              if (!file) return;
              if (file.size > 500000) {
                setError("Escolha um arquivo de até 500 KB.");
                return;
              }
              update(await file.text());
              el.value = "";
            }}
          />
          <Textarea
            aria-label="Markdown para atualização"
            value={text}
            maxLength={250000}
            disabled={working}
            onChange={(e) => update(e.target.value)}
            placeholder="Cole aqui o Markdown editado pela IA…"
            className="min-h-40 font-mono text-xs"
          />
          {review && (
            <div className="space-y-3" aria-label="Prévia das alterações">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <p role="status">
                  {review.rows.filter((r) => r.kind === "update").length} com
                  alterações ·{" "}
                  {review.rows.filter((r) => r.kind === "unchanged").length} sem
                  alterações ·{" "}
                  {review.rows.filter((r) => r.kind === "conflict").length} para
                  revisar
                </p>
                <button
                  className="text-accent-ink"
                  disabled={working}
                  onClick={() =>
                    setSelection(
                      selection.size
                        ? new Set()
                        : new Set(
                            review.rows
                              .filter((r) => r.kind === "update")
                              .map((r) => r.index),
                          ),
                    )
                  }
                >
                  {selection.size ? "Desmarcar todas" : "Selecionar alterações"}
                </button>
              </div>
              {review.rows.map((row) => (
                <div
                  key={row.index}
                  className="rounded-control border border-line bg-surface-2 p-3"
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-accent"
                      aria-label={`Aplicar alterações de ${row.title}`}
                      disabled={working || row.kind !== "update"}
                      checked={selection.has(row.index)}
                      onChange={(e) =>
                        setSelection((old) => {
                          const next = new Set(old);
                          if (e.target.checked) next.add(row.index);
                          else next.delete(row.index);
                          return next;
                        })
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-body font-medium">
                        {row.title}
                      </p>
                      {row.message ? (
                        <p className="mt-1 text-xs leading-5 text-amber-ink">
                          {row.message}
                        </p>
                      ) : row.kind === "unchanged" ? (
                        <p className="mt-1 text-xs text-muted">
                          Sem alterações
                        </p>
                      ) : (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-accent-ink">
                            {row.changes.length}{" "}
                            {row.changes.length === 1
                              ? "campo alterado"
                              : "campos alterados"}
                          </summary>
                          <div className="mt-3 space-y-3">
                            {row.changes.map((change) => (
                              <div key={change.field}>
                                <p className="mb-1.5 text-xs font-medium">
                                  {change.field}
                                </p>
                                <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr]">
                                  <div className="min-w-0 rounded border border-line bg-surface p-2">
                                    <span className="text-[10px] text-muted">
                                      Antes
                                    </span>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5">
                                      {change.before || "Vazio"}
                                    </p>
                                  </div>
                                  <ArrowRight className="hidden size-3 self-center text-muted sm:block" />
                                  <div className="min-w-0 rounded border border-accent-line bg-accent-soft p-2">
                                    <span className="text-[10px] text-accent-ink">
                                      Depois
                                    </span>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5">
                                      {change.after || "Vazio"}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="text-body text-danger">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter className="flex-wrap">
          <Button variant="ghost" disabled={working} onClick={onClose}>
            Cancelar
          </Button>
          <span className="flex-1" />
          <Button disabled={working || !text.trim()} onClick={preview}>
            <FileCheck2 />
            {checking
              ? "Revisando…"
              : review
                ? "Revisar novamente"
                : "Revisar alterações"}
          </Button>
          {review && (
            <Button
              variant="primary"
              disabled={working || !selection.size}
              onClick={async () => {
                if (await onApply(text, review.token, [...selection]))
                  onClose();
              }}
            >
              Aplicar {selection.size}{" "}
              {selection.size === 1 ? "atualização" : "atualizações"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
