import { describe, expect, it } from "vitest";
import { changedTaskFields, completedSubtasks, eventSummary, joinLabels, TASK_EVENT_KINDS } from "./task-history";
import { emptyTask } from "./tasks";
import { TASK_EVENT_KINDS as SCHEMA_KINDS } from "@/server/db/schema";

describe("task history", () => {
  it("matches the persisted kinds", () => expect([...TASK_EVENT_KINDS]).toEqual([...SCHEMA_KINDS]));
  it("lists changed fields and folds a column change into the block change", () => {
    const a = emptyTask({ title: "A", subtasks: [{ id: "s", title: "Passo", done: false }] });
    expect(changedTaskFields(a, { ...a, title: "B", dueDate: "2026-10-10", tags: ["x"] })).toEqual(["título", "prazo", "marcadores"]);
    expect(changedTaskFields(a, { ...a, blockId: "b", columnId: "c" })).toEqual(["bloco"]);
    expect(changedTaskFields(a, a)).toEqual([]);
    expect(completedSubtasks(a, { ...a, subtasks: [{ id: "s", title: "Passo", done: true }] })).toEqual(["Passo"]);
  });
  it("summarizes events", () => {
    expect(eventSummary({ kind: "status", fromStatus: "doing", toStatus: "done", body: "" })).toBe("Concluída");
    expect(eventSummary({ kind: "status", fromStatus: "done", toStatus: "todo", body: "" })).toBe("Reaberta em A fazer");
    expect(eventSummary({ kind: "status", fromStatus: "todo", toStatus: "doing", body: "" })).toBe("Moveu de A fazer para Em andamento");
    expect(eventSummary({ kind: "updated", fromStatus: null, toStatus: null, body: "título e prazo" })).toBe("Alterou título e prazo");
    expect(joinLabels(["a", "b", "c"])).toBe("a, b e c");
  });
});
