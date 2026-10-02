import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

type Links = typeof import("@/server/services/links");
type Data = typeof import("./server-data");
type Pub = typeof import("./public-data");

let links: Links;
let data: Data;
let pub: Pub;
let ws = "";
const alice = "alice";
const bob = "bob";
const ids: Record<string, string> = {};

beforeAll(async () => {
  const { getDb, schema } = await import("@/server/db");
  links = await import("@/server/services/links");
  data = await import("./server-data");
  pub = await import("./public-data");
  const db = getDb();
  db.insert(schema.users).values([
    { id: alice, email: "a@x.dev", name: "Alice", passwordHash: "x" },
    { id: bob, email: "b@x.dev", name: "Bob", passwordHash: "x" },
  ]).run();
  ws = "ws1";
  db.insert(schema.workspaces).values({ id: ws, name: "Pessoal" }).run();
  db.insert(schema.workspaceMembers).values([
    { workspaceId: ws, userId: alice, role: "owner" },
    { workspaceId: ws, userId: bob, role: "editor" },
  ]).run();

  ids.dev = links.createCollection({ workspaceId: ws, userId: alice, name: "Dev" });
  ids.fe = links.createCollection({ workspaceId: ws, userId: alice, name: "Frontend", parentId: ids.dev });
  ids.secret = links.createCollection({ workspaceId: ws, userId: alice, name: "Secret", parentId: ids.dev });
  links.updateCollection(ids.secret, { visibility: "private" });
  ids.inSecret = links.createCollection({ workspaceId: ws, userId: alice, name: "Inside secret", parentId: ids.secret });

  ids.l1 = links.createFavorite(ws, alice, { url: "https://react.dev", collectionId: ids.fe, tags: ["react"] });
  ids.l2 = links.createFavorite(ws, alice, { url: "https://secret.dev", collectionId: ids.inSecret });
  ids.l3 = links.createFavorite(ws, alice, { url: "https://loose.dev" });
  ids.l4 = links.createFavorite(ws, alice, { url: "https://dev-root.dev", collectionId: ids.dev });
  ids.l5 = links.createFavorite(ws, alice, { url: "https://old.dev", collectionId: ids.dev });
  links.archiveFavorite(ids.l5, true);
  links.toggleMark(alice, "favorite", ids.l1, "star");
});

describe("visibleTree", () => {
  it("shows private collections only to their creator", () => {
    const forAlice = data.flatNodes(data.visibleTree(ws, alice).tree).map((n) => n.name);
    expect(forAlice).toContain("Secret");
    const { tree, hidden } = data.visibleTree(ws, bob);
    const forBob = data.flatNodes(tree).map((n) => n.name);
    expect(forBob).toEqual(["Dev", "Frontend"]);
    expect(hidden.has(ids.secret)).toBe(true);
    expect(hidden.has(ids.inSecret)).toBe(true);
  });
});

describe("libraryCounts", () => {
  it("counts quick filters and excludes hidden collections", () => {
    const a = data.libraryCounts(ws, alice, data.visibleTree(ws, alice).hidden, 0);
    expect(a).toMatchObject({ all: 4, unsorted: 1, archived: 1, starred: 1, recent: 0 });
    const b = data.libraryCounts(ws, bob, data.visibleTree(ws, bob).hidden, 0);
    expect(b.all).toBe(3);
    expect(b.starred).toBe(0);
  });
});

describe("findByUrl", () => {
  it("finds duplicates with or without trailing slash", () => {
    expect(data.findByUrl(ws, alice, links.normalizeUrl("react.dev"))?.id).toBe(ids.l1);
    expect(data.findByUrl(ws, alice, "https://react.dev")?.id).toBe(ids.l1);
    expect(data.findByUrl(ws, alice, "https://nope.dev/")).toBeUndefined();
  });

  it("doesn't reveal links inside someone else's private collection", () => {
    expect(data.findByUrl(ws, alice, "https://secret.dev/")?.id).toBe(ids.l2);
    expect(data.findByUrl(ws, bob, "https://secret.dev/")).toBeUndefined();
  });
});

describe("loadPublicCollection", () => {
  it("returns the visible subtree and its links, skipping private branches", () => {
    const d = pub.loadPublicCollection(ids.dev)!;
    expect(d.collection.name).toBe("Dev");
    expect(d.children.map((c) => c.name)).toEqual(["Frontend"]);
    expect(d.links.map((l) => l.url).sort()).toEqual(["https://dev-root.dev/", "https://react.dev/"]);
    expect(d.links.find((l) => l.url === "https://react.dev/")?.tags).toEqual(["react"]);
  });

  it("focuses a sub-collection and builds the path", () => {
    const d = pub.loadPublicCollection(ids.dev, ids.fe)!;
    expect(d.path.map((p) => p.name)).toEqual(["Dev", "Frontend"]);
    expect(d.links).toHaveLength(1);
  });

  it("ignores focus ids outside the subtree or inside private branches", () => {
    expect(pub.loadPublicCollection(ids.dev, ids.inSecret)!.collection.id).toBe(ids.dev);
    expect(pub.loadPublicCollection(ids.dev, "nope")!.collection.id).toBe(ids.dev);
  });

  it("returns null for archived collections", () => {
    links.archiveCollection(ids.fe, true);
    expect(pub.loadPublicCollection(ids.fe)).toBeNull();
    links.archiveCollection(ids.fe, false);
  });
});
