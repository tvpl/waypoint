import { beforeAll, describe, expect, it } from "vitest";
process.env.DATABASE_PATH = ":memory:";

let trash: typeof import("./trash");
let plans: typeof import("./plans");
let links: typeof import("./links");
let search: typeof import("./search");
let tags: typeof import("./tags");
let resources: typeof import("./resources");
let db: ReturnType<typeof import("../db").getDb>;
let schema: typeof import("../db").schema;

const ws = "ws1";
const owner = { workspaceId: ws, userId: "owner" };
const editor = { workspaceId: ws, userId: "editor" };
const viewer = { workspaceId: ws, userId: "viewer" };
const outsider = { workspaceId: ws, userId: "outsider" };
const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  const mod = await import("../db");
  db = mod.getDb();
  schema = mod.schema;
  trash = await import("./trash");
  plans = await import("./plans");
  links = await import("./links");
  search = await import("./search");
  tags = await import("./tags");
  resources = await import("./resources");
  db.insert(schema.users)
    .values(["owner", "editor", "viewer", "outsider"].map((id) => ({ id, name: id, email: `${id}@t.local`, passwordHash: "x" })))
    .run();
  db.insert(schema.workspaces).values([{ id: ws, name: "Equipe" }, { id: "ws2", name: "Outro" }]).run();
  db.insert(schema.workspaceMembers)
    .values([
      { workspaceId: ws, userId: "owner", role: "owner" },
      { workspaceId: ws, userId: "editor", role: "editor" },
      { workspaceId: ws, userId: "viewer", role: "viewer" },
      { workspaceId: "ws2", userId: "outsider", role: "owner" },
    ])
    .run();
});

const hits = (q: string) => search.searchIndex(ws, q).map((h) => h.id);
const listedLinks = (userId = "owner") => links.listFavorites(ws, userId, { sort: "recent" }).map((f) => f.id);
const treeNames = () => links.flattenTree(links.getCollectionTree(ws)).map((c) => c.name);

describe("trash", () => {
  it("hides a trashed plan everywhere and brings it back on restore", () => {
    const id = plans.createPlan({ workspaceId: ws, userId: "editor", title: "Roteiro Zeta", tags: ["viagem"] });
    links.toggleMark("editor", "plan", id, "pin");
    plans.deletePlan(id);

    expect(plans.getPlan(id)).toBeUndefined();
    expect(plans.getPlanWithAccess(id, "editor")).toBeNull();
    expect(plans.listPlans("editor", ws, "all").some((p) => p.id === id)).toBe(false);
    expect(hits("Zeta")).not.toContain(id);
    expect(tags.listTags(ws, "editor").find((t) => t.name === "viagem")?.plans).toBe(0);
    expect(resources.resolveResource({ type: "plan", id }, "editor", ws).title).toBe("Plan na lixeira");

    // Only the plan's owner (planAccess) sees and restores it.
    expect(trash.listTrash(editor).map((i) => i.id)).toContain(id);
    expect(trash.listTrash(viewer).map((i) => i.id)).not.toContain(id);
    expect(() => trash.restoreFromTrash(viewer, "plan", id)).toThrow(/permissão/);
    expect(() => trash.restoreFromTrash(outsider, "plan", id)).toThrow();

    trash.restoreFromTrash(editor, "plan", id);
    expect(plans.getPlan(id)?.title).toBe("Roteiro Zeta");
    expect(hits("Zeta")).toContain(id);
    expect(() => trash.restoreFromTrash(editor, "plan", id)).toThrow(/não encontrado/);
  });

  it("trashes a collection subtree with its links and restores it whole", () => {
    const parent = links.createCollection({ workspaceId: ws, userId: "owner", name: "Pesquisa" });
    const child = links.createCollection({ workspaceId: ws, userId: "owner", name: "Artigos", parentId: parent });
    const inChild = links.createFavorite(ws, "owner", { url: "https://example.com/quasar", title: "Quasar", collectionId: child });
    const inParent = links.createFavorite(ws, "owner", { url: "https://example.com/pulsar", title: "Pulsar", collectionId: parent });
    const loose = links.createFavorite(ws, "owner", { url: "https://example.com/nebula", title: "Nebula" });

    links.deleteCollection(parent);
    const [p, c] = [links.getCollectionRow(parent)!, links.getCollectionRow(child)!];
    expect(p.deletedAt?.getTime()).toBe(c.deletedAt?.getTime());
    expect(treeNames()).not.toContain("Pesquisa");
    expect(treeNames()).not.toContain("Artigos");
    expect(links.getCollection(child)).toBeUndefined();
    // Links stay inside, hidden with the collection.
    expect(listedLinks()).not.toContain(inChild);
    expect(listedLinks()).not.toContain(inParent);
    expect(listedLinks()).toContain(loose);
    expect(links.getFavorite(inChild)).toBeUndefined();
    expect(links.getFavoriteRow(inChild)?.collectionId).toBe(child);
    expect(hits("Quasar")).toEqual([]);
    expect(hits("Pesquisa")).toEqual([]);
    expect(links.countFavorites(ws)).toBe(1);

    // One row in the trash for the whole subtree.
    const rows = trash.listTrash(editor).filter((i) => i.type === "collection");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: parent, linkCount: 2, collectionCount: 1, destination: null });
    expect(trash.listTrash(viewer).some((i) => i.type === "collection")).toBe(false);
    expect(() => trash.restoreFromTrash(viewer, "collection", parent)).toThrow(/permissão/);

    trash.restoreFromTrash(editor, "collection", parent);
    expect(links.getCollection(child)?.parentId).toBe(parent);
    expect(listedLinks()).toEqual(expect.arrayContaining([inChild, inParent, loose]));
    expect(hits("Quasar")).toContain(inChild);
    expect(hits("Artigos")).toContain(child);
  });

  it("deleting a collection for good moves its links up, as before", () => {
    const parent = links.createCollection({ workspaceId: ws, userId: "owner", name: "Topo" });
    const child = links.createCollection({ workspaceId: ws, userId: "owner", name: "Fundo", parentId: parent });
    const fav = links.createFavorite(ws, "owner", { url: "https://example.com/deep", title: "Profundo", collectionId: child });
    links.deleteCollection(child);
    expect(trash.listTrash(owner).find((i) => i.id === child)?.destination).toBe("Topo");

    trash.deleteForever(owner, "collection", child);
    expect(links.getCollectionRow(child)).toBeUndefined();
    expect(links.getFavorite(fav)?.collectionId).toBe(parent);
    expect(hits("Profundo")).toContain(fav);
  });

  it("restores a link into Sem coleção when its collection is trashed or gone", () => {
    const col = links.createCollection({ workspaceId: ws, userId: "owner", name: "Temporária" });
    const fav = links.createFavorite(ws, "owner", { url: "https://example.com/orbit", title: "Órbita", collectionId: col });
    links.deleteFavorite(fav);
    expect(links.getFavorite(fav)).toBeUndefined();
    expect(hits("Órbita")).toEqual([]);
    links.deleteCollection(col);
    // The link has its own trash row; the collection holds no live links.
    const items = trash.listTrash(editor);
    expect(items.find((i) => i.id === fav)).toMatchObject({ type: "favorite", destination: null });
    expect(items.find((i) => i.id === col)?.linkCount).toBe(0);

    expect(trash.restoreManyFromTrash(editor, [{ type: "favorite", id: fav }, { type: "favorite", id: "nope" }])).toBe(1);
    expect(links.getFavorite(fav)?.collectionId).toBeNull();
    expect(listedLinks()).toContain(fav);
    expect(hits("Órbita")).toContain(fav);
  });

  it("keeps other people's private collections out of the trash", () => {
    const secret = links.createCollection({ workspaceId: ws, userId: "owner", name: "Segredo" });
    links.updateCollection(secret, { visibility: "private" });
    links.deleteCollection(secret);
    expect(trash.listTrash(owner).some((i) => i.id === secret)).toBe(true);
    expect(trash.listTrash(editor).some((i) => i.id === secret)).toBe(false);
    expect(() => trash.deleteForever(editor, "collection", secret)).toThrow(/não encontrado/);
    trash.deleteForever(owner, "collection", secret);
    expect(links.getCollectionRow(secret)).toBeUndefined();
  });

  it("purges what has been in the trash for more than 30 days", () => {
    const now = Date.now();
    const oldPlan = plans.createPlan({ workspaceId: ws, userId: "owner", title: "Velho" });
    const newPlan = plans.createPlan({ workspaceId: ws, userId: "owner", title: "Novo" });
    const oldCol = links.createCollection({ workspaceId: ws, userId: "owner", name: "Antiga" });
    const kept = links.createFavorite(ws, "owner", { url: "https://example.com/kept", title: "Guardado", collectionId: oldCol });
    const oldFav = links.createFavorite(ws, "owner", { url: "https://example.com/old", title: "Antigo" });
    plans.deletePlan(oldPlan, new Date(now - 31 * DAY));
    plans.deletePlan(newPlan, new Date(now - 29 * DAY));
    links.deleteCollection(oldCol, new Date(now - 31 * DAY));
    links.deleteFavorite(oldFav, new Date(now - 40 * DAY));

    const res = trash.purgeTrash(ws, now);
    expect(res).toMatchObject({ plans: 1, collections: 1, favorites: 1 });
    expect(plans.getPlanRow(oldPlan)).toBeUndefined();
    expect(plans.getPlanRow(newPlan)?.deletedAt).toBeTruthy();
    expect(links.getCollectionRow(oldCol)).toBeUndefined();
    expect(links.getFavoriteRow(oldFav)).toBeUndefined();
    // No link is lost: the purged collection's links went to "Sem coleção".
    expect(links.getFavorite(kept)?.collectionId).toBeNull();
    expect(trash.listTrash(owner).find((i) => i.id === newPlan)?.purgeAt).toBe(now - 29 * DAY + 30 * DAY);
  });

  it("empties the trash only for what the person may delete", () => {
    const mine = plans.createPlan({ workspaceId: ws, userId: "viewer", title: "Do viewer" });
    const fav = links.createFavorite(ws, "owner", { url: "https://example.com/empty", title: "Vazio" });
    plans.deletePlan(mine);
    links.deleteFavorite(fav);
    // A viewer only reaches their own plan.
    expect(trash.listTrash(viewer).map((i) => i.id)).toEqual([mine]);
    expect(() => trash.deleteForever(viewer, "favorite", fav)).toThrow(/permissão/);
    expect(trash.emptyTrash(viewer)).toBe(1);
    expect(plans.getPlanRow(mine)).toBeUndefined();
    expect(links.getFavoriteRow(fav)?.deletedAt).toBeTruthy();
    expect(() => trash.listTrash(outsider)).toThrow(/permissão/);
    trash.emptyTrash(owner);
    expect(trash.listTrash(owner)).toEqual([]);
    expect(links.getFavoriteRow(fav)).toBeUndefined();
  });
});
