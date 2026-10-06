import { describe, expect, it } from "vitest";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { componentSchema } from "@/domain/plan";
import { COMPONENTS, PACKS, componentDef, searchComponents } from "./registry";

describe("component kits", () => {
  it("has unique ids, a known pack, and draws every component with its defaults", () => {
    const keys = COMPONENTS.map((c) => `${c.pack}/${c.type}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(COMPONENTS.length).toBeGreaterThan(100);
    const packs = new Set<string>(PACKS.map((p) => p.id));
    for (const c of COMPONENTS) {
      expect(packs.has(c.pack)).toBe(true);
      expect(componentSchema.safeParse({ pack: c.pack, type: c.type, props: c.defaults }).success).toBe(true);
      const html = renderToStaticMarkup(createElement(Fragment, null, c.render({ title: c.title, props: c.defaults ?? {}, w: c.size[0], h: c.size[1] })));
      expect(html.length).toBeGreaterThan(20);
    }
  });

  it("finds components by name and Portuguese words", () => {
    expect(searchComponents("kafka")[0]).toMatchObject({ pack: "eda", type: "topic" });
    expect(searchComponents("fila").map((c) => c.type)).toContain("queue");
    expect(searchComponents("botão")[0]).toMatchObject({ pack: "ux", type: "button" });
    expect(componentDef("dados", "table")?.fields?.[0].key).toBe("columns");
  });

  it("draws a topic with its partitions and a table with its columns", () => {
    const topic = componentDef("eda", "topic")!;
    expect(renderToStaticMarkup(createElement(Fragment, null, topic.render({ title: "t", props: { partitions: 5 }, w: 220, h: 128 })))).toContain("P4");
    const table = componentDef("dados", "table")!;
    const html = renderToStaticMarkup(createElement(Fragment, null, table.render({ title: "t", props: { columns: ["id uuid PK", "nome text"] }, w: 220, h: 150 })));
    expect(html).toContain("nome");
    expect(html).toContain("PK");
  });
});
