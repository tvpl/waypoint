import { beforeAll, describe, expect, it } from "vitest";
process.env.DATABASE_PATH = ":memory:";
let t: typeof import("./tasks");
const owner = { workspaceId: "ws1", userId: "owner" };
const editor = { workspaceId: "ws1", userId: "editor" };
const viewer = { workspaceId: "ws1", userId: "viewer" };
const outsider = { workspaceId: "ws1", userId: "outsider" };
beforeAll(async () => {
  const { getDb, schema } = await import("../db");
  t = await import("./tasks");
  const db = getDb();
  db.insert(schema.users)
    .values(
      ["owner", "editor", "viewer", "outsider"].map((id) => ({
        id,
        name: id,
        email: `${id}@test.local`,
        passwordHash: "x",
      })),
    )
    .run();
  db.insert(schema.workspaces)
    .values([
      { id: "ws1", name: "Equipe" },
      { id: "ws2", name: "Outra equipe" },
    ])
    .run();
  db.insert(schema.workspaceMembers)
    .values([
      { workspaceId: "ws1", userId: "owner", role: "owner" },
      { workspaceId: "ws1", userId: "editor", role: "editor" },
      { workspaceId: "ws1", userId: "viewer", role: "viewer" },
      { workspaceId: "ws2", userId: "outsider", role: "owner" },
    ])
    .run();
});
describe("tasks — access and persistence", () => {
  it("checks membership and edit role on all entry points", () => {
    const task = t.createTask(owner, { title: "Plano" });
    expect(t.listTasks(viewer).some((r) => r.id === task.id)).toBe(true);
    for (const actor of [viewer, outsider]) {
      expect(() => t.createTask(actor, { title: "X" })).toThrow(/permissão/);
      expect(() =>
        t.updateTask(actor, task.id, task.version, { title: "X" }),
      ).toThrow(/permissão/);
      expect(() =>
        t.moveTask(actor, task.id, task.version, "done", null),
      ).toThrow(/permissão/);
      expect(() => t.archiveTask(actor, task.id, task.version, true)).toThrow(
        /permissão/,
      );
      expect(() => t.saveTaskProject(actor, { name: "X" })).toThrow(
        /permissão/,
      );
      expect(() => t.deleteTaskProject(actor, "x")).toThrow(/permissão/);
      expect(() => t.importTasks(actor, "- [ ] X")).toThrow(/permissão/);
    }
    expect(() => t.listTasks(outsider)).toThrow(/permissão/);
    expect(() => t.listTaskProjects(outsider)).toThrow(/permissão/);
  });
  it("rejects foreign task, project and reorder target IDs", () => {
    const other = { workspaceId: "ws2", userId: "outsider" };
    const foreignTask = t.createTask(other, { title: "Privado" });
    const foreignProject = t.saveTaskProject(other, { name: "Privado" });
    expect(() =>
      t.updateTask(owner, foreignTask.id, 1, { title: "Hacked" }),
    ).toThrow(/encontrada/);
    expect(() =>
      t.createTask(owner, { title: "X", projectId: foreignProject }),
    ).toThrow(/Projeto/);
    expect(() => t.deleteTaskProject(owner, foreignProject)).toThrow(/Projeto/);
    const own = t.createTask(owner, { title: "Own" });
    expect(() => t.moveTask(owner, own.id, 1, "todo", foreignTask.id)).toThrow(
      /encontrada/,
    );
  });
  it("persists full details, patches only supplied fields and prevents stale writes", () => {
    const task = t.createTask(owner, {
      title: "Original",
      color: "rose",
      people: ["Ana"],
      tags: ["briefing"],
      subtasks: [{ id: "s1", title: "Revisar", done: false }],
    });
    const updated = t.updateTask(editor, task.id, task.version, {
      status: "done",
    });
    expect(updated).toMatchObject({
      title: "Original",
      color: "rose",
      people: ["Ana"],
      tags: ["briefing"],
      status: "done",
      version: 2,
    });
    expect(updated.subtasks).toHaveLength(1);
    expect(updated.completedAt).not.toBeNull();
    expect(() => t.updateTask(owner, task.id, 1, { title: "Stale" })).toThrow(
      /mudou/,
    );
    expect(
      t.updateTask(owner, task.id, 2, { status: "todo" }).completedAt,
    ).toBeNull();
  });
  it("keeps FTS in sync when editing, archiving, restoring and changing projects", async () => {
    const { searchIndex } = await import("./search");
    const project = t.saveTaskProject(owner, { name: "ProjetoAbacaxi" });
    const task = t.createTask(owner, {
      title: "BuscaUnica",
      projectId: project,
      pendingNote: "PendenciaUnica",
      people: ["PessoaUnica"],
    });
    for (const q of [
      "BuscaUnica",
      "PendenciaUnica",
      "PessoaUnica",
      "ProjetoAbacaxi",
    ])
      expect(searchIndex("ws1", q).some((h) => h.id === task.id)).toBe(true);
    t.archiveTask(owner, task.id, 1, true);
    expect(searchIndex("ws1", "BuscaUnica")).toHaveLength(0);
    t.archiveTask(owner, task.id, 2, false);
    expect(searchIndex("ws1", "BuscaUnica")).toHaveLength(1);
    t.saveTaskProject(owner, { name: "ProjetoManga" }, project);
    expect(searchIndex("ws1", "ProjetoAbacaxi")).toHaveLength(0);
    expect(searchIndex("ws1", "ProjetoManga")).toHaveLength(1);
    t.deleteTaskProject(owner, project);
    expect(t.listTasks(owner).find((r) => r.id === task.id)).toMatchObject({
      projectId: null,
      version: 4,
    });
    expect(searchIndex("ws1", "ProjetoManga")).toHaveLength(0);
  });
  it("moves tasks atomically and rejects stale drags", () => {
    const a = t.createTask(owner, { title: "A", status: "waiting" });
    const b = t.createTask(owner, { title: "B", status: "waiting" });
    t.moveTask(owner, b.id, 1, "waiting", a.id);
    const waiting = t.listTasks(owner).filter((r) => r.status === "waiting");
    expect(waiting.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(() => t.moveTask(owner, b.id, 1, "done", null)).toThrow(/mudou/);
    expect(() => t.moveTask(owner, a.id, 1, "done", b.id)).toThrow(/Destino/);
    t.moveTask(owner, b.id, 2, "done", null);
    expect(
      t.listTasks(owner).find((r) => r.id === b.id)?.completedAt,
    ).not.toBeNull();
  });
  it("imports projects and nested tasks, validates before inserting, and preserves existing data", () => {
    const count = t.listTasks(owner).length;
    expect(() =>
      t.importTasks(
        owner,
        '- [ ] Valid\n- [ ] Invalid\n  <!-- waypoint {"dueDate":"not-a-date"} -->',
      ),
    ).toThrow();
    expect(t.listTasks(owner)).toHaveLength(count);
    expect(
      t.importTasks(
        owner,
        "## Novo projeto\n- [ ] Planejar\n  - [x] Briefing\n- [x] Iniciar",
      ),
    ).toBe(2);
    const project = t
      .listTaskProjects(owner)
      .find((p) => p.name === "Novo projeto")!;
    expect(
      t.listTasks(owner).filter((r) => r.projectId === project.id),
    ).toHaveLength(2);
    expect(
      t.listTasks(owner).find((r) => r.title === "Planejar")?.subtasks[0].done,
    ).toBe(true);
  });
});

describe("tasks — batch organization", () => {
  it("updates selected tasks together and preserves their unrelated details", async () => {
    const a = t.createTask(owner, {
      title: "Selecionada A",
      color: "mint",
      tags: ["lote"],
    });
    const b = t.createTask(owner, {
      title: "Selecionada B",
      status: "waiting",
      people: ["Ana"],
    });
    const project = t.saveTaskProject(owner, { name: "Projeto em lote" });
    expect(
      t.changeTasks(
        editor,
        [
          { id: a.id, version: 1 },
          { id: b.id, version: 1 },
        ],
        { type: "project", value: project },
      ),
    ).toBe(2);
    t.changeTasks(
      owner,
      [
        { id: a.id, version: 2 },
        { id: b.id, version: 2 },
      ],
      { type: "status", value: "done" },
    );
    const rows = t.listTasks(owner);
    expect(rows.find((r) => r.id === a.id)).toMatchObject({
      projectId: project,
      status: "done",
      version: 3,
      color: "mint",
      tags: ["lote"],
    });
    expect(rows.find((r) => r.id === b.id)).toMatchObject({
      status: "done",
      people: ["Ana"],
    });
    t.changeTasks(
      owner,
      [
        { id: a.id, version: 3 },
        { id: b.id, version: 3 },
      ],
      { type: "archive", value: true },
    );
    const { searchIndex } = await import("./search");
    expect(searchIndex("ws1", "Selecionada")).toHaveLength(0);
    t.changeTasks(
      owner,
      [
        { id: a.id, version: 4 },
        { id: b.id, version: 4 },
      ],
      { type: "archive", value: false },
    );
    expect(searchIndex("ws1", "Selecionada")).toHaveLength(2);
  });
  it("rejects stale, foreign, duplicate or unauthorized selections without partial writes", () => {
    const a = t.createTask(owner, { title: "Sem alteração" });
    const b = t.createTask(owner, { title: "Alterada por outra pessoa" });
    t.updateTask(editor, b.id, 1, { title: "Mais recente" });
    expect(() =>
      t.changeTasks(
        owner,
        [
          { id: a.id, version: 1 },
          { id: b.id, version: 1 },
        ],
        { type: "status", value: "done" },
      ),
    ).toThrow(/mudou/);
    expect(t.listTasks(owner).find((r) => r.id === a.id)).toMatchObject({
      version: 1,
      status: "todo",
    });
    const foreign = t.createTask(
      { workspaceId: "ws2", userId: "outsider" },
      { title: "Outro workspace" },
    );
    expect(() =>
      t.changeTasks(
        owner,
        [
          { id: a.id, version: 1 },
          { id: foreign.id, version: 1 },
        ],
        { type: "archive", value: true },
      ),
    ).toThrow(/encontrada/);
    expect(() =>
      t.changeTasks(viewer, [{ id: a.id, version: 1 }], {
        type: "status",
        value: "done",
      }),
    ).toThrow(/permissão/);
    expect(() =>
      t.changeTasks(
        owner,
        [
          { id: a.id, version: 1 },
          { id: a.id, version: 1 },
        ],
        { type: "due", value: null },
      ),
    ).toThrow(/duplicadas/);
    expect(() =>
      t.changeTasks(owner, [{ id: a.id, version: 1 }], {
        type: "due",
        value: "2026-02-30",
      }),
    ).toThrow();
    expect(t.listTasks(owner).find((r) => r.id === a.id)).toMatchObject({
      version: 1,
      archivedAt: null,
    });
  });
});

describe("custom task boards", () => {
  it("checks access, scope, stale configuration and safe column removal", () => {
    const { defaultColumns } = requireBoardFixtures();
    for (const actor of [viewer, outsider]) {
      expect(() =>
        t.saveTaskBoard(actor, {
          name: "Privado",
          projectId: null,
          columns: defaultColumns(),
        }),
      ).toThrow(/permissão/);
    }
    expect(() => t.listTaskBoards(outsider)).toThrow(/permissão/);
    const projectId = t.saveTaskProject(owner, { name: "Colunas próprias" });
    const columns = defaultColumns();
    columns[1].name = "Em produção";
    const boardId = t.saveTaskBoard(owner, {
      name: "Lançamento",
      projectId,
      columns,
    });
    const task = t.createTask(owner, {
      title: "Criar no bloco",
      projectId,
      blockId: boardId,
      columnId: "doing",
    });
    expect(task.status).toBe("doing");
    expect(
      t.listTaskBoards(viewer).find((b) => b.id === boardId)?.columns[1].name,
    ).toBe("Em produção");
    expect(() =>
      t.createTask(owner, {
        title: "Projeto errado",
        blockId: boardId,
        columnId: "doing",
      }),
    ).toThrow(/Bloco/);
    expect(() =>
      t.createTask(owner, {
        title: "Coluna errada",
        projectId,
        blockId: boardId,
        columnId: "missing",
      }),
    ).toThrow(/Coluna/);
    expect(() =>
      t.saveTaskBoard(owner, { name: "Mudou", projectId, columns }, boardId, 0),
    ).toThrow(/mudou/);
    expect(() =>
      t.saveTaskBoard(
        owner,
        {
          name: "Sem coluna",
          projectId,
          columns: columns.filter((c) => c.id !== "doing"),
        },
        boardId,
        1,
      ),
    ).toThrow(/Mova/);
    const moved = t.updateTask(owner, task.id, 1, { status: "done" });
    expect(moved).toMatchObject({
      columnId: "done",
      blockId: boardId,
      status: "done",
    });
    const unassigned = t.updateTask(owner, moved.id, 2, { projectId: null });
    expect(unassigned).toMatchObject({
      blockId: null,
      columnId: null,
      projectId: null,
    });
  });
  it("isolates foreign boards and reorder targets, and preserves legacy tasks when naming the main block", () => {
    const { defaultColumns } = requireBoardFixtures();
    const other = { workspaceId: "ws2", userId: "outsider" };
    const foreign = t.saveTaskBoard(other, {
      name: "Segredo",
      projectId: null,
      columns: defaultColumns(),
    });
    expect(() =>
      t.createTask(owner, { title: "X", blockId: foreign, columnId: "todo" }),
    ).toThrow(/Bloco/);
    expect(() =>
      t.saveTaskBoard(
        owner,
        { name: "X", projectId: null, columns: defaultColumns() },
        foreign,
        1,
      ),
    ).toThrow(/encontrado/);
    const projectId = t.saveTaskProject(owner, { name: "Legado" });
    const legacy = t.createTask(owner, {
      title: "Tarefa anterior",
      projectId,
      status: "doing",
    });
    const columns = defaultColumns().map((c) => ({
      ...c,
      name: `Etapa ${c.name}`,
    }));
    const mainId = t.saveTaskBoard(owner, {
      name: "Principal",
      projectId,
      isDefault: true,
      columns,
    });
    expect(t.listTasks(owner).find((r) => r.id === legacy.id)).toMatchObject({
      blockId: null,
      status: "doing",
    });
    expect(() =>
      t.saveTaskBoard(owner, {
        name: "Duplicado",
        projectId,
        isDefault: true,
        columns,
      }),
    ).toThrow(/mudou/);
    const extraId = t.saveTaskBoard(owner, {
      name: "Retornos",
      projectId,
      columns: [{ id: "approval", name: "Com o cliente", status: "waiting" }],
    });
    t.moveTask(owner, legacy.id, legacy.version, "waiting", null, {
      projectId,
      blockId: extraId,
      columnId: "approval",
      status: "waiting",
    });
    const placed = t.listTasks(owner).find((r) => r.id === legacy.id)!;
    expect(placed).toMatchObject({
      blockId: extraId,
      columnId: "approval",
      status: "waiting",
    });
    const separate = t.createTask(owner, {
      title: "Outro bloco",
      projectId,
      blockId: mainId,
      columnId: "waiting",
    });
    expect(() =>
      t.moveTask(owner, placed.id, placed.version, "waiting", separate.id, {
        projectId,
        blockId: extraId,
        columnId: "approval",
        status: "waiting",
      }),
    ).toThrow(/Destino/);
    const complete = t.updateTask(owner, placed.id, placed.version, {
      status: "done",
    });
    expect(complete).toMatchObject({
      status: "done",
      blockId: null,
      columnId: null,
    });
  });
  it("round trips block names, columns and pending kinds through Markdown across workspaces", async () => {
    const { exportTasksMarkdown } = await import("@/domain/tasks");
    const projectId = t.saveTaskProject(owner, { name: "Portável" });
    const boardId = t.saveTaskBoard(owner, {
      name: "Retornos portáveis",
      projectId,
      columns: [{ id: "client", name: "Com o cliente", status: "waiting" }],
    });
    const task = t.createTask(owner, {
      title: "Confirmar direção",
      projectId,
      blockId: boardId,
      columnId: "client",
      pendingKind: "decision",
      pendingNote: "Escolher alternativa",
    });
    const markdown = exportTasksMarkdown(
      [task],
      t.listTaskProjects(owner),
      t.listTaskBoards(owner),
    );
    expect(markdown).not.toContain(boardId);
    const other = { workspaceId: "ws2", userId: "outsider" };
    t.importTasks(other, markdown);
    const imported = t.listTasks(other).find((r) => r.title === task.title)!;
    const block = t
      .listTaskBoards(other)
      .find((b) => b.id === imported.blockId)!;
    expect(block.name).toBe("Retornos portáveis");
    expect(block.columns.find((c) => c.id === imported.columnId)?.name).toBe(
      "Com o cliente",
    );
    expect(imported.pendingKind).toBe("decision");
    expect(imported.blockId).not.toBe(boardId);
    t.deleteTaskProject(other, imported.projectId!);
    expect(t.listTasks(other).find((r) => r.id === imported.id)).toMatchObject({
      projectId: null,
      blockId: null,
      columnId: null,
    });
  });
});
function requireBoardFixtures() {
  return {
    defaultColumns: () => [
      { id: "todo", name: "A fazer", status: "todo" as const },
      { id: "doing", name: "Em andamento", status: "doing" as const },
      { id: "waiting", name: "Aguardando", status: "waiting" as const },
      { id: "done", name: "Concluído", status: "done" as const },
    ],
  };
}

it("moves and orders in the unified board without changing project ownership", () => {
  const { defaultColumns } = requireBoardFixtures();
  const aProject = t.saveTaskProject(owner, { name: "Board unificado A" });
  const bProject = t.saveTaskProject(owner, { name: "Board unificado B" });
  const main = t.saveTaskBoard(owner, {
    name: "Etapas do A",
    projectId: aProject,
    isDefault: true,
    columns: defaultColumns(),
  });
  const a = t.createTask(owner, {
    title: "Avançar A",
    projectId: aProject,
    blockId: main,
    columnId: "doing",
  });
  const b = t.createTask(owner, {
    title: "Avançar B",
    projectId: bProject,
    status: "waiting",
  });
  t.moveTask(owner, a.id, a.version, "waiting", b.id, {
    aggregate: true,
    projectId: null,
    blockId: null,
    columnId: null,
    status: "waiting",
  });
  const rows = t.listTasks(owner);
  expect(rows.find((task) => task.id === a.id)).toMatchObject({
    projectId: aProject,
    blockId: main,
    columnId: "waiting",
    status: "waiting",
  });
  expect(rows.find((task) => task.id === b.id)).toMatchObject({
    projectId: bProject,
    blockId: null,
    columnId: null,
    status: "waiting",
  });
  expect(rows.find((task) => task.id === a.id)!.sortOrder).toBeLessThan(
    rows.find((task) => task.id === b.id)!.sortOrder,
  );
});
