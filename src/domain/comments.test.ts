import { describe, expect, it } from "vitest";
import { countComments, splitMentions, toThreads, type CommentView } from "./comments";

const c = (id: string, extra: Partial<CommentView> = {}): CommentView => ({
  id,
  planId: "p",
  nodeId: null,
  parentId: null,
  body: id,
  resolvedAt: null,
  createdAt: 0,
  updatedAt: 0,
  author: { id: "u", name: "U" },
  ...extra,
});

describe("comment helpers", () => {
  it("groups replies under their thread", () => {
    const t = toThreads([c("a"), c("r1", { parentId: "a" }), c("b", { nodeId: "n" }), c("orphan", { parentId: "gone" })]);
    expect(t.map((x) => [x.root.id, x.replies.map((r) => r.id)])).toEqual([
      ["a", ["r1"]],
      ["b", []],
    ]);
  });

  it("counts unresolved comments per node and unresolved threads", () => {
    const list = [c("a", { nodeId: "n1" }), c("r", { parentId: "a" }), c("b", { nodeId: "n2", resolvedAt: 5 }), c("g")];
    expect(countComments(list)).toEqual({ byNode: { n1: 2 }, unresolvedThreads: 2 });
  });

  it("splits known @mentions (longest name wins, word boundary)", () => {
    const parts = splitMentions("Oi @Ana Lima e @Ana, veja @ninguém. email@ana", ["Ana", "Ana Lima"]);
    expect(parts.filter((p) => p.mention).map((p) => p.text)).toEqual(["@Ana Lima", "@Ana"]);
    expect(parts.map((p) => p.text).join("")).toBe("Oi @Ana Lima e @Ana, veja @ninguém. email@ana");
  });
});
