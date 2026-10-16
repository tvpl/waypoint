"use client";
import { useState } from "react";
import { Layers, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import type { TaskTemplate } from "@/domain/task-template";
export function TaskTemplateDialog({
  name: projectName,
  templates,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  name: string;
  templates: TaskTemplate[];
  busy: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<boolean>;
  onDelete: (id: string, version: number) => Promise<boolean>;
}) {
  const [name, setName] = useState(projectName);
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent
        title="Modelo de projeto"
        description="Guarde blocos, colunas, limites e a cor do projeto para reutilizar. As tarefas ficam no projeto original."
        className="max-w-lg"
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            if (name.trim() && (await onSave(name.trim()))) onClose();
          }}
        >
          <DialogBody>
            <Field label="Nome do modelo" htmlFor="template-name">
              <Input
                id="template-name"
                autoFocus
                required
                maxLength={100}
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            {templates.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="mb-2 text-xs font-medium">Modelos do workspace</p>
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="flex min-w-0 items-center gap-2 rounded-control border border-line px-3 py-2"
                  >
                    <Layers className="size-3.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {template.name}
                    </span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Excluir modelo ${template.name}`}
                      disabled={busy}
                      onClick={async () => {
                        if (
                          window.confirm(
                            `Excluir o modelo “${template.name}”? Os projetos criados com ele serão mantidos.`,
                          )
                        )
                          await onDelete(template.id, template.version);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <span className="flex-1" />
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !name.trim()}
            >
              Salvar modelo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
