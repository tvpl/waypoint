import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

type Comments = typeof import("./comments");
let c: Comments;
const ids: Record<string, string> = {};

// alice: workspace owner + plan creator · bob: workspace editor · vera: workspace viewer
// pat: outsider added to the private plan as viewer · eve: outsider with no access
beforeAll(async () => {
  const { getDb, schema } = await import("@/server/db");
  const plans = await import("./plans");
  c = await import("./comments");
  const db = getDb();
  db.insert(schema.users)
    .values(
      ["alice", "bob", "vera", "pat", "eve"].map((id) => ({ id, email: `${id}@x.dev`, name: id[0].toUpperCase() + id.slice(1), passwordHash: "x" })),
    )
    .run();
  db.insert(schema.workspaces).values([{ id: "ws1", name: "Time" }]).run();
  db.insert(schema.workspaceMembers)
    .values([
      { workspaceId: "ws1", userId: "alice", role: "owner" },
      { workspaceId: "ws1", userId: "bob", role: "editor" },
      { workspaceId: "ws1", userId: "vera", role: "viewer" },
    ])
    .run();
  ids.plan = plans.createPlan({ workspaceId: "ws1", userId: "alice", title: "Pagamentos" });
  ids.other = plans.createPlan({ workspaceId: "ws1", userId: "alice", title: "Outro" });
  ids.private = plans.createPlan({ workspaceId: "ws1", userId: "alice", title: "Privado", visibility: "private" });
  plans.setPlanMember(ids.private, "pat", "viewer");
  ids.publicPlan = plans.createPlan({ workspaceId: "ws1", userId: "alice", title: "Público", visibility: "public" });
  ids.linkPlan = plans.createPlan({ workspaceId: "ws1", userId: "alice", title: "Link", visibility: "link" });
  ids.token = plans.ensureShareLink("plan", ids.linkPlan, "alice");
});

const as = (userId: string | null, token?: string) => ({ userId, token });

describe("comments service — access", () => {
  it("anonymous visitors can't read or write, even on public plans", () => {
    expect(() => c.listComments(ids.publicPlan, as(null))).toThrow(/Entre/);
    expect(() => c.createComment(ids.publicPlan, as(null), { body: "oi" })).toThrow(/Entre/);
  });

  it("people without access can't read or write", () => {
    expect(() => c.listComments(ids.private, as("bob"))).toThrow(/acesso/);
    expect(() => c.createComment(ids.private, as("eve"), { body: "oi" })).toThrow(/acesso/);
    expect(() => c.listComments(ids.linkPlan, as("eve"))).toThrow(/acesso/);
  });

  it("viewers (workspace, plan member, share token) can read and comment", () => {
    const v = c.createComment(ids.plan, as("vera"), { body: "Dúvida geral" });
    expect(v).toMatchObject({ nodeId: null, parentId: null, author: { id: "vera", name: "Vera" } });
    const p = c.createComment(ids.private, as("pat"), { body: "Visto", nodeId: "n1" });
    expect(p.nodeId).toBe("n1");
    const t = c.createComment(ids.linkPlan, as("eve", ids.token), { body: "Pelo link" });
    expect(t.author.id).toBe("eve");
    expect(c.listComments(ids.linkPlan, as("eve", ids.token)).map((x) => x.id)).toEqual([t.id]);
    // the token doesn't open other plans
    expect(() => c.listComments(ids.plan, as("eve", ids.token))).toThrow(/acesso/);
  });

  it("validates the body", () => {
    expect(() => c.createComment(ids.plan, as("bob"), { body: "   " })).toThrow(/Escreva/);
    expect(() => c.createComment(ids.plan, as("bob"), { body: "x".repeat(4001) })).toThrow(/4000/);
    expect(c.createComment(ids.plan, as("bob"), { body: "x".repeat(4000) }).body).toHaveLength(4000);
  });
});

describe("comments service — threads", () => {
  it("replies inherit the thread's node and must belong to the same plan", () => {
    const root = c.createComment(ids.plan, as("bob"), { body: "Sobre o gateway", nodeId: "gw" });
    const r1 = c.createComment(ids.plan, as("vera"), { body: "Concordo", parentId: root.id, nodeId: "ignored" });
    expect(r1).toMatchObject({ parentId: root.id, nodeId: "gw" });
    // replying to a reply attaches to the thread
    const r2 = c.createComment(ids.plan, as("alice"), { body: "@Bob ok", parentId: r1.id });
    expect(r2.parentId).toBe(root.id);
    expect(() => c.createComment(ids.other, as("bob"), { body: "x", parentId: root.id })).toThrow(/não encontrado/);
    expect(() => c.createComment(ids.plan, as("bob"), { body: "x", parentId: "nope" })).toThrow(/não encontrado/);
  });

  it("edit is author-only", () => {
    const mine = c.createComment(ids.plan, as("vera"), { body: "rascunho" });
    expect(() => c.editComment(mine.id, as("alice"), "hack")).toThrow(/Só quem escreveu/);
    expect(() => c.editComment(mine.id, as("bob"), "hack")).toThrow(/Só quem escreveu/);
    expect(c.editComment(mine.id, as("vera"), "  versão final ").body).toBe("versão final");
  });

  it("delete: author or plan owner; deleting a thread removes its replies", () => {
    const root = c.createComment(ids.plan, as("vera"), { body: "apagar" });
    const reply = c.createComment(ids.plan, as("bob"), { body: "resposta", parentId: root.id });
    expect(() => c.deleteComment(root.id, as("bob"))).toThrow(/não pode excluir/);
    // bob deletes his own reply
    expect(c.deleteComment(reply.id, as("bob")).deleted).toEqual([reply.id]);
    const reply2 = c.createComment(ids.plan, as("bob"), { body: "outra", parentId: root.id });
    // the owner can delete anyone's thread
    expect(c.deleteComment(root.id, as("alice")).deleted.sort()).toEqual([root.id, reply2.id].sort());
    expect(c.listComments(ids.plan, as("alice")).some((x) => x.id === root.id || x.id === reply2.id)).toBe(false);
  });

  it("resolve/reopen: editors, owners and the thread author — not other viewers", () => {
    const byBob = c.createComment(ids.plan, as("bob"), { body: "resolver?", nodeId: "n9" });
    const byVera = c.createComment(ids.plan, as("vera"), { body: "minha dúvida" });
    const veraReply = c.createComment(ids.plan, as("vera"), { body: "+1", parentId: byBob.id });
    expect(() => c.setCommentResolved(byBob.id, as("vera"), true)).toThrow(/Só editores/);
    // resolving through a reply resolves the thread root — still needs rights on the thread
    expect(() => c.setCommentResolved(veraReply.id, as("vera"), true)).toThrow(/Só editores/);
    expect(c.setCommentResolved(byVera.id, as("vera"), true).resolvedAt).not.toBeNull();
    expect(c.setCommentResolved(byBob.id, as("alice"), true)).toMatchObject({ id: byBob.id });
    expect(c.setCommentResolved(byBob.id, as("bob"), false).resolvedAt).toBeNull();
    expect(() => c.setCommentResolved(byBob.id, as("eve"), true)).toThrow(/acesso/);
  });

  it("counts unresolved comments per node", () => {
    const counts0 = c.commentCounts(ids.private, as("alice"));
    expect(counts0.byNode).toEqual({ n1: 1 });
    const root = c.createComment(ids.private, as("alice"), { body: "a", nodeId: "n2" });
    c.createComment(ids.private, as("pat"), { body: "b", parentId: root.id });
    expect(c.commentCounts(ids.private, as("pat")).byNode).toEqual({ n1: 1, n2: 2 });
    c.setCommentResolved(root.id, as("alice"), true);
    const counts = c.commentCounts(ids.private, as("pat"));
    expect(counts.byNode).toEqual({ n1: 1 });
    expect(counts.unresolvedThreads).toBe(1);
    // a new reply reopens the thread
    c.createComment(ids.private, as("pat"), { body: "ainda não", parentId: root.id });
    expect(c.commentCounts(ids.private, as("pat")).byNode.n2).toBe(3);
  });

  it("mention candidates: insiders see workspace members, link visitors only commenters", () => {
    const inside = c.mentionCandidates(ids.plan, as("vera")).map((p) => p.name);
    expect(inside).toEqual(expect.arrayContaining(["Alice", "Bob", "Vera"]));
    const outside = c.mentionCandidates(ids.linkPlan, as("eve", ids.token)).map((p) => p.name);
    expect(outside).toEqual(["Eve"]);
  });
});
