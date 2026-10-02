import { describe, expect, it } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit per window, then resets", () => {
    const t = 1_000_000;
    expect(rateLimit("k", 2, 1000, t).ok).toBe(true);
    expect(rateLimit("k", 2, 1000, t + 1).ok).toBe(true);
    const third = rateLimit("k", 2, 1000, t + 2);
    expect(third.ok).toBe(false);
    expect(third.retryAfter).toBe(1);
    expect(rateLimit("k", 2, 1000, t + 1001).ok).toBe(true);
  });
});
