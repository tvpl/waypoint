/**
 * Pure classification of a link check (no network, no DB) — see services/link-health.ts.
 *
 *   2xx (same destination)              → ok
 *   2xx after redirect to another URL   → redirect (finalUrl kept)
 *   401/403 (login wall, bot blocking)  → ok — the page exists, we just can't read it
 *   404/410/451, other 4xx, 5xx          → broken
 *   408/429, timeouts, DNS, TLS, SSRF   → unreachable (couldn't verify)
 */
import "server-only";
import type { LinkHealth } from "../db/schema";

export type HealthVerdict = { status: LinkHealth; code: number | null; finalUrl: string | null };

/** HEAD responses that deserve a second try with GET (servers that mishandle HEAD). */
export function shouldRetryWithGet(status: number): boolean {
  return status === 405 || status === 403 || status === 501 || status === 400 || status === 406 || status >= 500;
}

function canonical(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    const port = u.port && !((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) ? `:${u.port}` : "";
    const path = u.pathname.replace(/\/+$/, "") || "";
    // scheme is ignored on purpose: http → https of the same host isn't a meaningful move
    return `${host}${port}${path}${u.search}`;
  } catch {
    return null;
  }
}

/**
 * Whether two URLs point to the same place for the user: ignores http→https,
 * a leading "www.", default ports, trailing slashes, host case and #fragments.
 */
export function sameDestination(a: string, b: string): boolean {
  const ca = canonical(a);
  const cb = canonical(b);
  return ca != null && ca === cb;
}

export function classifyResponse(input: { originalUrl: string; finalUrl: string; status: number; headers?: Record<string, string> }): HealthVerdict {
  const { originalUrl, finalUrl, status } = input;
  const moved = !sameDestination(originalUrl, finalUrl);
  // Cloudflare & co. answer bots with a challenge page; the site itself is up.
  if (input.headers?.["cf-mitigated"] === "challenge") return { status: "ok", code: status, finalUrl: null };
  if (status >= 200 && status < 300) return moved ? { status: "redirect", code: status, finalUrl } : { status: "ok", code: status, finalUrl: null };
  if (status >= 300 && status < 400) {
    // a 3xx that safeFetch didn't follow (no Location) or 304
    return moved ? { status: "redirect", code: status, finalUrl } : { status: "ok", code: status, finalUrl: null };
  }
  if (status === 401 || status === 403) return { status: "ok", code: status, finalUrl: moved ? finalUrl : null };
  if (status === 408 || status === 429) return { status: "unreachable", code: status, finalUrl: null };
  if (status >= 400) return { status: "broken", code: status, finalUrl: null };
  return { status: "unreachable", code: status || null, finalUrl: null };
}

/** Network / DNS / TLS / timeout / SSRF-refused errors. */
export function classifyError(): HealthVerdict {
  return { status: "unreachable", code: null, finalUrl: null };
}
