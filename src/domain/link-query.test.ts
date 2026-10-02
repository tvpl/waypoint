import { describe, expect, it } from "vitest";
import { isEmptyQuery, matchesLinkQuery, parseLinkQuery, tokenAt, tokenize, withoutPendingOperator, type MatchableLink } from "./link-query";

describe("parseLinkQuery", () => {
  it("splits text and operators", () => {
    const q = parseLinkQuery('React  "server components" tag:docs #oss -tag:old site:https://www.GitHub.com/x in:"Dev Tools" is:starred added:2w');
    expect(q.terms).toEqual(["react", "server components"]);
    expect(q.tags).toEqual(["docs", "oss"]);
    expect(q.notTags).toEqual(["old"]);
    expect(q.sites).toEqual(["github.com"]);
    expect(q.collections).toEqual(["dev tools"]);
    expect(q.is).toEqual(["starred"]);
    expect(q.addedDays).toBe(14);
  });

  it("ignores accents and case, and unknown is: values", () => {
    const q = parseLinkQuery("Ação is:whatever added:today");
    expect(q.terms).toEqual(["acao"]);
    expect(q.is).toEqual([]);
    expect(q.addedDays).toBe(1);
  });

  it("keeps accents in tags (they're stored with them)", () => {
    expect(parseLinkQuery("tag:Ação #Café").tags).toEqual(["ação", "café"]);
  });

  it("treats unknown word:value as text", () => {
    expect(parseLinkQuery("note:this").terms).toEqual(["note:this"]);
  });

  it("detects empty queries", () => {
    expect(isEmptyQuery(parseLinkQuery("   "))).toBe(true);
    expect(isEmptyQuery(parseLinkQuery("is:broken"))).toBe(false);
  });

  it("keeps quoted values together", () => {
    expect(tokenize('a in:"x y" "b c"')).toEqual(["a", 'in:"x y"', '"b c"']);
  });
});

describe("matchesLinkQuery", () => {
  const base: MatchableLink = {
    title: "React Flow",
    url: "https://reactflow.dev/learn",
    domain: "reactflow.dev",
    description: "Biblioteca para editores baseados em nós",
    tags: ["react", "canvas"],
    collectionName: "Frontend",
    collectionPath: ["Development", "Frontend"],
    starred: true,
    healthStatus: "ok",
    collectionId: "c1",
    myLastOpenedAt: null,
    createdAt: Date.now() - 3 * 86_400_000,
  };
  const m = (q: string, l: Partial<MatchableLink> = {}) => matchesLinkQuery({ ...base, ...l }, parseLinkQuery(q));

  it("matches words anywhere, accent-insensitive", () => {
    expect(m("flow nos")).toBe(true);
    expect(m("flow vue")).toBe(false);
  });
  it("applies operators", () => {
    expect(m("tag:react -tag:old")).toBe(true);
    expect(m("-tag:canvas")).toBe(false);
    expect(m("site:reactflow.dev")).toBe(true);
    expect(m("site:docs.reactflow.dev")).toBe(false);
    expect(m("site:reactflow.dev", { domain: "docs.reactflow.dev" })).toBe(true);
    expect(m("in:development")).toBe(true);
    expect(m("is:starred is:unopened")).toBe(true);
    expect(m("is:opened")).toBe(false);
    expect(m("added:7d")).toBe(true);
    expect(m("added:1d")).toBe(false);
  });
});

describe("tokenAt", () => {
  it("finds the token around the caret", () => {
    expect(tokenAt("react tag:do x", 12)).toEqual({ start: 6, end: 12, text: "tag:do" });
    expect(tokenAt("react ", 6)).toEqual({ start: 6, end: 6, text: "" });
  });
});

describe("withoutPendingOperator", () => {
  const known = { tags: [{ name: "react" }, { name: "rust" }], collections: ["Development"], domains: ["github.com"] };
  it("drops an operator still being typed", () => {
    expect(withoutPendingOperator("flow tag:", known)).toBe("flow");
    expect(withoutPendingOperator("flow tag:re", known)).toBe("flow");
    expect(withoutPendingOperator("is:sta", known)).toBe("");
    expect(withoutPendingOperator("in:dev", known)).toBe("");
  });
  it("keeps complete or unknown values", () => {
    expect(withoutPendingOperator("flow tag:react", known)).toBe("flow tag:react");
    expect(withoutPendingOperator("tag:zzz", known)).toBe("tag:zzz");
    expect(withoutPendingOperator("site:example.org", known)).toBe("site:example.org");
    expect(withoutPendingOperator("tag:react ", known)).toBe("tag:react ");
  });
});
