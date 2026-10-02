import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_PATH = ":memory:";

vi.mock("./metadata", () => ({
  fetchLinkMetadata: vi.fn(async (url: string) =>
    url.includes("rich")
      ? { url, title: "Página rica", description: "Descrição da página", favicon: "https://rich.dev/icon.png", image: "https://rich.dev/og.png", embeddable: true }
      : { url, embeddable: null, error: "Não foi possível acessar a página." },
  ),
}));

type Enrich = typeof import("./link-enrich");
type Links = typeof import("./links");
let enrich: Enrich;
let links: Links;
const ids: Record<string, string> = {};

beforeAll(async () => {
  const { getDb, schema } = await import("@/server/db");
  enrich = await import("./link-enrich");
  links = await import("./links");
  const db = getDb();
  db.insert(schema.users).values({ id: "u", email: "u@x.dev", name: "U", passwordHash: "x" }).run();
  db.insert(schema.workspaces).values({ id: "ws", name: "W" }).run();
  db.insert(schema.workspaceMembers).values({ workspaceId: "ws", userId: "u", role: "owner" }).run();
  ids.rich = links.createFavorite("ws", "u", { url: "https://rich.dev/page", title: "https://rich.dev/page" });
  ids.dead = links.createFavorite("ws", "u", { url: "https://dead.dev", title: "Dead" });
  ids.done = links.createFavorite("ws", "u", { url: "https://done.dev", title: "Done", favicon: "https://done.dev/f.png" });
});

describe("enrichFavorites", () => {
  it("fills missing metadata once per link", async () => {
    expect(enrich.countPendingEnrichment("ws")).toBe(2);
    const s = await enrich.enrichFavorites("ws", { limit: 10 });
    expect(s).toEqual({ processed: 2, enriched: 1, remaining: 0 });
    const rich = links.getFavorite(ids.rich)!;
    expect(rich).toMatchObject({ title: "Página rica", description: "Descrição da página", favicon: "https://rich.dev/icon.png", coverImage: "https://rich.dev/og.png" });
    // A page without metadata isn't retried on the next run.
    expect(links.getFavorite(ids.dead)!.enrichedAt).not.toBeNull();
    expect(enrich.countPendingEnrichment("ws")).toBe(0);
  });

  it("keeps a real bookmark title", async () => {
    const id = links.createFavorite("ws", "u", { url: "https://rich.dev/other", title: "Meu título" });
    await enrich.enrichFavorites("ws", { ids: [id] });
    expect(links.getFavorite(id)!.title).toBe("Meu título");
  });
});
