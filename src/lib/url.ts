/**
 * Canonical form of a URL for duplicate detection — not for storage or display.
 * Two links are "the same page" when these match: scheme (http/https), "www.", default
 * ports, trailing slashes, tracking parameters, parameter order and empty fragments
 * are ignored. Meaningful fragments (#section, SPA routes "#/x") are kept.
 */
const TRACKING = /^(utm_[a-z_]+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|yclid|twclid|_hsenc|_hsmi|mkt_tok|ref_src|ref_url|si|spm|share_source|vero_id|oly_[a-z_]+)$/i;

export function canonicalUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return raw.trim().toLowerCase();
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const port = u.port && !["80", "443"].includes(u.port) ? `:${u.port}` : "";
  const path = u.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "";
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  const hash = u.hash && u.hash !== "#" ? u.hash : "";
  return `${host}${port}${path}${query}${hash}`;
}

/** Removes tracking parameters from a URL but otherwise keeps it as typed (for saving). */
export function stripTracking(raw: string): string {
  try {
    const u = new URL(raw);
    let changed = false;
    for (const k of [...u.searchParams.keys()]) {
      if (TRACKING.test(k)) {
        u.searchParams.delete(k);
        changed = true;
      }
    }
    return changed ? u.toString() : raw;
  } catch {
    return raw;
  }
}

/**
 * The http(s) URL in pasted text, or null. Accepts a bare domain ("example.com/page") and
 * returns it with https://; anything with spaces or another scheme is not a URL.
 */
export function pastedUrl(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  const candidate = /^https?:\/\//i.test(t) ? t : /^([\w-]+\.)+[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(t) ? `https://${t}` : null;
  if (!candidate) return null;
  try {
    const u = new URL(candidate);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}
