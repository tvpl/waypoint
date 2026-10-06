import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

type Library = typeof import("./library");
let lib: Library;

beforeAll(async () => {
  const { getDb, schema } = await import("@/server/db");
  lib = await import("./library");
  const db = getDb();
  db.insert(schema.users).values([{ id: "u1", email: "u1@x.dev", name: "U", passwordHash: "x" }]).run();
  db.insert(schema.workspaces).values([{ id: "ws1", name: "A" }, { id: "ws2", name: "B" }]).run();
});

const item = (title: string) => ({ nodes: [{ id: "n", kind: "shape", x: 40, y: 40, width: 72, height: 72, data: { title, shape: { type: "rect" } } }], edges: [] });

describe("library service", () => {
  it("adds, lists in order, renames and deletes within a workspace", () => {
    const ids = lib.addLibraryItems("ws1", "u1", [{ name: "Um", content: item("1") }, { name: "Dois", content: item("2") }, { name: "Ruim", content: { nodes: [] } }]);
    expect(ids).toHaveLength(2);
    const list = lib.listLibrary("ws1");
    expect(list.map((i) => i.name)).toEqual(["Um", "Dois"]);
    expect(list[0].content.nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(lib.listLibrary("ws2")).toEqual([]);

    lib.renameLibraryItem("ws2", ids[0], "Invasor");
    lib.deleteLibraryItems("ws2", ids);
    expect(lib.listLibrary("ws1").map((i) => i.name)).toEqual(["Um", "Dois"]);

    lib.renameLibraryItem("ws1", ids[0], "Primeiro");
    lib.deleteLibraryItems("ws1", [ids[1]]);
    expect(lib.listLibrary("ws1").map((i) => i.name)).toEqual(["Primeiro"]);
  });

  it("refuses a batch with nothing valid", () => {
    expect(() => lib.addLibraryItems("ws1", "u1", [{ content: { nodes: [] } }])).toThrow();
  });
});
