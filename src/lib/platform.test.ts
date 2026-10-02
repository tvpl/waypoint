import { describe, expect, it } from "vitest";
import { formatKeys } from "./platform";

describe("formatKeys", () => {
  it("keeps Apple glyphs on Mac", () => {
    expect(formatKeys("⇧⌘G", true)).toBe("⇧⌘G");
  });
  it("spells out modifiers elsewhere", () => {
    expect(formatKeys("⌘K", false)).toBe("Ctrl+K");
    expect(formatKeys("⇧⌘G", false)).toBe("Ctrl+Shift+G");
    expect(formatKeys("⌘Z · ⇧⌘Z", false)).toBe("Ctrl+Z · Ctrl+Shift+Z");
    expect(formatKeys("⌥⇧L", false)).toBe("Alt+Shift+L");
    expect(formatKeys("⌘↵", false)).toBe("Ctrl+Enter");
    expect(formatKeys("Enter · duplo clique", false)).toBe("Enter · duplo clique");
  });
});
