import { beforeAll, describe, expect, it, vi } from "vitest";
process.env.DATABASE_PATH = ":memory:";
const auth = vi.hoisted(() => ({ role: "owner" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));
vi.mock("@/server/services/workspaces", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/services/workspaces")>();
  return {
    ...actual,
    requireWorkspace: async () => ({
      user: { id: "u", name: "U", email: "u@example.test" },
      workspace: { id: "ws", name: "W" },
      role: auth.role,
      workspaces: [],
    }),
  };
});
let actions: typeof import("@/app/(app)/links/actions");
let links: typeof import("@/server/services/links");
let collection: string;
let otherCollection: string;
beforeAll(async () => {
  const { getDb, schema } = await import("@/server/db");
  const db = getDb();
  db.insert(schema.users)
    .values({ id: "u", email: "u@example.test", name: "U", passwordHash: "x" })
    .run();
  db.insert(schema.workspaces)
    .values([
      { id: "ws", name: "W" },
      { id: "other", name: "Other" },
    ])
    .run();
  db.insert(schema.workspaceMembers)
    .values({ userId: "u", workspaceId: "ws", role: "owner" })
    .run();
  links = await import("@/server/services/links");
  actions = await import("@/app/(app)/links/actions");
  collection = links.createCollection({
    workspaceId: "ws",
    userId: "u",
    name: "Docs",
  });
  otherCollection = links.createCollection({
    workspaceId: "other",
    userId: "u",
    name: "Other",
  });
});
describe("batch actions access and persistence", () => {
  it("rechecks editor access for review and creation", async () => {
    auth.role = "viewer";
    expect((await actions.reviewLinksAction(["https://example.com"])).ok).toBe(
      false,
    );
    expect(
      (
        await actions.createLinksBatchAction({
          urls: ["https://example.com"],
          collectionId: null,
          tags: [],
        })
      ).ok,
    ).toBe(false);
    auth.role = "owner";
  });
  it("rejects cross-workspace destinations and validates every URL before writing", async () => {
    expect(
      (
        await actions.createLinksBatchAction({
          urls: ["https://example.com/cross"],
          collectionId: otherCollection,
          tags: [],
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await actions.createLinksBatchAction({
          urls: ["https://example.com/not-written", "javascript:alert(1)"],
          collectionId: null,
          tags: [],
        })
      ).ok,
    ).toBe(false);
    expect(links.listFavorites("ws", "u")).toHaveLength(0);
  });
  it("avoids duplicates, rechecks review races, and indexes tags for newly created links", async () => {
    const urls = [
      "https://example.com/docs",
      "http://www.example.com/docs/?utm_source=x",
      "https://example.com/guide",
    ];
    const review = await actions.reviewLinksAction(urls);
    expect(review.ok && review.data?.every((l) => !l.existingId)).toBe(true);
    links.createFavorite("ws", "u", { url: urls[0], title: "Existing" });
    const saved = await actions.createLinksBatchAction({
      urls,
      collectionId: collection,
      tags: ["docs"],
    });
    expect(saved.ok && saved.data).toMatchObject({ skipped: 2 });
    expect(saved.ok && saved.data?.ids).toHaveLength(1);
    const items = links.listFavorites("ws", "u");
    expect(items).toHaveLength(2);
    expect(items.find((l) => l.url.endsWith("guide"))).toMatchObject({
      collectionId: collection,
      tags: ["docs"],
    });
    const { getDb } = await import("@/server/db");
    expect(
      getDb()
        .$client.prepare(
          "select count(*) as n from search_index where entity_type = 'favorite'",
        )
        .get(),
    ).toMatchObject({ n: 2 });
  });
  it("adds and removes tags in one operation without dropping unrelated tags", async () => {
    const item = links
      .listFavorites("ws", "u")
      .find((l) => l.url.endsWith("guide"))!;
    links.updateFavorite(item.id, { tags: ["docs", "keep"] });
    const r = await actions.bulkLinksAction({
      op: "tags",
      ids: [item.id],
      add: ["new"],
      remove: ["docs"],
    });
    expect(r.ok).toBe(true);
    expect(
      links
        .listFavorites("ws", "u")
        .find((l) => l.id === item.id)
        ?.tags.sort(),
    ).toEqual(["keep", "new"]);
  });

  it("reorders several links as a block and persists their relative order", async () => {
    const destination = links.createCollection({ workspaceId: "ws", userId: "u", name: "Manual" });
    const ids = ["a", "b", "c", "d", "e"].map(name => links.createFavorite("ws", "u", { url: `https://manual.example/${name}`, title: name, collectionId: destination }));
    const result = await actions.moveLinksAction({ ids: [ids[0], ids[2]], collectionId: destination, index: 3 });
    expect(result.ok).toBe(true);
    expect(links.listFavorites("ws", "u", { collectionId: destination, sort: "manual" }).map(l => l.title)).toEqual(["b", "d", "e", "a", "c"]);
  });
});
