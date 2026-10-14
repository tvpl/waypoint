import { describe, expect, it } from "vitest";
import { groupLinks, readDisplay, reorderLinks } from "./display";
import { parseBatchUrls } from "./batch-urls";
import type { LinkItem } from "./types";

const link = (id: string, extra: Partial<LinkItem> = {}) =>
  ({ id, domain: "example.com", tags: [], createdAt: 0, ...extra }) as LinkItem;
describe("library organization", () => {
  it("groups without duplicating links with several tags and keeps manual order inside groups", () => {
    const links = [
      link("a", { tags: ["docs", "react"] }),
      link("b"),
      link("c", { tags: ["docs"] }),
    ];
    const grouped = groupLinks(links, "tag");
    expect(
      grouped
        .flatMap((g) => g.links)
        .map((l) => l.id)
        .sort(),
    ).toEqual(["a", "b", "c"]);
    expect(
      grouped.find((g) => g.label === "#docs")?.links.map((l) => l.id),
    ).toEqual(["a", "c"]);
  });
  it("uses local calendar boundaries for date groups", () => {
    const now = new Date(2026, 9, 13, 14);
    const links = [
      link("today", { createdAt: new Date(2026, 9, 13, 1).getTime() }),
      link("week", { createdAt: new Date(2026, 9, 12).getTime() }),
      link("month", { createdAt: new Date(2026, 9, 3).getTime() }),
      link("old", { createdAt: new Date(2026, 8, 30).getTime() }),
    ];
    expect(groupLinks(links, "date", now).map((g) => g.label)).toEqual([
      "Hoje",
      "Esta semana",
      "Este mês",
      "Anteriores",
    ]);
  });
  it("moves the whole selection in its original relative order", () => {
    const links = ["a", "b", "c", "d", "e"].map((id) => link(id));
    expect(reorderLinks(links, ["c", "a"], "e", "after")).toEqual({
      index: 3,
      moving: ["a", "c"],
      ids: ["b", "d", "e", "a", "c"],
    });
    expect(reorderLinks(links, ["a", "c"], "c", "before")).toBeNull();
    expect(reorderLinks(links, ["a"], "missing", "before")).toBeNull();
  });
  it("rejects malformed preferences and bounds widths", () => {
    expect(
      readDisplay({
        group: "invalid",
        view: "unknown",
        columns: ["tags", "tags", "bad"],
        widths: { title: Infinity, tags: -100, domain: 10000 },
      }),
    ).toMatchObject({
      group: "none",
      view: undefined,
      columns: ["tags"],
      widths: { tags: 90, domain: 600 },
    });
  });
});
describe("batch URL parsing", () => {
  it("recognizes canonical duplicates without merging meaningful fragments", () => {
    expect(
      parseBatchUrls(
        "https://example.com/docs?utm_source=x\nhttp://www.example.com/docs/\nexample.com/docs#intro\n# comment\n",
      ),
    ).toEqual({
      urls: [
        "https://example.com/docs?utm_source=x",
        "https://example.com/docs#intro",
      ],
      invalid: [],
      repeated: 1,
    });
  });
  it("reports unsafe schemes and malformed lines instead of silently importing them", () => {
    const r = parseBatchUrls(
      "javascript:alert(1)\nfile:///private/file\nnot a URL\nhttps://valid.example/path",
    );
    expect(r.invalid).toHaveLength(3);
    expect(r.urls).toEqual(["https://valid.example/path"]);
  });
});
