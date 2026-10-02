// Regression: custom design tokens must survive class merging (see cn in utils.ts).
import { expect, it } from "vitest";
import { cn } from "@/lib/utils";
it("keeps token sizes next to colors", () => {
  expect(cn("text-caption text-muted")).toBe("text-caption text-muted");
  expect(cn("text-body", "text-caption")).toBe("text-caption");
  expect(cn("rounded-card", "rounded-xl")).toBe("rounded-xl");
  expect(cn("shadow-rest", "shadow-pop")).toBe("shadow-pop");
  expect(cn("shadow-pop shadow-accent/20")).toBe("shadow-pop shadow-accent/20");
});
