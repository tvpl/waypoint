"use client";
import { useRef, useState } from "react";
import { Copy, Download, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, Input, Textarea, selectClass } from "@/components/ui/input";
import {
  parseTasksMarkdown,
  projectInputSchema,
  type TaskColor,
  type TaskProject,
} from "@/domain/tasks";
import type { TaskTemplate } from "@/domain/task-template";
import { ColorPicker } from "./task-editor";
import { toast } from "sonner";

export function downloadMarkdown(text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/markdown;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "waypoint-tarefas.md";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function copyMarkdown(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Markdown copiado.");
  } catch {
    toast.error("Não foi possível copiar. Use a opção de baixar o arquivo.");
  }
}
const EXAMPLE =
  "## Meu projeto\n\n- [ ] Preparar a próxima entrega\n  **Objetivo:** transformar ideias em próximos passos.\n  - [ ] Reunir referências\n  - [ ] Alinhar com o time\n\n- [ ] Revisar os pontos pendentes\n  Aguardando retorno sobre o orçamento.\n\n- [x] Definir o objetivo do projeto\n";
export function MarkdownDialog({
  mode,
  text,
  count,
  canEdit,
  busy,
  onImport,
  onClose,
}: {
  mode: "import" | "export";
  text: string;
  count: number;
  canEdit: boolean;
  busy: boolean;
  onImport: (text: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(mode === "export" ? text : "");
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  let preview: ReturnType<typeof parseTasksMarkdown> = [];
  let parseError = "";
  if (mode === "import" && value.trim()) {
    try {
      preview = parseTasksMarkdown(value);
    } catch (e) {
      parseError = e instanceof Error ? e.message : "Markdown inválido.";
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        title={
          mode === "import"
            ? "Do Markdown para a ação"
            : "Leve suas tarefas com você"
        }
        description={
          mode === "import"
            ? "Cole uma checklist de uma IA, editor ou arquivo .md. Revise antes de importar."
            : `${count} ${count === 1 ? "tarefa" : "tarefas"} da visão atual. Pronto para usar com Cursor e outras IAs.`
        }
        className="max-w-[760px]"
      >
        <DialogBody>
          <div className="flex flex-wrap items-center gap-2">
            {mode === "import" ? (
              <>
                <Button
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  <Upload />
                  Abrir .md
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setValue(EXAMPLE)}
                >
                  Ver exemplo
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept=".md,.markdown,.txt,text/markdown,text/plain"
                  aria-label="Arquivo Markdown"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 500000)
                      return setError("Escolha um arquivo de até 500 KB.");
                    setError("");
                    setValue(await file.text());
                    e.target.value = "";
                  }}
                />
              </>
            ) : (
              <>
                <Button size="sm" onClick={() => void copyMarkdown(value)}>
                  <Copy />
                  Copiar
                </Button>
                <Button size="sm" onClick={() => downloadMarkdown(value)}>
                  <Download />
                  Baixar .md
                </Button>
              </>
            )}
          </div>
          <Textarea
            aria-label="Conteúdo Markdown"
            readOnly={mode === "export"}
            disabled={busy}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="min-h-64 font-mono text-xs"
            placeholder={EXAMPLE}
          />
          {mode === "export" && (
            <p className="text-xs leading-5 text-muted">
              Para atualizar estas mesmas tarefas depois, preserve os
              comentários Waypoint e use Atualizar via Markdown.
            </p>
          )}
          {mode === "import" && (
            <>
              <p className="text-xs leading-5 text-muted">
                Use <code>- [ ] tarefa</code> e indente subtarefas com dois
                espaços. Títulos <code>## Projeto</code> agrupam tarefas. A
                importação cria cópias; não altera tarefas existentes. Metadados
                Waypoint preservam cores, datas, marcadores e pessoas.
              </p>
              {preview.length > 0 && (
                <div className="max-h-36 space-y-2 overflow-y-auto rounded-control border border-line bg-surface-2 p-3">
                  <p className="text-xs font-medium">
                    {preview.length}{" "}
                    {preview.length === 1 ? "tarefa" : "tarefas"} para adicionar
                  </p>
                  {preview.slice(0, 12).map((t, i) => (
                    <p key={i} className="truncate text-xs text-muted">
                      {t.status === "done" ? "✓" : "○"} {t.title}
                      {t.projectName ? ` · ${t.projectName}` : ""}
                    </p>
                  ))}
                  {preview.length > 12 && (
                    <p className="text-xs text-muted">
                      e mais {preview.length - 12}…
                    </p>
                  )}
                </div>
              )}
              {(error || parseError) && (
                <p role="alert" className="text-xs text-danger">
                  {error || parseError}
                </p>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <FileText className="mr-auto size-4 text-muted" />
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Fechar
          </Button>
          {mode === "import" && canEdit && (
            <Button
              variant="primary"
              disabled={busy || !preview.length || !!parseError}
              onClick={async () => {
                if (await onImport(value)) onClose();
              }}
            >
              {busy
                ? "Importando…"
                : `Importar ${preview.length} ${preview.length === 1 ? "tarefa" : "tarefas"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
export function ProjectDialog({
  project,
  templates,
  busy,
  onSave,
  onDelete,
  onClose,
}: {
  project: TaskProject | null;
  templates: TaskTemplate[];
  busy: boolean;
  onSave: (
    name: string,
    color: TaskColor,
    id?: string,
    templateId?: string,
  ) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [color, setColor] = useState<TaskColor>(project?.color ?? "lavender");
  const [templateId, setTemplateId] = useState("");
  const selectedTemplate = templates.find((t) => t.id === templateId);
  const [error, setError] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        title={project ? "Editar projeto" : "Um lugar para cada projeto"}
        description="Agrupe demandas sem adicionar complexidade."
        className="max-w-md"
      >
        <form
          className="flex min-h-0 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = projectInputSchema.safeParse({ name, color });
            if (!r.success) return setError(r.error.issues[0].message);
            if (
              await onSave(
                r.data.name,
                color,
                project?.id,
                templateId || undefined,
              )
            )
              onClose();
          }}
        >
          <DialogBody>
            <Field label="Nome do projeto" htmlFor="project-name">
              <Input
                id="project-name"
                autoFocus
                value={name}
                maxLength={100}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Redesign do site"
              />
            </Field>
            {!project && templates.length > 0 && (
              <Field label="Modelo de organização" htmlFor="project-template">
                <select
                  id="project-template"
                  disabled={busy}
                  className={selectClass}
                  value={templateId}
                  onChange={(e) => {
                    setTemplateId(e.target.value);
                    const template = templates.find(
                      (t) => t.id === e.target.value,
                    );
                    if (template) setColor(template.color);
                  }}
                >
                  <option value="">Começar do zero</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {selectedTemplate && (
                  <p className="mt-2 text-xs leading-5 text-muted">
                    {selectedTemplate.boards
                      .map(
                        (b) =>
                          `${b.name}: ${b.columns.map((c) => c.name).join(", ")}`,
                      )
                      .join(" · ")}
                  </p>
                )}
              </Field>
            )}
            <Field label="Cor">
              <ColorPicker value={color} onChange={setColor} disabled={busy} />
            </Field>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            {project && (
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  if (
                    window.confirm(
                      "Excluir este projeto? Suas tarefas serão mantidas sem projeto.",
                    ) &&
                    (await onDelete(project.id))
                  )
                    onClose();
                }}
              >
                Excluir projeto
              </Button>
            )}
            <span className="flex-1" />
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
