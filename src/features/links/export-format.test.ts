import { describe, expect, it } from "vitest";
import { buildExportTree, collectionPaths, csvCell, fileSlug, linksToCsv, toCsv } from "./export-format";
import { toBookmarksHtml } from "@/server/lib/bookmarks";
import { parseBookmarksHtml } from "@/server/lib/bookmarks";

describe("csvCell", () => {
  it("leaves plain values untouched", () => {
    expect(csvCell("hello")).toBe("hello");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes cells with commas, quotes and newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvCell("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
    expect(csvCell("x\r\ny")).toBe('"x\r\ny"');
  });

  it("quotes cells with leading/trailing whitespace", () => {
    expect(csvCell(" pad ")).toBe('" pad "');
  });

  it("neutralises formula injection", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
    expect(csvCell("a=b")).toBe("a=b");
  });
});

describe("toCsv", () => {
  it("joins with CRLF and escapes each cell", () => {
    expect(toCsv(["a", "b"], [["1", "x,y"]])).toBe('a,b\r\n1,"x,y"\r\n');
  });
});

const tree = [
  { id: "dev", name: "Dev", children: [{ id: "fe", name: "Frontend", children: [] }] },
  { id: "ai", name: "AI", children: [] },
];
const links = [
  { title: "React", url: "https://react.dev/", collectionId: "fe", tags: ["react"], description: null, keywords: null, createdAt: 1_700_000_000_000 },
  { title: "Loose", url: "https://loose.dev/", collectionId: null, tags: [], description: "=cmd", keywords: null, createdAt: 1_700_000_000_000 },
  { title: "Orphan", url: "https://orphan.dev/", collectionId: "gone", tags: [], description: null, keywords: null, createdAt: 1_700_000_000_000 },
];

describe("collectionPaths", () => {
  it("builds slash-separated paths", () => {
    const p = collectionPaths(tree);
    expect(p.get("fe")).toBe("Dev / Frontend");
    expect(p.get("ai")).toBe("AI");
  });
});

describe("buildExportTree", () => {
  it("nests links in their folders and puts unknown ones at the root", () => {
    const root = buildExportTree(tree, links, "Raiz");
    expect(root.name).toBe("Raiz");
    expect(root.links.map((l) => l.title)).toEqual(["Loose", "Orphan"]);
    expect(root.children[0].children[0].links[0].url).toBe("https://react.dev/");
  });

  it("round-trips through the Netscape format", () => {
    const html = toBookmarksHtml(buildExportTree(tree, links));
    const parsed = parseBookmarksHtml(html);
    expect(parsed.children[0].name).toBe("Dev");
    expect(parsed.children[0].children[0].name).toBe("Frontend");
    expect(parsed.children[0].children[0].links[0].title).toBe("React");
    expect(parsed.links).toHaveLength(2);
  });
});

describe("linksToCsv", () => {
  it("includes collection path and guards formulas", () => {
    const csv = linksToCsv(tree, links);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toContain("Título,URL,Coleção");
    expect(lines[1]).toContain("Dev / Frontend");
    expect(lines[2]).toContain("'=cmd");
  });
});

describe("fileSlug", () => {
  it("strips accents and punctuation", () => {
    expect(fileSlug("Minha Coleção: Ótima!")).toBe("minha-colecao-otima");
    expect(fileSlug("***")).toBe("links");
  });
});
