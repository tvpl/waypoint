import { describe, expect, it } from "vitest";
import { normalizeDocument } from "@/domain/plan";
import { STARTER_TEMPLATES } from "./starter-templates";

describe("starter templates", () => {
  it.each(STARTER_TEMPLATES.map((t) => [t.id, t] as const))("%s builds a valid document with fresh ids", (_, t) => {
    const a = t.build();
    const b = t.build();
    const norm = normalizeDocument(a);
    expect(norm.nodes).toHaveLength(a.nodes.length);
    expect(norm.edges).toHaveLength(a.edges.length);
    if (a.nodes.length) expect(a.nodes[0].id).not.toBe(b.nodes[0].id);
  });
});
