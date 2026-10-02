import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

type Dedupe = typeof import("./link-dedupe");
type Links = typeof import("./links");
let dedupe: Dedupe;
let links: Links;
const ids: Record<string, string> = {};

beforeAll(async () => {
  const { getDb, schema } = await import("@/server/db");
  dedupe = await import("./link-dedupe");
  links = await import("./links");
  const db = getDb();
  db.insert(schema.users).values({ id: "u", email: "u@x.dev", name: "U", passwordHash: "x" }).run();
  db.insert(schema.workspaces).values({ id: "ws", name: "W" }).run();
  db.insert(schema.workspaceMembers).values({ workspaceId: "ws", userId: "u", role: "owner" }).run();
  ids.a = links.createFavorite("ws", "u", { url: "https://react.dev/learn", title: "React", tags: ["react"] });
  ids.b = links.createFavorite("ws", "u", { url: "http://www.react.dev/learn/?utm_source=tw", title: "React (dup)", tags: ["docs"], notes: "Ver hooks" });
  ids.c = links.createFavorite("ws", "u", { url: "https://react.dev/blog", title: "Blog" });
  links.toggleMark("u", "favorite", ids.b, "star");
  links.recordOpen(ids.b, "u");
});

describe("duplicates", () => {
  it("groups links of the same page", () => {
    const groups = dedupe.findDuplicateGroups("ws", "u");
    expect(groups).toHaveLength(1);
    expect(groups[0].links.map((l) => l.id).sort()).toEqual([ids.a, ids.b].sort());
    // the opened one is suggested as keeper
    expect(groups[0].links[0].id).toBe(ids.b);
  });

  it("merges tags, notes, marks and opens into the keeper and archives the rest", () => {
    expect(dedupe.mergeLinks("ws", ids.a, [ids.b])).toBe(1);
    const view = links.listFavorites("ws", "u").find((f) => f.id === ids.a)!;
    expect(view.tags.sort()).toEqual(["docs", "react"]);
    expect(view.notes).toBe("Ver hooks");
    expect(view.starred).toBe(true);
    expect(view.openCount).toBe(1);
    expect(view.myOpenCount).toBe(1);
    expect(links.getFavorite(ids.b)!.archivedAt).not.toBeNull();
    expect(dedupe.findDuplicateGroups("ws", "u")).toHaveLength(0);
  });

  it("refuses to merge different pages", () => {
    expect(() => dedupe.mergeLinks("ws", ids.a, [ids.c])).toThrow();
  });
});
