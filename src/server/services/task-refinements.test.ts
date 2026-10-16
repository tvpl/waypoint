import { beforeAll, describe, expect, it } from "vitest";
import { emptyTask, exportTasksMarkdown } from "@/domain/tasks";
import { defaultColumns } from "@/domain/task-board";
process.env.DATABASE_PATH = ":memory:";
let service: typeof import("./tasks");
let models: typeof import("./task-templates");
const owner = { workspaceId: "ws-a", userId: "owner" },
  viewer = { workspaceId: "ws-a", userId: "viewer" },
  foreign = { workspaceId: "ws-b", userId: "foreign" };
beforeAll(async () => {
  const { getDb, schema } = await import("../db");
  service = await import("./tasks");
  models = await import("./task-templates");
  const db = getDb();
  db.insert(schema.users)
    .values(
      ["owner", "viewer", "foreign"].map((id) => ({
        id,
        name: id,
        email: `${id}@refinements.local`,
        passwordHash: "x",
      })),
    )
    .run();
  db.insert(schema.workspaces)
    .values([
      { id: "ws-a", name: "Equipe" },
      { id: "ws-b", name: "Outra equipe" },
    ])
    .run();
  db.insert(schema.workspaceMembers)
    .values([
      { workspaceId: "ws-a", userId: "owner", role: "owner" },
      { workspaceId: "ws-a", userId: "viewer", role: "viewer" },
      { workspaceId: "ws-b", userId: "foreign", role: "owner" },
    ])
    .run();
});
const exportTask = (task: Parameters<typeof exportTasksMarkdown>[0][number]) =>
  exportTasksMarkdown(
    [task],
    service.listTaskProjects(owner),
    service.listTaskBoards(owner),
  );

describe("project organization templates", () => {
  it("copies layouts and capacity without tasks, checks scope and keeps copies independent", () => {
    const projectId = service.saveTaskProject(owner, {
      name: "Origem",
      color: "mint",
    });
    const columns = defaultColumns().map((c) => ({
      ...c,
      name: `Etapa ${c.name}`,
      limit: c.status === "doing" ? 2 : null,
    }));
    service.saveTaskBoard(owner, {
      projectId,
      name: "Entrega",
      isDefault: true,
      columns,
    });
    service.saveTaskBoard(owner, {
      projectId,
      name: "Retornos",
      columns: [
        { id: "client", name: "Com o cliente", status: "waiting", limit: 3 },
      ],
    });
    service.createTask(owner, { title: "Não copiar conteúdo", projectId });
    const id = models.saveProjectTemplate(owner, projectId, "Lançamento"),
      model = models.listTaskTemplates(viewer).find((m) => m.id === id)!;
    expect(model.boards).toHaveLength(2);
    expect(model.boards.every((b) => b.projectId === null)).toBe(true);
    for (const actor of [viewer, { ...owner, userId: "foreign" }]) {
      expect(() =>
        models.saveProjectTemplate(actor, projectId, "Falha"),
      ).toThrow(/permissão/);
      expect(() =>
        models.createProjectFromTemplate(actor, { name: "Falha" }, id),
      ).toThrow(/permissão/);
      expect(() => models.deleteTaskTemplate(actor, id, 1)).toThrow(
        /permissão/,
      );
    }
    expect(() =>
      models.createProjectFromTemplate(foreign, { name: "Privado" }, id),
    ).toThrow(/Modelo/);
    expect(() =>
      models.saveProjectTemplate(owner, "projeto-inexistente", "Sem acesso"),
    ).toThrow(/Projeto/);
    const copy = models.createProjectFromTemplate(
      owner,
      { name: "Cópia", color: model.color },
      id,
    );
    const boards = service
      .listTaskBoards(owner)
      .filter((b) => b.projectId === copy);
    expect(boards).toHaveLength(2);
    expect(
      service.listTasks(owner).filter((t) => t.projectId === copy),
    ).toHaveLength(0);
    expect(
      boards.find((b) => b.isDefault)?.columns.find((c) => c.status === "doing")
        ?.limit,
    ).toBe(2);
    expect(boards[0].columns[0].id).not.toBe(model.boards[0].columns[0].id);
    service.saveTaskBoard(
      owner,
      { ...boards[0], name: "Nome independente" },
      boards[0].id,
      boards[0].version,
    );
    expect(
      models.listTaskTemplates(owner).find((m) => m.id === id)?.boards[0].name,
    ).toBe("Entrega");
    expect(() =>
      models.saveProjectTemplate(owner, projectId, "Lançamento"),
    ).toThrow(/Já existe/);
    models.deleteTaskTemplate(owner, id, 1);
    expect(
      service.listTaskBoards(owner).filter((b) => b.projectId === copy),
    ).toHaveLength(2);
  });
});
describe("dependencies and follow-up", () => {
  it("rejects unavailable, repeated, self and cyclic dependencies without partial writes", () => {
    const a = service.createTask(owner, {
      title: "Briefing",
      followUpDate: "2026-10-19",
    });
    const b = service.createTask(owner, {
      title: "Proposta",
      dependsOn: [a.id],
    });
    const hidden = service.createTask(foreign, { title: "Confidencial" });
    expect(() =>
      service.updateTask(owner, a.id, 1, { dependsOn: [hidden.id] }),
    ).toThrow(/workspace/);
    expect(() =>
      service.updateTask(owner, a.id, 1, { dependsOn: [a.id] }),
    ).toThrow(/ciclo/);
    expect(() =>
      service.updateTask(owner, a.id, 1, { dependsOn: [b.id] }),
    ).toThrow(/ciclo/);
    expect(() =>
      service.updateTask(owner, a.id, 1, { dependsOn: [b.id, b.id] }),
    ).toThrow(/duplicadas/);
    expect(service.listTasks(owner).find((t) => t.id === a.id)).toMatchObject({
      version: 1,
      dependsOn: [],
      followUpDate: "2026-10-19",
    });
    expect(
      service.updateTask(owner, b.id, 1, { status: "done" }).dependsOn,
    ).toEqual([a.id]);
  });
  it("remaps copied dependency references to the copied records", () => {
    const a = service.createTask(owner, { title: "Copiar briefing" });
    const b = service.createTask(owner, {
      title: "Copiar proposta",
      dependsOn: [a.id],
    });
    const text = exportTasksMarkdown([a, b], [], [], [a, b]);
    service.importTasks(foreign, text);
    const copies = service.listTasks(foreign),
      copiedA = copies.find((t) => t.title === a.title)!,
      copiedB = copies.find((t) => t.title === b.title)!;
    expect(copiedB.dependsOn).toEqual([copiedA.id]);
    expect(copiedA.id).not.toBe(a.id);
    const count = copies.length;
    expect(() => service.importTasks(foreign, exportTask(b))).toThrow(
      /workspace/,
    );
    expect(service.listTasks(foreign)).toHaveLength(count);
  });
});
describe("Markdown review and controlled update", () => {
  it("compares fields, preserves task/subtask identity and applies only selected rows", () => {
    const a = service.createTask(owner, {
      title: "Validar escopo",
      dueDate: "2026-10-20",
      subtasks: [{ id: "briefing", title: "Revisar briefing", done: false }],
    });
    const b = service.createTask(owner, { title: "Validar valores" });
    const text = exportTasksMarkdown([a, b], [])
      .replace("Validar escopo", "Revisar escopo")
      .replace("2026-10-20", "2026-10-22")
      .replace("- [ ] Revisar briefing", "- [x] Revisar briefing")
      .replace("Validar valores", "Revisar valores");
    const before = service.listTasks(owner).length;
    const preview = service.previewTaskUpdates(owner, text);
    expect(preview.rows.map((r) => r.kind)).toEqual(["update", "update"]);
    expect(preview.rows[0].changes.map((c) => c.field)).toEqual(
      expect.arrayContaining(["Título", "Meta de conclusão", "Subtarefas"]),
    );
    expect(service.applyTaskUpdates(owner, text, preview.token, [0])).toBe(1);
    const after = service.listTasks(owner);
    expect(after).toHaveLength(before);
    expect(after.find((t) => t.id === a.id)).toMatchObject({
      title: "Revisar escopo",
      version: 2,
      dueDate: "2026-10-22",
      subtasks: [{ id: "briefing", done: true }],
    });
    expect(after.find((t) => t.id === b.id)?.title).toBe("Validar valores");
    expect(
      service.previewTaskUpdates(
        owner,
        exportTask(after.find((t) => t.id === a.id)!),
      ).rows[0].kind,
    ).toBe("unchanged");
  });
  it("rejects stale exports/previews, invalid selection and foreign references", () => {
    const task = service.createTask(owner, { title: "Atualização controlada" });
    const text = exportTask(task).replace(
      "Atualização controlada",
      "Título revisado",
    );
    const preview = service.previewTaskUpdates(owner, text);
    service.updateTask(owner, task.id, 1, { people: ["Ana"] });
    expect(() =>
      service.applyTaskUpdates(owner, text, preview.token, [0]),
    ).toThrow(/prévia mudou/);
    expect(service.previewTaskUpdates(owner, text).rows[0]).toMatchObject({
      kind: "conflict",
      message: expect.stringMatching(/mudou/),
    });
    const hidden = service.createTask(foreign, {
      title: "Segredo que não pode vazar",
    });
    const hacked = text.replace(task.id, hidden.id);
    const unavailable = service.previewTaskUpdates(owner, hacked);
    expect(unavailable.rows[0].kind).toBe("conflict");
    expect(JSON.stringify(unavailable)).not.toContain(hidden.title);
    expect(() =>
      service.applyTaskUpdates(owner, hacked, unavailable.token, [0]),
    ).toThrow(/válidas/);
    expect(() => service.previewTaskUpdates(viewer, text)).toThrow(/permissão/);
    expect(() =>
      service.applyTaskUpdates(viewer, text, preview.token, [0]),
    ).toThrow(/permissão/);
    expect(() => service.previewTaskUpdates(owner, `${text}\n${text}`)).toThrow(
      /duplicadas/,
    );
    const plain = service.previewTaskUpdates(
      owner,
      "- [ ] Tarefa sem referência",
    );
    expect(plain.rows[0].kind).toBe("conflict");
  });
  it("checks the selected dependency graph atomically", () => {
    const a = service.createTask(owner, { title: "Ciclo A" }),
      b = service.createTask(owner, { title: "Ciclo B" });
    const text = exportTasksMarkdown(
      [
        { ...a, dependsOn: [b.id] },
        { ...b, dependsOn: [a.id] },
      ],
      [],
    );
    const preview = service.previewTaskUpdates(owner, text);
    expect(() =>
      service.applyTaskUpdates(owner, text, preview.token, [0, 1]),
    ).toThrow(/ciclo/);
    expect(service.listTasks(owner).find((t) => t.id === a.id)?.version).toBe(
      1,
    );
    expect(service.applyTaskUpdates(owner, text, preview.token, [0])).toBe(1);
  });
  it("moves a completed checkbox to the matching column and preserves the rest of the task", () => {
    const projectId = service.saveTaskProject(owner, {
      name: "Markdown em etapas",
    });
    const boardId = service.saveTaskBoard(owner, {
      name: "Fluxo",
      projectId,
      isDefault: true,
      columns: defaultColumns(),
    });
    const task = service.createTask(owner, {
      title: "Concluir com IA",
      projectId,
      blockId: boardId,
      columnId: "doing",
      followUpDate: "2026-10-20",
    });
    const text = exportTask(task).replace("- [ ] Concluir", "- [x] Concluir");
    const preview = service.previewTaskUpdates(owner, text);
    expect(preview.rows[0].kind).toBe("update");
    service.applyTaskUpdates(owner, text, preview.token, [0]);
    expect(
      service.listTasks(owner).find((t) => t.id === task.id),
    ).toMatchObject({
      status: "done",
      columnId: "done",
      blockId: boardId,
      followUpDate: "2026-10-20",
    });
  });
});

it("does not invalidate a review when an unrelated task changes", () => {
  const task = service.createTask(owner, { title: "Revisão isolada" });
  const unrelated = service.createTask(owner, { title: "Outra demanda" });
  const text = exportTask(task).replace("Revisão isolada", "Revisão concluída");
  const preview = service.previewTaskUpdates(owner, text);
  service.updateTask(owner, unrelated.id, unrelated.version, {
    title: "Outra demanda alterada",
  });
  expect(service.applyTaskUpdates(owner, text, preview.token, [0])).toBe(1);
  expect(
    service.listTasks(owner).find((t) => t.id === unrelated.id)?.title,
  ).toBe("Outra demanda alterada");
});

it("keeps new Markdown subtask references stable between preview and apply", () => {
  const task = service.createTask(owner, { title: "Adicionar passos com IA" });
  const text = exportTask(task).replace(
    "Adicionar passos com IA",
    "Adicionar passos com IA\n  - [ ] Primeiro passo\n  - [x] Segundo passo",
  );
  const preview = service.previewTaskUpdates(owner, text);
  expect(service.previewTaskUpdates(owner, text).token).toBe(preview.token);
  service.applyTaskUpdates(owner, text, preview.token, [0]);
  const updated = service.listTasks(owner).find((t) => t.id === task.id)!;
  expect(updated.subtasks).toMatchObject([
    { title: "Primeiro passo", done: false },
    { title: "Segundo passo", done: true },
  ]);
  expect(new Set(updated.subtasks.map((s) => s.id)).size).toBe(2);
});
