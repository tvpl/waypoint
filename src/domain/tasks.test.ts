import { describe, expect, it } from "vitest";
import {
  emptyTask,
  exportTasksMarkdown,
  parseTasksMarkdown,
  taskInputSchema,
} from "./tasks";

describe("task Markdown", () => {
  it("round trips optional organization and multiline Markdown without confusing note checklists with subtasks", () => {
    const task = emptyTask({
      title: "Validar proposta",
      status: "waiting",
      projectId: "project1",
      description:
        "## Contexto\n**Revisar** [link](https://example.com)\n- [ ] checklist no contexto\n```ts\nif (true) {\n  const a = 1;\n}\n```",
      pendingNote: "Aguardando Ana --> <script>",
      people: ["Ana Silva", "Bruno"],
      tags: ["cliente"],
      color: "mint",
      dueDate: "2026-10-20",
      priority: "high",
      subtasks: [
        { id: "a", title: "Alinhar escopo", done: true },
        { id: "b", title: "Enviar", done: false },
      ],
    });
    const taskWithMetadata = {
      ...task,
      id: "internal-id",
      version: 42,
      archivedAt: 123,
    };
    const text = exportTasksMarkdown(
      [taskWithMetadata],
      [{ id: "project1", name: "Site", color: "mint" }],
    );
    expect(text).not.toContain("<script>");
    expect(text).toContain('"ref":{"id":"internal-id","version":42}');
    expect(text).not.toContain("archivedAt");
    const parsed = parseTasksMarkdown(text)[0];
    expect(parsed).toMatchObject({
      ...task,
      projectId: null,
      projectName: "Site",
      projectColor: "mint",
      subtasks: task.subtasks.map(({ title, done }) => ({ title, done })),
    });
  });
  it("reads plain AI checklists with project headings and nested steps", () => {
    const tasks = parseTasksMarkdown(
      "# Plano\n## Site\n- [ ] Preparar **proposta**\n  Contexto adicional\n  - [x] Reunir briefing\n  - [ ] Estimar esforço\n- [X] Aprovar\n## App\n* [ ] Implementar\n",
    );
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toMatchObject({
      projectName: "Site",
      description: "Contexto adicional",
      subtasks: [{ done: true }, { done: false }],
    });
    expect(tasks[1].status).toBe("done");
    expect(tasks[2].projectName).toBe("App");
  });
  it("lets an edited checkbox reopen a completed exported task", () => {
    const text = exportTasksMarkdown(
      [emptyTask({ title: "Teste", status: "done" })],
      [],
    ).replace("- [x]", "- [ ]");
    expect(parseTasksMarkdown(text)[0].status).toBe("todo");
  });
  it("does not parse code samples as tasks", () => {
    const result = parseTasksMarkdown(
      "- [ ] Documentar\n  ```md\n- [ ] Exemplo\n  ```\n- [ ] Entregar",
    );
    expect(result).toHaveLength(2);
    expect(result[0].description).toContain("- [ ] Exemplo");
  });
  it("rejects malformed metadata, empty input, invalid dates and oversized imports", () => {
    expect(() =>
      parseTasksMarkdown("- [ ] X\n  <!-- waypoint {oops} -->"),
    ).toThrow(/Metadados/);
    expect(() => parseTasksMarkdown("Apenas um texto")).toThrow(
      /Nenhuma tarefa/,
    );
    expect(() =>
      parseTasksMarkdown(
        Array.from({ length: 201 }, (_, i) => `- [ ] ${i}`).join("\n"),
      ),
    ).toThrow(/200/);
    expect(
      taskInputSchema.safeParse({ title: "Prazo", dueDate: "2026-02-30" })
        .success,
    ).toBe(false);
    expect(taskInputSchema.safeParse({ title: "\n" }).success).toBe(false);
  });
});
