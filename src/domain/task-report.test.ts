import { describe, expect, it } from "vitest";
import { buildTaskReport, formatDuration, periodRange } from "./task-report";
import { emptyTask, type Task } from "./tasks";
import type { TaskEvent } from "./task-history";

const DAY = 86_400_000;
const at = (iso: string) => new Date(iso).valueOf();
function task(id: string, patch: Partial<Task>): Task {
  return {
    ...emptyTask({ title: id }),
    id,
    version: 1,
    sortOrder: 0,
    completedAt: null,
    archivedAt: null,
    updatedAt: at("2026-10-10T12:00:00Z"),
    createdAt: at("2026-10-01T12:00:00Z"),
    ...patch,
  };
}
const projects = [
  { id: "p1", name: "Site", color: "mint" as const },
  { id: "p2", name: "App", color: "sky" as const },
];
const base = { from: at("2026-10-01T00:00:00Z"), to: at("2026-11-01T00:00:00Z"), periodLabel: "Outubro", projectIds: null, timeZone: "UTC" };

describe("buildTaskReport", () => {
  const tasks = [
    task("Publicar landing", { projectId: "p1", status: "done", completedAt: at("2026-10-05T15:00:00Z"), dueDate: "2026-10-06", tags: ["web"], description: "Nova home\ncom vídeo" }),
    task("Login social", { projectId: "p2", status: "done", completedAt: at("2026-10-12T10:00:00Z"), dueDate: "2026-10-10" }),
    task("Antiga", { projectId: "p1", status: "done", completedAt: at("2026-09-20T10:00:00Z") }),
    task("Arquivada", { status: "done", completedAt: at("2026-10-07T10:00:00Z"), archivedAt: at("2026-10-08T10:00:00Z") }),
    task("Em curso", { projectId: "p1", status: "doing" }),
  ];
  const events = new Map<string, TaskEvent[]>([
    [
      "Publicar landing",
      [
        { id: "e1", taskId: "Publicar landing", kind: "created", fromStatus: null, toStatus: "todo", body: "", userId: "u", userName: "Ana", createdAt: at("2026-10-01T12:00:00Z") },
        { id: "e2", taskId: "Publicar landing", kind: "note", fromStatus: null, toStatus: null, body: "Cliente aprovou", userId: "u", userName: "Ana", createdAt: at("2026-10-04T12:00:00Z") },
        { id: "e3", taskId: "Publicar landing", kind: "status", fromStatus: "doing", toStatus: "done", body: "", userId: "u", userName: "Ana", createdAt: at("2026-10-05T15:00:00Z") },
      ],
    ],
  ]);

  it("lists completed tasks of the period grouped by project with summary, notes and history", () => {
    const r = buildTaskReport({ tasks, projects, events, options: base, workspaceName: "Equipe", now: at("2026-10-18T12:00:00Z") });
    expect(r.completed).toBe(3);
    expect(r.markdown).toContain("# Relatório de entregas · Equipe");
    expect(r.markdown).toContain("**3 tarefas concluídas** em 3 projetos");
    expect(r.markdown).toContain("No prazo: 1 de 2 com prazo definido");
    expect(r.markdown).toMatch(/## App · 1 concluída[\s\S]*## Site · 1 concluída[\s\S]*## Sem projeto/);
    expect(r.markdown).not.toContain("Antiga");
    expect(r.markdown).toContain("(no prazo)");
    expect(r.markdown).toContain("(após o prazo)");
    expect(r.markdown).toContain("> Nova home\n> com vídeo");
    expect(r.markdown).toMatch(/\*\*Observações\*\*\n\n- .*Ana: Cliente aprovou/);
    expect(r.markdown).toMatch(/\*\*Histórico\*\*\n\n- .* — Criada \(Ana\)\n- .* — Concluída \(Ana\)/);
    expect(r.markdown).toContain("## Linha do tempo");
    expect(r.markdown).not.toContain("## Em andamento");
  });

  it("filters projects, archived tasks and optional sections", () => {
    const r = buildTaskReport({
      tasks,
      projects,
      events,
      options: { ...base, projectIds: ["p1", "none"], includeArchived: false, includeOpen: true, notes: false, history: false, context: false },
      workspaceName: "Equipe",
    });
    expect(r.completed).toBe(1);
    expect(r.open).toBe(1);
    expect(r.markdown).not.toContain("Login social");
    expect(r.markdown).not.toContain("Arquivada");
    expect(r.markdown).not.toContain("Cliente aprovou");
    expect(r.markdown).not.toContain("Nova home");
    expect(r.markdown).toContain("## Em andamento");
    expect(r.markdown).toContain("Em curso — Em andamento");
  });

  it("keeps user text from breaking the structure", () => {
    const r = buildTaskReport({
      tasks: [task("x", { title: "Título <!-- comentário -->", status: "done", completedAt: at("2026-10-02T00:00:00Z") })],
      projects,
      events: new Map(),
      options: { ...base, from: null, to: null, periodLabel: "" },
      workspaceName: "W",
    });
    expect(r.markdown).toContain("Título &lt;!-- comentário -->");
    expect(r.markdown).toContain("**Período:** Todo o histórico");
  });

  it("reports an empty period", () => {
    const r = buildTaskReport({ tasks: [], projects, events: new Map(), options: base, workspaceName: "W" });
    expect(r.markdown).toContain("Nenhuma tarefa concluída neste período.");
  });
});

describe("periods", () => {
  const now = new Date(2026, 9, 18, 15, 0); // Sunday, 18 Oct 2026 (local)
  it("starts weeks on Monday", () => {
    const r = periodRange("this-week", now);
    expect(new Date(r.from!).getDate()).toBe(12);
    expect(new Date(r.to!).getDate()).toBe(19);
    expect(new Date(periodRange("last-week", now).from!).getDate()).toBe(5);
  });
  it("computes months, years, custom and all", () => {
    expect(new Date(periodRange("last-month", now).from!).getMonth()).toBe(8);
    expect(new Date(periodRange("this-year", now).from!).getFullYear()).toBe(2026);
    expect(periodRange("all", now)).toEqual({ from: null, to: null });
    const c = periodRange("custom", now, { from: "2026-10-01", to: "2026-10-03" });
    expect(c.to! - c.from!).toBe(3 * DAY);
    expect(periodRange("last-30", now).to! - periodRange("last-30", now).from!).toBe(30 * DAY);
  });
  it("formats durations", () => {
    expect(formatDuration(10 * 60_000)).toBe("menos de 1 hora");
    expect(formatDuration(5 * 3_600_000)).toBe("5 horas");
    expect(formatDuration(DAY)).toBe("1 dia");
    expect(formatDuration(3.4 * DAY)).toBe("3 dias");
  });
});
