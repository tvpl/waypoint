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

/** Query params that only carry locale / tracking info. */
const NOISE_PARAMS = /^(hl|lang|language|locale|lc|ref|utm_[a-z]+|gclid|fbclid)$/i;
/** A leading path segment like /pt-BR/, /en/, /en-us/. */
const LOCALE_SEGMENT = /^\/[a-z]{2}(?:[-_][a-z]{2,4})?(?=\/|$)/i;

type Parts = { host: string; port: string; path: string; search: string };

function parts(raw: string): Parts | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    const port = u.port && !((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) ? `:${u.port}` : "";
    const params = [...u.searchParams].filter(([k]) => !NOISE_PARAMS.test(k)).sort(([a], [b]) => a.localeCompare(b));
    const search = params.length ? `?${new URLSearchParams(params).toString()}` : "";
    // scheme is ignored on purpose: http → https of the same host isn't a meaningful move
    return { host, port, path: u.pathname.replace(/\/+$/, ""), search };
  } catch {
    return null;
  }
}

/**
 * Whether two URLs point to the same place for the user. Ignores http→https, a
 * leading "www.", default ports, trailing slashes, host case, #fragments, locale /
 * tracking query params and an added locale path segment (/docs → /pt-BR/docs).
 * A bookmark of a site's home page that lands elsewhere on the same site counts as
 * the same place too (home pages often bounce to a locale or "getting started" page).
 */
export function sameDestination(original: string, final: string): boolean {
  const a = parts(original);
  const b = parts(final);
  if (!a || !b || a.host !== b.host || a.port !== b.port) return false;
  if (a.path === "" && !a.search) return true;
  if (a.search !== b.search) return false;
  if (a.path === b.path) return true;
  return !LOCALE_SEGMENT.test(a.path) && b.path.replace(LOCALE_SEGMENT, "") === a.path;
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
