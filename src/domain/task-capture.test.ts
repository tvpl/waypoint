import { describe, expect, it } from "vitest";
import { parseQuickTask } from "./task-capture";

describe("quick task capture", () => {
  it("extracts standalone marks, quoted people and local relative dates", () => {
    expect(
      parseQuickTask(
        'Revisar proposta #cliente #design @"Ana Silva" @Bruno amanhã !alta',
        { projectId: "site", status: "doing" },
        "2026-12-31",
      ),
    ).toMatchObject({
      title: "Revisar proposta",
      tags: ["cliente", "design"],
      people: ["Ana Silva", "Bruno"],
      dueDate: "2027-01-01",
      priority: "high",
      projectId: "site",
      status: "doing",
    });
  });
  it("preserves prose and invalid dates, and adds pasted Markdown steps", () => {
    const task = parseQuickTask(
      "- [ ] Documentar C# contato@example.com 2026-02-30\n  - [x] Reunir briefing\n  - [ ] Validar\n\n**Contexto** com uma referência",
      {},
      "2026-10-15",
    );
    expect(task.title).toBe("Documentar C# contato@example.com 2026-02-30");
    expect(task.subtasks).toMatchObject([
      { title: "Reunir briefing", done: true },
      { title: "Validar", done: false },
    ]);
    expect(task.description).toBe("**Contexto** com uma referência");
    expect(task.dueDate).toBeNull();
  });
  it("keeps defaults, validates empty titles and handles explicit dates", () => {
    expect(
      parseQuickTask(
        "Revisar hoje #design",
        { tags: ["design"], people: ["Ana"], blockId: "b", columnId: "c" },
        "2026-10-15",
      ),
    ).toMatchObject({
      tags: ["design"],
      people: ["Ana"],
      dueDate: "2026-10-15",
      blockId: "b",
      columnId: "c",
    });
    expect(parseQuickTask("Revisar 2028-02-29 !média").dueDate).toBe(
      "2028-02-29",
    );
    expect(() => parseQuickTask("#tag amanhã")).toThrow();
  });
});
