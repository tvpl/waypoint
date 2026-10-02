import { describe, expect, it } from "vitest";
import { canonicalUrl, stripTracking } from "./url";

describe("canonicalUrl", () => {
  it("treats cosmetic variants as the same page", () => {
    const a = canonicalUrl("https://www.React.dev/learn/?utm_source=x&b=2&a=1#");
    expect(a).toBe("react.dev/learn?a=1&b=2");
    expect(canonicalUrl("http://react.dev:80/learn?a=1&b=2&fbclid=z")).toBe(a);
    expect(canonicalUrl("react.dev/learn/?b=2&a=1")).toBe(a);
  });
  it("keeps what changes the page", () => {
    expect(canonicalUrl("https://react.dev/learn?a=2")).not.toBe(canonicalUrl("https://react.dev/learn?a=1"));
    expect(canonicalUrl("https://app.dev/#/inbox")).toBe("app.dev#/inbox");
    expect(canonicalUrl("https://dev.to:8080/x")).toBe("dev.to:8080/x");
  });
});

describe("stripTracking", () => {
  it("drops only tracking parameters", () => {
    expect(stripTracking("https://a.dev/p?utm_source=n&id=3&gclid=1")).toBe("https://a.dev/p?id=3");
    expect(stripTracking("https://a.dev/p?id=3")).toBe("https://a.dev/p?id=3");
  });
});
