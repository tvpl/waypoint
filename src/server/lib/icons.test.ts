import { describe, expect, it } from "vitest";
import { glyphSchema } from "@/domain/plan";
import { allIcons, searchIcons } from "./icons";

describe("icon library", () => {
  it("indexes interface icons and brand logos as valid glyphs", () => {
    const all = allIcons();
    expect(all.filter((i) => i.set === "ui").length).toBeGreaterThan(1500);
    expect(all.filter((i) => i.set === "brand").length).toBeGreaterThan(3000);
    const bad = all.filter((i) => !glyphSchema.safeParse(i.glyph).success);
    expect(bad.map((i) => i.id)).toEqual([]);
  });

  it("finds by name and by Portuguese words", () => {
    expect(searchIcons("database")[0].id).toBe("lucide:database");
    expect(searchIcons("banco").map((i) => i.id)).toContain("lucide:database");
    expect(searchIcons("usuário").map((i) => i.id)).toContain("lucide:user");
    expect(searchIcons("postgres", { set: "brand" })[0]).toMatchObject({ id: "si:postgresql", color: "#4169E1" });
    expect(searchIcons("").length).toBeGreaterThan(30);
  });

  it("turns circles and rects into paths", () => {
    const circle = allIcons().find((i) => i.id === "lucide:circle")!;
    expect(circle.glyph.paths[0]).toMatch(/^M\d+ \d+a10 10 0 1 0 20 0/);
  });
});
