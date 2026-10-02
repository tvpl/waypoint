import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

type Links = typeof import("./links");
let links: Links;
const ids: Record<string, string> = {};
const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  const { getDb, schema } = await import("@/server/db");
  const { and, eq } = await import("drizzle-orm");
  links = await import("./links");
  const db = getDb();
  db.insert(schema.users)
    .values([
      { id: "alice", email: "a@x.dev", name: "Alice", passwordHash: "x" },
      { id: "bob", email: "b@x.dev", name: "Bob", passwordHash: "x" },
    ])
    .run();
  db.insert(schema.workspaces).values({ id: "ws", name: "Time" }).run();
  db.insert(schema.workspaceMembers)
    .values([
      { workspaceId: "ws", userId: "alice", role: "owner" },
      { workspaceId: "ws", userId: "bob", role: "editor" },
    ])
    .run();
  ids.old = links.createFavorite("ws", "alice", { url: "https://old.dev", title: "Antigo" });
  ids.daily = links.createFavorite("ws", "alice", { url: "https://daily.dev", title: "Diário" });
  ids.once = links.createFavorite("ws", "alice", { url: "https://once.dev", title: "Uma vez" });
  ids.never = links.createFavorite("ws", "alice", { url: "https://never.dev", title: "Nunca" });

  // Alice: "Antigo" 10 opens a month ago, "Diário" 4 opens today, "Uma vez" 1 open today.
  for (let i = 0; i < 10; i++) links.recordOpen(ids.old, "alice");
  for (let i = 0; i < 4; i++) links.recordOpen(ids.daily, "alice");
  links.recordOpen(ids.once, "alice");
  const at = (id: string, ms: number) =>
    db
      .update(schema.recents)
      .set({ openedAt: new Date(ms) })
      .where(and(eq(schema.recents.userId, "alice"), eq(schema.recents.entityId, id)))
      .run();
  at(ids.old, Date.now() - 30 * DAY);
  at(ids.daily, Date.now() - 60_000);
  at(ids.once, Date.now() - 1000);
  // Bob opened "Nunca" a lot — that must not leak into Alice's personal sorts.
  for (let i = 0; i < 20; i++) links.recordOpen(ids.never, "bob");
});

const titles = (sort: Parameters<Links["listFavorites"]>[2] & object) => links.listFavorites("ws", "alice", sort).map((f) => f.title);

describe("personal sorts", () => {
  it("counts opens per user", () => {
    const rows = links.listFavorites("ws", "alice");
    expect(rows.find((f) => f.id === ids.old)?.myOpenCount).toBe(10);
    expect(rows.find((f) => f.id === ids.never)?.myOpenCount).toBe(0);
    // The workspace-wide counter still sees everyone's opens.
    expect(rows.find((f) => f.id === ids.never)?.openCount).toBe(20);
  });

  it("'Mais abertos' orders by this user's open count", () => {
    expect(titles({ sort: "opened" })).toEqual(["Antigo", "Diário", "Uma vez", "Nunca"]);
  });

  it("'Abertos recentemente' orders by this user's last open", () => {
    expect(titles({ sort: "visited" })).toEqual(["Uma vez", "Diário", "Antigo", "Nunca"]);
  });

  it("'Para você' weighs frequency by recency", () => {
    expect(titles({ sort: "foryou" })).toEqual(["Diário", "Uma vez", "Antigo", "Nunca"]);
  });

  it("the Recentes scope only lists links this user opened", () => {
    expect(titles({ scope: "recent" })).toEqual(["Uma vez", "Diário", "Antigo"]);
    expect(links.listFavorites("ws", "bob", { scope: "recent" }).map((f) => f.title)).toEqual(["Nunca"]);
  });
});

describe("query language", () => {
  it("filters by operators in SQL", () => {
    const q = (s: string, user = "alice") => links.listFavorites("ws", user, { q: s }).map((f) => f.title).sort();
    expect(q("is:opened")).toEqual(["Antigo", "Diário", "Uma vez"]);
    expect(q("is:unopened")).toEqual(["Nunca"]);
    expect(q("site:daily.dev")).toEqual(["Diário"]);
    expect(q("-site:daily.dev -site:old.dev")).toEqual(["Nunca", "Uma vez"]);
    expect(q("diario")).toEqual(["Diário"]); // accent-insensitive through FTS
    expect(q("aily")).toEqual(["Diário"]); // substring through the url
    expect(q("added:1d")).toHaveLength(4);
  });
});

describe("quick access", () => {
  it("lists pins first, in order, then frecent links", () => {
    expect(links.quickAccess("alice", "ws", 3).map((f) => f.title)).toEqual(["Diário", "Uma vez", "Antigo"]);
    links.togglePinLink("alice", ids.never);
    links.togglePinLink("alice", ids.old);
    expect(links.quickAccess("alice", "ws", 3).map((f) => [f.title, f.pinned])).toEqual([
      ["Nunca", true],
      ["Antigo", true],
      ["Diário", false],
    ]);
    links.reorderPinnedLinks("alice", [ids.old, ids.never]);
    expect(links.quickAccess("alice", "ws", 2).map((f) => f.title)).toEqual(["Antigo", "Nunca"]);
    expect(links.listFavorites("ws", "alice", { q: "is:pinned" }).map((f) => f.title).sort()).toEqual(["Antigo", "Nunca"]);
    expect(links.togglePinLink("alice", ids.never)).toBe(false);
    expect(links.quickAccess("bob", "ws", 5).map((f) => f.title)).toEqual(["Nunca"]);
  });
});
