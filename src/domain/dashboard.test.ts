import { describe, expect, it } from "vitest";
import { normalizeLayout, shortcutHrefSchema } from "./dashboard";

describe("dashboard", () => {
  it("accepts internal paths and http(s) addresses, adding https to bare domains", () => {
    expect(shortcutHrefSchema.parse("/tasks?scope=today")).toBe("/tasks?scope=today");
    expect(shortcutHrefSchema.parse("docs.example.com")).toBe("https://docs.example.com");
    expect(shortcutHrefSchema.parse("www.site.com.br/a")).toBe("https://www.site.com.br/a");
    expect(shortcutHrefSchema.parse("https://x.dev")).toBe("https://x.dev");
    for (const bad of ["//evil.com", "/\\evil.com", "javascript:alert(1)", "ftp://x.com", "nada"]) expect(shortcutHrefSchema.safeParse(bad).success).toBe(false);
  });
  it("keeps a stored layout and adds sections created later", () => {
    const l = normalizeLayout({ order: ["today", "shortcuts"], hidden: ["inbox"] });
    expect(l.order.slice(0, 2)).toEqual(["today", "shortcuts"]);
    expect(l.order).toContain("collections");
    expect(l.hidden).toEqual(["inbox"]);
    expect(normalizeLayout("lixo").order[0]).toBe("shortcuts");
  });
});
