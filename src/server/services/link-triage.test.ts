import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

type Triage = typeof import("./link-triage");
type Links = typeof import("./links");
let triage: Triage;
let links: Links;
const ids: Record<string, string> = {};

beforeAll(async () => {
  const { getDb, schema } = await import("@/server/db");
  triage = await import("./link-triage");
  links = await import("./links");
  const db = getDb();
  db.insert(schema.users).values({ id: "u", email: "u@x.dev", name: "U", passwordHash: "x" }).run();
  db.insert(schema.workspaces).values({ id: "ws", name: "W" }).run();
  db.insert(schema.workspaceMembers).values({ workspaceId: "ws", userId: "u", role: "owner" }).run();
  ids.gh = links.createCollection({ workspaceId: "ws", userId: "u", name: "Repos" });
  ids.docs = links.createCollection({ workspaceId: "ws", userId: "u", name: "Docs" });
  links.createFavorite("ws", "u", { url: "https://github.com/a/b", collectionId: ids.gh });
  links.createFavorite("ws", "u", { url: "https://github.com/c/d", collectionId: ids.gh });
  links.createFavorite("ws", "u", { url: "https://react.dev", collectionId: ids.docs, tags: ["react"] });
  ids.inbox = links.createFavorite("ws", "u", { url: "https://github.com/x/y", tags: ["react"], inbox: true });
});

describe("triage", () => {
  it("suggests collections from the same site first, then shared tags", () => {
    const s = triage.suggestCollections("ws", "u", ids.inbox);
    expect(s.map((c) => c.name)).toEqual(["Repos", "Docs"]);
    expect(s[0].reason).toBe("2 links de github.com");
  });

  it("lists the inbox and clears it when filed or triaged", () => {
    expect(links.listFavorites("ws", "u", { scope: "inbox" }).map((f) => f.id)).toEqual([ids.inbox]);
    links.moveFavorite(ids.inbox, ids.gh);
    expect(links.listFavorites("ws", "u", { scope: "inbox" })).toHaveLength(0);
    const other = links.createFavorite("ws", "u", { url: "https://x.dev", inbox: true });
    triage.markTriaged("ws", [other]);
    expect(links.listFavorites("ws", "u", { scope: "inbox" })).toHaveLength(0);
  });
});
