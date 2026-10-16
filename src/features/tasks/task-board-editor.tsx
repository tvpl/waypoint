"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, Input, selectClass } from "@/components/ui/input";
import {
  boardInputSchema,
  defaultColumns,
  type BoardInput,
  type TaskBoard,
} from "@/domain/task-board";
import { STATUS_LABELS, TASK_STATUSES } from "@/domain/tasks";
export function TaskBoardEditor({
  board,
  projectId,
  busy,
  onClose,
  onSave,
}: {
  board: TaskBoard | null;
  projectId: string | null;
  busy: boolean;
  onClose: () => void;
  onSave: (input: BoardInput, board: TaskBoard | null) => Promise<boolean>;
}) {
  const [name, setName] = useState(board?.name ?? "");
  const [columns, setColumns] = useState(board?.columns ?? defaultColumns());
  const [error, setError] = useState("");
  const reorder = (i: number, direction: number) =>
    setColumns((cs) => {
      const next = [...cs];
      [next[i], next[i + direction]] = [next[i + direction], next[i]];
      return next;
    });
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent
        title={board ? "Organizar bloco" : "Novo bloco"}
        description="Etapas com os nomes e a ordem que fazem sentido neste projeto."
        className="max-w-xl"
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            const input = boardInputSchema.safeParse({
              name,
              columns,
              projectId,
              isDefault: board?.isDefault ?? false,
            });
            if (!input.success) return setError(input.error.issues[0].message);
            setError("");
            if (await onSave(input.data, board)) onClose();
          }}
        >
          <DialogBody className="space-y-5">
            <fieldset disabled={busy} className="contents">
              <Field label="Nome do bloco" htmlFor="board-name">
                <Input
                  id="board-name"
                  autoFocus
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Entregas, Aguardando retornos…"
                />
              </Field>
              <div>
                <p className="mb-1 text-xs font-medium">Colunas</p>
                <p className="mb-3 text-xs leading-5 text-muted">
                  O nome é livre. A etapa associada mantém filtros e conclusão
                  consistentes. Mova as tarefas antes de remover uma coluna
                  usada.
                </p>
                <div className="space-y-2">
                  {columns.map((column, i) => (
                    <div
                      key={column.id}
                      className="flex flex-wrap items-center gap-1.5 rounded-control border border-line bg-surface-2 p-2"
                    >
                      <Input
                        aria-label={`Nome da coluna ${i + 1}`}
                        value={column.name}
                        maxLength={60}
                        required
                        className="min-w-28 flex-1 text-body"
                        onChange={(e) =>
                          setColumns((cs) =>
                            cs.map((c) =>
                              c.id === column.id
                                ? { ...c, name: e.target.value }
                                : c,
                            ),
                          )
                        }
                      />
                      <select
                        aria-label={`Etapa da coluna ${i + 1}`}
                        className={`${selectClass} w-32 text-xs`}
                        value={column.status}
                        onChange={(e) =>
                          setColumns((cs) =>
                            cs.map((c) =>
                              c.id === column.id
                                ? {
                                    ...c,
                                    status: e.target.value as typeof c.status,
                                  }
                                : c,
                            ),
                          )
                        }
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        aria-label={`Limite da coluna ${i + 1}`}
                        value={column.limit ?? ""}
                        placeholder="Limite"
                        className="w-20 text-xs"
                        onChange={(e) =>
                          setColumns((cs) =>
                            cs.map((c) =>
                              c.id === column.id
                                ? {
                                    ...c,
                                    limit: e.target.value
                                      ? Number(e.target.value)
                                      : null,
                                  }
                                : c,
                            ),
                          )
                        }
                      />
                      <div className="flex">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Subir coluna ${i + 1}`}
                          disabled={i === 0 || busy}
                          onClick={() => reorder(i, -1)}
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Descer coluna ${i + 1}`}
                          disabled={i === columns.length - 1 || busy}
                          onClick={() => reorder(i, 1)}
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remover coluna ${i + 1}`}
                          disabled={columns.length <= 1 || busy}
                          onClick={() =>
                            setColumns((cs) =>
                              cs.filter((c) => c.id !== column.id),
                            )
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  disabled={columns.length >= 16 || busy}
                  onClick={() =>
                    setColumns((cs) => [
                      ...cs,
                      {
                        id: crypto.randomUUID(),
                        name: "Nova coluna",
                        status: "todo",
                        limit: null,
                      },
                    ])
                  }
                >
                  <Plus />
                  Adicionar coluna
                </Button>
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="text-body text-danger">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button disabled={busy} variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !name.trim()}
            >
              Salvar bloco
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
