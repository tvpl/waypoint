import { describe, expect, it } from "vitest";
import { extractMeta, isEmbeddable } from "./html-meta";

describe("extractMeta", () => {
  it("prefers OpenGraph and resolves relative URLs", () => {
    const html = `<html><head><title>Fallback &amp; title</title>
      <meta property="og:title" content="React Flow &#8211; Custom Nodes">
      <meta name="description" content="Plain description">
      <meta property="og:image" content="/img/og.png">
      <link rel="icon" href="/favicon.svg"></head></html>`;
    const m = extractMeta(html, "https://reactflow.dev/learn/x");
    expect(m.title).toBe("React Flow – Custom Nodes");
    expect(m.description).toBe("Plain description");
    expect(m.image).toBe("https://reactflow.dev/img/og.png");
    expect(m.favicon).toBe("https://reactflow.dev/favicon.svg");
  });

  it("ignores javascript: image URLs and falls back to /favicon.ico", () => {
    const m = extractMeta(`<meta property="og:image" content="javascript:alert(1)"><title>x</title>`, "https://a.com/");
    expect(m.image).toBeUndefined();
    expect(m.favicon).toBe("https://a.com/favicon.ico");
  });
});

describe("isEmbeddable", () => {
  it("detects X-Frame-Options and frame-ancestors", () => {
    expect(isEmbeddable({ "x-frame-options": "DENY" })).toBe(false);
    expect(isEmbeddable({ "x-frame-options": "SAMEORIGIN" })).toBe(false);
    expect(isEmbeddable({ "content-security-policy": "default-src 'self'; frame-ancestors 'self'" })).toBe(false);
    expect(isEmbeddable({ "content-security-policy": "frame-ancestors *" })).toBe(true);
    expect(isEmbeddable({})).toBe(true);
  });
});
