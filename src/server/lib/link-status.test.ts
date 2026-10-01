import { describe, expect, it } from "vitest";
import { classifyError, classifyResponse, sameDestination, shouldRetryWithGet } from "./link-status";

const u = "https://example.com/docs/page";
const res = (status: number, finalUrl = u, headers?: Record<string, string>) => classifyResponse({ originalUrl: u, finalUrl, status, headers });

describe("sameDestination", () => {
  it.each([
    ["https://example.com/docs/", "https://example.com/docs"],
    ["http://example.com/docs", "https://example.com/docs"],
    ["https://www.example.com/a", "https://example.com/a"],
    ["https://EXAMPLE.com/a", "https://example.com/a"],
    ["https://example.com:443/a", "https://example.com/a"],
    ["https://example.com/a#intro", "https://example.com/a"],
    ["https://example.com", "https://example.com/"],
    ["https://developer.mozilla.org/", "https://developer.mozilla.org/pt-BR/"],
    ["https://web.dev/", "https://web.dev/?hl=pt-br"],
    ["https://github.com/", "https://github.com/?locale=pt-br"],
    ["https://example.com/docs/guide", "https://example.com/pt-BR/docs/guide"],
    ["https://example.com/a?x=1&utm_source=x", "https://example.com/a?x=1"],
    ["https://modelcontextprotocol.io/", "https://modelcontextprotocol.io/docs/getting-started/intro"],
  ])("treats %s and %s as the same place", (a, b) => expect(sameDestination(a, b)).toBe(true));

  it.each([
    ["https://example.com/docs", "https://example.com/docs/v2"],
    ["https://example.com/a?x=1", "https://example.com/a?x=2"],
    ["https://example.com/a", "https://other.dev/a"],
    ["https://example.com:8443/a", "https://example.com/a"],
    ["https://example.com/a", "not a url"],
    ["https://docs.konghq.com/", "https://developer.konghq.com/"],
    ["https://example.com/docs/guide", "https://example.com/pt-BR/docs/other"],
    ["https://example.com/en/docs", "https://example.com/pt/docs"],
    ["https://example.com/?page=2", "https://example.com/"],
  ])("treats %s and %s as different", (a, b) => expect(sameDestination(a, b)).toBe(false));
});

describe("classifyResponse", () => {
  it("2xx at the same URL is ok", () => {
    expect(res(200)).toEqual({ status: "ok", code: 200, finalUrl: null });
    expect(res(204, "http://www.example.com/docs/page/")).toEqual({ status: "ok", code: 204, finalUrl: null });
  });

  it("2xx after moving to another URL is a redirect and keeps the final URL", () => {
    expect(res(200, "https://example.com/new-docs")).toEqual({ status: "redirect", code: 200, finalUrl: "https://example.com/new-docs" });
  });

  it("an unfollowed 3xx is ok unless it points elsewhere", () => {
    expect(res(304).status).toBe("ok");
    expect(res(301, "https://example.org/").status).toBe("redirect");
  });

  it.each([404, 410, 451, 400, 500, 502, 503])("%i is broken", (code) => expect(res(code)).toEqual({ status: "broken", code, finalUrl: null }));

  it.each([401, 403])("%i (login wall / bot blocking) counts as ok", (code) => expect(res(code).status).toBe("ok"));

  it.each([408, 429])("%i means we couldn't verify", (code) => expect(res(code).status).toBe("unreachable"));

  it("a bot challenge is not a broken link", () => {
    expect(res(503, u, { "cf-mitigated": "challenge" }).status).toBe("ok");
  });

  it("network / SSRF errors are unreachable", () => {
    expect(classifyError()).toEqual({ status: "unreachable", code: null, finalUrl: null });
  });
});

describe("shouldRetryWithGet", () => {
  it.each([405, 403, 501, 400, 500, 503])("retries HEAD %i with GET", (c) => expect(shouldRetryWithGet(c)).toBe(true));
  it.each([200, 301, 404, 410, 401, 429])("keeps HEAD %i", (c) => expect(shouldRetryWithGet(c)).toBe(false));
});
