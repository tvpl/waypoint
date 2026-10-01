/** Minimal, dependency-free extraction of page metadata from HTML. */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? "");
  return out;
}

function absHttp(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

const clean = (s: string | undefined, max: number) => {
  if (!s) return undefined;
  const t = decodeEntities(s).replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : undefined;
};

export type PageMeta = {
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
  siteName?: string;
};

export function extractMeta(html: string, baseUrl: string): PageMeta {
  const head = html.slice(0, 400_000);
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property ?? a.name ?? a.itemprop ?? "").toLowerCase();
    if (key && a.content != null && !(key in meta)) meta[key] = a.content;
  }
  let favicon: string | undefined;
  let iconRank = -1;
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const rel = (a.rel ?? "").toLowerCase();
    const rank = rel.includes("apple-touch-icon") ? 2 : rel.split(/\s+/).includes("icon") ? 3 : -1;
    if (rank > iconRank && a.href) {
      favicon = absHttp(a.href, baseUrl);
      iconRank = rank;
    }
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  return {
    title: clean(meta["og:title"] ?? meta["twitter:title"] ?? titleTag, 300),
    description: clean(meta["og:description"] ?? meta["twitter:description"] ?? meta["description"], 1000),
    image: absHttp(meta["og:image"] ?? meta["og:image:url"] ?? meta["twitter:image"] ?? meta["twitter:image:src"], baseUrl),
    favicon: favicon ?? absHttp("/favicon.ico", baseUrl),
    siteName: clean(meta["og:site_name"] ?? meta["application-name"], 120),
  };
}

/** Whether response headers allow the page to be framed by another origin. */
export function isEmbeddable(headers: Record<string, string>): boolean {
  const xfo = (headers["x-frame-options"] ?? "").toLowerCase();
  if (xfo.includes("deny") || xfo.includes("sameorigin")) return false;
  const csp = headers["content-security-policy"] ?? "";
  const fa = /frame-ancestors([^;]*)/i.exec(csp);
  if (fa) {
    const sources = fa[1].trim().split(/\s+/);
    if (!sources.includes("*")) return false;
  }
  return true;
}
