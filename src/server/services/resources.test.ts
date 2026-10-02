import { beforeAll, describe, expect, it } from "vitest";
import type { PlanDocument } from "@/domain/plan";

process.env.DATABASE_PATH = ":memory:";

type Res = typeof import("./resources");
type Plans = typeof import("./plans");

let res: Res;
let plans: Plans;
const ids: Record<string, string> = {};

const doc = (nodes: PlanDocument["nodes"]): PlanDocument => ({ schemaVersion: 1, nodes, edges: [], viewport: { x: 0, y: 0, zoom: 1 } });

beforeAll(async () => {
  const { getDb, schema } = await import("@/server/db");
  const links = await import("./links");
  res = await import("./resources");
  plans = await import("./plans");
  const db = getDb();
  db.insert(schema.users)
    .values([
      { id: "alice", email: "a@x.dev", name: "Alice", passwordHash: "x" },
      { id: "bob", email: "b@x.dev", name: "Bob", passwordHash: "x" },
    ])
    .run();
  db.insert(schema.workspaces).values([{ id: "ws1", name: "Pessoal" }, { id: "ws2", name: "Outro" }]).run();
  db.insert(schema.workspaceMembers)
    .values([
      { workspaceId: "ws1", userId: "alice", role: "owner" },
      { workspaceId: "ws2", userId: "bob", role: "owner" },
    ])
    .run();
  ids.col = links.createCollection({ workspaceId: "ws1", userId: "alice", name: "Docs POS" });
  ids.fav = links.createFavorite("ws1", "alice", { url: "https://reactflow.dev/learn", title: "React Flow", collectionId: ids.col });
  ids.foreign = links.createFavorite("ws2", "bob", { url: "https://secret.example.com", title: "Segredo 100%_x" });
  ids.target = plans.createPlan({ workspaceId: "ws1", userId: "alice", title: "Pagamentos PIX" });
  ids.private = plans.createPlan({ workspaceId: "ws1", userId: "alice", title: "Rascunho privado", visibility: "private" });
  ids.publicPlan = plans.createPlan({ workspaceId: "ws1", userId: "alice", title: "Mapa público", visibility: "public" });
});

describe("resources service", () => {
  it("resolves favorites, collections, plans and urls for a member", () => {
    const d = doc([
      { id: "n1", kind: "link", x: 0, y: 0, width: 10, height: 10, data: { title: "", resource: { type: "favorite", id: ids.fav } } },
      { id: "n2", kind: "link", x: 0, y: 0, width: 10, height: 10, data: { title: "", resource: { type: "collection", id: ids.col } } },
      { id: "n3", kind: "link", x: 0, y: 0, width: 10, height: 10, data: { title: "", resource: { type: "plan", id: ids.target } } },
      { id: "n4", kind: "block", x: 0, y: 0, width: 10, height: 10, data: { title: "", resource: { type: "url", url: "https://www.example.com/a" } } },
      { id: "n5", kind: "block", x: 0, y: 0, width: 10, height: 10, data: { title: "sem recurso" } },
    ]);
    const out = res.resolveDocumentResources(d, "alice", "ws1");
    expect(out.n1).toMatchObject({ kind: "favorite", title: "React Flow", href: "https://reactflow.dev/learn", external: true });
    expect(out.n2).toMatchObject({ kind: "collection", title: "Docs POS", href: `/links?c=${ids.col}`, subtitle: "Coleção · 1 link" });
    expect(out.n3).toMatchObject({ kind: "plan", title: "Pagamentos PIX", href: `/plans/${ids.target}`, external: false });
    expect(out.n4).toMatchObject({ kind: "url", title: "example.com", external: true });
    expect(out.n5).toBeUndefined();
  });

  it("hides items from other workspaces and plans the viewer can't read", () => {
    const d = doc([
      { id: "a", kind: "link", x: 0, y: 0, width: 10, height: 10, data: { title: "", resource: { type: "favorite", id: ids.foreign } } },
      { id: "b", kind: "link", x: 0, y: 0, width: 10, height: 10, data: { title: "", resource: { type: "plan", id: ids.private } } },
      { id: "c", kind: "link", x: 0, y: 0, width: 10, height: 10, data: { title: "", resource: { type: "plan", id: ids.publicPlan } } },
      { id: "d", kind: "link", x: 0, y: 0, width: 10, height: 10, data: { title: "", resource: { type: "collection", id: ids.col } } },
    ]);
    // anonymous visitor of a public plan in ws1
    const anon = res.resolveDocumentResources(d, null, "ws1");
    expect(anon.a.href).toBeNull();
    expect(anon.a.title).not.toContain("Segredo");
    expect(anon.b).toMatchObject({ href: null, title: "Plan restrito" });
    expect(anon.c.href).toBe(`/plans/${ids.publicPlan}`);
    // collections don't link through for non-members, but keep their name
    expect(anon.d).toMatchObject({ title: "Docs POS", href: null });
    // bob is a member of ws2: he may see his own favorite even inside a ws1 plan
    expect(res.resolveDocumentResources(d, "bob", "ws1").a.href).toBe("https://secret.example.com/");
  });

  it("searches the active workspace with escaped LIKE patterns", () => {
    const all = res.searchResources("alice", "ws1", "");
    expect(all.map((i) => i.ref.type).sort()).toEqual(expect.arrayContaining(["favorite", "collection", "plan"]));
    const hit = res.searchResources("alice", "ws1", "react");
    expect(hit).toHaveLength(1);
    expect(hit[0].ref).toEqual({ type: "favorite", id: ids.fav });
    // other workspace's items never leak, and % is literal
    expect(res.searchResources("alice", "ws1", "Segredo")).toHaveLength(0);
    expect(res.searchResources("bob", "ws2", "100%_x")).toHaveLength(1);
    expect(res.searchResources("bob", "ws2", "100%x")).toHaveLength(0);
    // plans only
    const onlyPlans = res.searchResources("alice", "ws1", "", { types: ["plan"], excludePlanId: ids.target });
    expect(onlyPlans.every((i) => i.ref.type === "plan")).toBe(true);
    expect(onlyPlans.some((i) => i.ref.type === "plan" && i.ref.id === ids.target)).toBe(false);
  });

  it("round-trips the editor document through saveDraft with optimistic concurrency", () => {
    const { version } = plans.getDraft(ids.target);
    const d = doc([{ id: "x", kind: "block", x: 1, y: 2, width: 200, height: 72, data: { title: "Gateway" } }]);
    const ok = plans.saveDraft(ids.target, "alice", version, d);
    expect(ok.ok).toBe(true);
    const stale = plans.saveDraft(ids.target, "alice", version, d);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.document.nodes[0].data.title).toBe("Gateway");
  });
});
