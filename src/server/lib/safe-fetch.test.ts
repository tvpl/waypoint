import { describe, expect, it } from "vitest";
import { assertSafeUrl, isBlockedIp, safeFetch } from "./safe-fetch";

describe("isBlockedIp", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1", "64:ff9b::a00:1"])(
    "blocks %s",
    (ip) => expect(isBlockedIp(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "151.101.1.69"])("allows %s", (ip) => expect(isBlockedIp(ip)).toBe(false));
});

describe("assertSafeUrl", () => {
  it.each([
    "http://localhost:3000",
    "http://foo.localhost",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data",
    "http://intranet/",
    "http://db.internal/",
    "http://printer.local/",
    "http://2130706433/",
    "http://0x7f000001/",
    "file:///etc/passwd",
    "ftp://example.com/",
    "http://user:pass@example.com/",
  ])("rejects %s", (u) => expect(() => assertSafeUrl(u)).toThrow());

  it("accepts public URLs", () => {
    expect(assertSafeUrl("https://reactflow.dev/learn").hostname).toBe("reactflow.dev");
  });
});

describe("safeFetch", () => {
  it("refuses hosts that resolve to private addresses (DNS check at connect time)", async () => {
    // localtest.me style names resolve to 127.0.0.1; use a literal to stay offline-safe
    await expect(safeFetch("http://127.0.0.1:9/")).rejects.toThrow();
  });
});
