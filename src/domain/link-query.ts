/**
 * Search language of the link library filter. Free text plus operators:
 *
 *   react hooks            words (all must match)
 *   "server components"    exact phrase
 *   tag:docs  #docs        has tag            -tag:old   doesn't have it
 *   site:github.com        domain (or subdomain)          -site:…
 *   in:Development         inside a collection (and its subcollections); quote names with spaces
 *   is:starred | is:broken | is:unsorted | is:opened | is:unopened | is:pinned
 *   added:7d | added:2w | added:3m | added:1y | added:today
 *
 * Pure and shared by the server (SQL filter) and the client (instant filtering, hints).
 */

export const IS_VALUES = ["starred", "broken", "unsorted", "opened", "unopened", "pinned"] as const;
export type IsValue = (typeof IS_VALUES)[number];

export type LinkQuery = {
  /** Free-text words and phrases (lowercased). */
  terms: string[];
  tags: string[];
  notTags: string[];
  sites: string[];
  notSites: string[];
  /** Collection names (lowercased). */
  collections: string[];
  is: IsValue[];
  /** Only links created within this many days. */
  addedDays: number | null;
};

export const OPERATORS = [
  { key: "tag:", hint: "tem a tag", example: "tag:docs" },
  { key: "site:", hint: "do domínio", example: "site:github.com" },
  { key: "in:", hint: "na coleção", example: "in:Development" },
  { key: "is:", hint: "estado", example: "is:starred" },
  { key: "added:", hint: "adicionado há", example: "added:7d" },
] as const;

export const IS_LABEL: Record<IsValue, string> = {
  starred: "com estrela",
  broken: "quebrados",
  unsorted: "sem coleção",
  opened: "que você já abriu",
  unopened: "que você nunca abriu",
  pinned: "fixados no acesso rápido",
};

export const ADDED_VALUES = [
  { value: "today", label: "hoje" },
  { value: "7d", label: "últimos 7 dias" },
  { value: "30d", label: "últimos 30 dias" },
  { value: "1y", label: "último ano" },
] as const;

const DAYS = { d: 1, w: 7, m: 30, y: 365 } as const;

function parseAdded(v: string): number | null {
  if (v === "today" || v === "hoje") return 1;
  const m = /^(\d{1,4})([dwmy])$/.exec(v);
  return m ? Number(m[1]) * DAYS[m[2] as keyof typeof DAYS] : null;
}

/** Splits on whitespace, keeping "quoted phrases" (and op:"quoted values") together. */
export function tokenize(input: string): string[] {
  const out: string[] = [];
  const re = /(-?[a-z]+:)?"([^"]*)"?|\S+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m[2] !== undefined) out.push(`${m[1] ?? ""}"${m[2]}"`);
    else out.push(m[0]);
  }
  return out;
}

const unquote = (s: string) => s.replace(/^"|"$/g, "");

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function parseLinkQuery(input: string): LinkQuery {
  const q: LinkQuery = { terms: [], tags: [], notTags: [], sites: [], notSites: [], collections: [], is: [], addedDays: null };
  for (const raw of tokenize(input.slice(0, 300)).slice(0, 24)) {
    const neg = raw.startsWith("-") && raw.length > 1;
    const tok = neg ? raw.slice(1) : raw;
    const op = /^([a-z]+):(.*)$/i.exec(tok);
    // Tags keep their accents (they're stored that way, see normalizeTag); only case folds.
    if (tok.startsWith("#") && tok.length > 1) {
      (neg ? q.notTags : q.tags).push(tok.slice(1).toLowerCase());
      continue;
    }
    if (op) {
      const key = op[1].toLowerCase();
      const rawVal = unquote(op[2]).trim();
      const val = normalizeText(rawVal);
      if (!val) continue;
      if (key === "tag") (neg ? q.notTags : q.tags).push(rawVal.toLowerCase().replace(/^#/, ""));
      else if (key === "site" || key === "domain") (neg ? q.notSites : q.sites).push(val.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""));
      else if (key === "in" || key === "col") q.collections.push(val);
      else if (key === "is") {
        if ((IS_VALUES as readonly string[]).includes(val)) q.is.push(val as IsValue);
      }
      else if (key === "added") q.addedDays = parseAdded(val) ?? q.addedDays;
      // Unknown "word:thing" (e.g. a URL scheme) is just text.
      else q.terms.push(normalizeText(unquote(tok)));
      continue;
    }
    const term = normalizeText(unquote(tok)).trim();
    if (term && !neg) q.terms.push(term);
  }
  return q;
}

export function isEmptyQuery(q: LinkQuery): boolean {
  return (
    !q.terms.length && !q.tags.length && !q.notTags.length && !q.sites.length && !q.notSites.length && !q.collections.length && !q.is.length && q.addedDays == null
  );
}

/** Words to highlight in results (free text only). */
export function highlightTerms(q: LinkQuery): string[] {
  return q.terms.filter((t) => t.length > 1);
}

export type MatchableLink = {
  title: string;
  url: string;
  domain: string;
  description: string | null;
  keywords?: string | null;
  tags: string[];
  collectionName: string | null;
  collectionPath?: string[];
  starred: boolean;
  pinned?: boolean;
  healthStatus: string;
  collectionId: string | null;
  myLastOpenedAt: number | null;
  createdAt: number;
};

const siteMatches = (domain: string, site: string) => {
  const d = domain.toLowerCase().replace(/^www\./, "");
  return d === site || d.endsWith(`.${site}`);
};

/** Client-side evaluation of a query (instant filtering of already-loaded links). */
export function matchesLinkQuery(link: MatchableLink, q: LinkQuery, now = Date.now()): boolean {
  if (q.terms.length) {
    const hay = normalizeText([link.title, link.url, link.description ?? "", link.keywords ?? "", link.tags.join(" "), link.collectionName ?? ""].join(" \n "));
    if (!q.terms.every((t) => hay.includes(t))) return false;
  }
  const tags = link.tags.map((t) => t.toLowerCase());
  if (!q.tags.every((t) => tags.includes(t))) return false;
  if (q.notTags.some((t) => tags.includes(t))) return false;
  if (q.sites.length && !q.sites.some((s) => siteMatches(link.domain, s))) return false;
  if (q.notSites.some((s) => siteMatches(link.domain, s))) return false;
  if (q.collections.length) {
    const names = (link.collectionPath ?? (link.collectionName ? [link.collectionName] : [])).map(normalizeText);
    if (!q.collections.every((c) => names.includes(c))) return false;
  }
  for (const v of q.is) {
    if (v === "starred" && !link.starred) return false;
    if (v === "broken" && link.healthStatus !== "broken" && link.healthStatus !== "unreachable") return false;
    if (v === "unsorted" && link.collectionId) return false;
    if (v === "opened" && !link.myLastOpenedAt) return false;
    if (v === "unopened" && link.myLastOpenedAt) return false;
    if (v === "pinned" && !link.pinned) return false;
  }
  if (q.addedDays != null && link.createdAt < now - q.addedDays * 86_400_000) return false;
  return true;
}

/** The token under the caret: what the hint menu completes. */
export function tokenAt(input: string, caret: number): { start: number; end: number; text: string } {
  let start = caret;
  while (start > 0 && !/\s/.test(input[start - 1])) start--;
  let end = caret;
  while (end < input.length && !/\s/.test(input[end])) end++;
  return { start, end, text: input.slice(start, end) };
}

export type KnownValues = { tags: { name: string }[]; collections: string[]; domains: string[] };

/**
 * Drops a trailing operator whose value is still being typed: empty ("tag:") or a strict
 * prefix of a known value ("tag:re" while "react" exists). Filtering by it would flash an
 * empty list on every keystroke.
 */
export function withoutPendingOperator(input: string, known: KnownValues): string {
  const m = /(^|\s)(-?)([a-z]+):("?)([^\s"]*)$/i.exec(input);
  if (!m) return input;
  const key = m[3].toLowerCase();
  const val = m[5].toLowerCase();
  const options =
    key === "tag"
      ? known.tags.map((t) => t.name)
      : key === "in"
        ? known.collections.map((c) => c.toLowerCase())
        : key === "site"
          ? known.domains
          : key === "is"
            ? [...IS_VALUES]
            : key === "added"
              ? ADDED_VALUES.map((v) => v.value)
              : null;
  if (!options) return input;
  const pending = !val || m[4] === '"' || (!options.includes(val) && options.some((o) => o.startsWith(val)));
  return pending ? input.slice(0, input.length - m[0].length).trimEnd() : input;
}
