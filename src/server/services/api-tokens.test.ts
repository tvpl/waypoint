import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

type Tokens = typeof import("./api-tokens");
let tok: Tokens;
let db: ReturnType<typeof import("../db").getDb>;
let schema: typeof import("../db").schema;

const req = (auth?: string) => new Request("http://x/api/v1/me", { headers: auth ? { authorization: auth } : {} });

beforeAll(async () => {
  const mod = await import("../db");
  db = mod.getDb();
  schema = mod.schema;
  tok = await import("./api-tokens");
  db.insert(schema.users).values([
    { id: "u1", email: "a@x.dev", name: "Ana", passwordHash: "x" },
    { id: "u2", email: "b@x.dev", name: "Bia", passwordHash: "x" },
  ]).run();
  db.insert(schema.workspaces).values([{ id: "w1", name: "Pessoal" }, { id: "w2", name: "Time" }]).run();
  db.insert(schema.workspaceMembers).values([
    { workspaceId: "w1", userId: "u1", role: "owner" },
    { workspaceId: "w2", userId: "u1", role: "viewer" },
  ]).run();
});

describe("api tokens", () => {
  it("creates wp_ tokens, stores only the hash and shows the token once", () => {
    const { token, view } = tok.createApiToken("u1", "w1", "  Extensão  ");
    expect(token).toMatch(/^wp_[0-9A-Za-z]{40}$/);
    expect(view).toMatchObject({ name: "Extensão", prefix: token.slice(0, 7), workspaceName: "Pessoal", lastUsedAt: null });
    const row = db.select().from(schema.apiTokens).all().find((r) => r.id === view.id)!;
    expect(row.tokenHash).toBe(tok.hashApiToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(JSON.stringify(tok.listApiTokens("u1"))).not.toContain(token);
  });

  it("refuses workspaces the user isn't a member of", () => {
    expect(() => tok.createApiToken("u2", "w1", "x")).toThrow();
  });

  it("authenticates Bearer tokens with the creator's current role", () => {
    const { token, view } = tok.createApiToken("u1", "w2", "Leitura");
    const p = tok.authenticateBearer(req(`Bearer ${token}`))!;
    expect(p).toMatchObject({ tokenId: view.id, workspaceId: "w2", role: "viewer", user: { id: "u1", email: "a@x.dev" } });
    expect(tok.listApiTokens("u1").find((t) => t.id === view.id)!.lastUsedAt).not.toBeNull();

    // role changes apply immediately
    db.update(schema.workspaceMembers).set({ role: "editor" }).run();
    expect(tok.authenticateBearer(req(`bearer ${token}`))!.role).toBe("editor");
  });

  it("rejects malformed, unknown and revoked tokens, and removed members", () => {
    expect(tok.authenticateBearer(req())).toBeNull();
    expect(tok.authenticateBearer(req("Basic abc"))).toBeNull();
    expect(tok.authenticateBearer(req("Bearer wp_short"))).toBeNull();
    expect(tok.authenticateBearer(req(`Bearer wp_${"A".repeat(40)}`))).toBeNull();

    const a = tok.createApiToken("u1", "w1", "Revogar");
    expect(tok.revokeApiToken("u2", a.view.id)).toBe(false); // not theirs
    expect(tok.authenticateBearer(req(`Bearer ${a.token}`))).not.toBeNull();
    expect(tok.revokeApiToken("u1", a.view.id)).toBe(true);
    expect(tok.authenticateBearer(req(`Bearer ${a.token}`))).toBeNull();

    const b = tok.createApiToken("u1", "w2", "Saiu");
    db.delete(schema.workspaceMembers).run();
    expect(tok.authenticateBearer(req(`Bearer ${b.token}`))).toBeNull();
  });
});
