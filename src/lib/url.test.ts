import { describe, expect, it } from "vitest";
import { canonicalUrl, pastedUrl, stripTracking } from "./url";

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

describe("pastedUrl", () => {
  it("takes http(s) URLs and bare domains", () => {
    expect(pastedUrl("  https://react.dev/learn  ")).toBe("https://react.dev/learn");
    expect(pastedUrl("http://localhost:3000/x")).toBe("http://localhost:3000/x");
    expect(pastedUrl("react.dev/learn?a=1")).toBe("https://react.dev/learn?a=1");
    expect(pastedUrl("www.example.com.br")).toBe("https://www.example.com.br/");
  });
  it("rejects text, numbers and other schemes", () => {
    expect(pastedUrl("roadmap do produto")).toBeNull();
    expect(pastedUrl("3.14")).toBeNull();
    expect(pastedUrl("javascript:alert(1)")).toBeNull();
    expect(pastedUrl("ftp://example.com")).toBeNull();
    expect(pastedUrl("")).toBeNull();
  });
});
