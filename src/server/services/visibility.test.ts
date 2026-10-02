import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

type Links = typeof import("./links");
type Tags = typeof import("./tags");
type Res = typeof import("./resources");

let links: Links;
let tags: Tags;
let res: Res;
const ids: Record<string, string> = {};

// Bob keeps a private collection (with a nested workspace-visible sub-collection) in a
// workspace he shares with Alice. None of it may reach Alice through any listing.
beforeAll(async () => {
  const { getDb, schema } = await import("@/server/db");
  links = await import("./links");
  tags = await import("./tags");
  res = await import("./resources");
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
      { workspaceId: "ws", userId: "alice", role: "editor" },
      { workspaceId: "ws", userId: "bob", role: "owner" },
    ])
    .run();

  ids.shared = links.createCollection({ workspaceId: "ws", userId: "alice", name: "Compartilhada" });
  ids.private = links.createCollection({ workspaceId: "ws", userId: "bob", name: "Diário do Bob" });
  links.updateCollection(ids.private, { visibility: "private" });
  ids.nested = links.createCollection({ workspaceId: "ws", userId: "bob", name: "Dentro do diário", parentId: ids.private });

  ids.open = links.createFavorite("ws", "alice", { url: "https://react.dev", title: "React", collectionId: ids.shared, tags: ["dev"] });
  ids.loose = links.createFavorite("ws", "bob", { url: "https://example.com", title: "Sem coleção", tags: ["dev"] });
  ids.secret = links.createFavorite("ws", "bob", { url: "https://secret.example.com", title: "Segredo", collectionId: ids.private, tags: ["dev"] });
  ids.deep = links.createFavorite("ws", "bob", { url: "https://deep.example.com", title: "Segredo aninhado", collectionId: ids.nested });

  // Alice somehow has marks on Bob's private items (e.g. from before it went private).
  links.toggleMark("alice", "collection", ids.private, "pin");
  links.toggleMark("alice", "collection", ids.shared, "pin");
  links.toggleMark("alice", "favorite", ids.secret, "star");
});

const titles = (rows: { title: string }[]) => rows.map((r) => r.title).sort();

describe("private collection visibility", () => {
  it("computes the hidden set including nested collections", () => {
    expect(links.hiddenCollectionIds("ws", "alice")).toEqual(new Set([ids.private, ids.nested]));
    expect(links.hiddenCollectionIds("ws", "bob").size).toBe(0);
    // Anonymous viewers never see private collections, whoever owns them.
    expect(links.hiddenCollectionIds("ws", "")).toEqual(new Set([ids.private, ids.nested]));
  });

  it("listFavorites hides links in other people's private collections", () => {
    expect(titles(links.listFavorites("ws", "alice"))).toEqual(["React", "Sem coleção"]);
    expect(titles(links.listFavorites("ws", "bob"))).toEqual(["React", "Segredo", "Segredo aninhado", "Sem coleção"]);
    expect(links.listFavorites("ws", "alice", { tags: ["dev"] })).toHaveLength(2);
    expect(links.listFavorites("ws", "alice", { scope: "starred" })).toHaveLength(0);
    expect(links.listFavorites("ws", "alice", { collectionId: ids.private, deep: true })).toHaveLength(0);
  });

  it("applies the filter before the limit", () => {
    // Newest first: the two hidden links are the most recent, so a post-filter would return nothing.
    expect(titles(links.listFavorites("ws", "alice", { sort: "recent", limit: 2 }))).toEqual(["React", "Sem coleção"]);
  });

  it("Home recents and pins skip hidden items", () => {
    expect(titles(links.recentFavorites("alice", "ws", 10))).toEqual(["React", "Sem coleção"]);
    links.recordOpen(ids.secret, "alice");
    links.touchRecent("alice", "favorite", ids.secret);
    expect(titles(links.recentFavorites("alice", "ws", 10))).toEqual(["React", "Sem coleção"]);
    expect(links.pinnedCollections("alice", "ws").map((c) => c.id)).toEqual([ids.shared]);
  });

  it("tag counts only include visible links", () => {
    const dev = (u: string) => tags.listTags("ws", u).find((t) => t.name === "dev")?.links;
    expect(dev("alice")).toBe(2);
    expect(dev("bob")).toBe(3);
  });

  it("planner resource search skips hidden links and collections", () => {
    const found = res.searchResources("alice", "ws", "", { limit: 25 }).map((i) => i.resource.title);
    expect(found).toContain("React");
    expect(found).toContain("Compartilhada");
    expect(found).not.toContain("Segredo");
    expect(found).not.toContain("Segredo aninhado");
    expect(found).not.toContain("Diário do Bob");
    expect(found).not.toContain("Dentro do diário");
    expect(res.searchResources("bob", "ws", "Segredo")).toHaveLength(2);
  });
});
