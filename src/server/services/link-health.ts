import "server-only";
import { and, eq, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "../db";
import { safeFetch, UnsafeUrlError } from "../lib/safe-fetch";
import { classifyError, classifyResponse, shouldRetryWithGet, type HealthVerdict } from "../lib/link-status";
import { descendantIds } from "./links";

/** A link checked less than this long ago is skipped unless forced. */
export const HEALTH_TTL_MS = 24 * 60 * 60 * 1000;
/** Hard cap of links per call (the UI asks for smaller batches to report progress). */
export const MAX_PER_CALL = 200;
const CONCURRENCY = 4;
/** Minimum gap between two requests to the same host. */
const HOST_GAP_MS = 1200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Checks one URL. Never throws. HEAD first, GET (small body) when HEAD is refused or fails. */
export async function checkLink(url: string): Promise<HealthVerdict> {
  let headStatus: number | null = null;
  try {
    const res = await safeFetch(url, { method: "HEAD", timeoutMs: 6000, maxBytes: 0 });
    headStatus = res.status;
    if (!shouldRetryWithGet(res.status)) return classifyResponse({ originalUrl: url, finalUrl: res.url, status: res.status, headers: res.headers });
  } catch (e) {
    // SSRF refusals won't change with another method
    if (isRefused(e)) return classifyError();
  }
  try {
    const res = await safeFetch(url, { method: "GET", timeoutMs: 8000, maxBytes: 16_384 });
    return classifyResponse({ originalUrl: url, finalUrl: res.url, status: res.status, headers: res.headers });
  } catch {
    return headStatus != null ? classifyResponse({ originalUrl: url, finalUrl: url, status: headStatus }) : classifyError();
  }
}

/** SSRF guard refusals (URL-level or at DNS resolution, possibly wrapped by undici). */
function isRefused(e: unknown): boolean {
  const err = e as { code?: string; cause?: unknown } | null;
  return e instanceof UnsafeUrlError || err?.code === "EBLOCKED" || (!!err?.cause && isRefused(err.cause));
}

export type HealthSelector = {
  ids?: string[];
  collectionId?: string | null;
  /** Re-check even when checked within HEALTH_TTL_MS. */
  force?: boolean;
  /**
   * With `force`, only links checked before this instant are picked — lets a client
   * page through a forced re-check of a big collection with repeated calls.
   */
  startedAt?: number;
  /** Collections the caller can't see (private collections of others). */
  hiddenCollections?: Set<string>;
  limit?: number;
  /** Only links checked longer ago than this (default HEALTH_TTL_MS). */
  staleAfterMs?: number;
};

export type HealthSummary = {
  checked: number;
  ok: number;
  broken: number;
  redirect: number;
  unreachable: number;
  /** Links matching the selector still waiting to be checked. */
  remaining: number;
  results: { id: string; status: HealthVerdict["status"]; code: number | null; finalUrl: string | null; checkedAt: number }[];
};

function selectorConds(workspaceId: string, sel: HealthSelector, now: number): SQL[] {
  const f = schema.favorites;
  const conds: SQL[] = [eq(f.workspaceId, workspaceId), isNull(f.archivedAt)];
  if (sel.ids) conds.push(inArray(f.id, sel.ids.length ? sel.ids : ["-"]));
  if (sel.collectionId) conds.push(inArray(f.collectionId, descendantIds(sel.collectionId)));
  const hidden = [...(sel.hiddenCollections ?? [])];
  if (hidden.length) conds.push(or(isNull(f.collectionId), sql`${f.collectionId} not in (${sql.join(hidden.map((h) => sql`${h}`), sql`, `)})`)!);
  const cutoff = sel.force ? (sel.startedAt ?? now) : now - (sel.staleAfterMs ?? HEALTH_TTL_MS);
  conds.push(or(isNull(f.healthCheckedAt), lt(f.healthCheckedAt, new Date(cutoff)))!);
  return conds;
}

/**
 * Checks links of a workspace with bounded concurrency and a per-host politeness gap.
 * Stops picking new links once `deadlineMs` has passed (the rest shows up in `remaining`).
 */
export async function checkFavorites(workspaceId: string, sel: HealthSelector, opts: { deadlineMs?: number } = {}): Promise<HealthSummary> {
  const db = getDb();
  const now = Date.now();
  const limit = Math.max(1, Math.min(sel.limit ?? MAX_PER_CALL, MAX_PER_CALL));
  const where = and(...selectorConds(workspaceId, sel, now));
  const todo = db
    .select({ id: schema.favorites.id, url: schema.favorites.url })
    .from(schema.favorites)
    .where(where)
    .orderBy(sql`${schema.favorites.healthCheckedAt} is not null`, schema.favorites.healthCheckedAt, schema.favorites.createdAt)
    .limit(limit)
    .all();

  const summary: HealthSummary = { checked: 0, ok: 0, broken: 0, redirect: 0, unreachable: 0, remaining: 0, results: [] };
  const deadline = now + (opts.deadlineMs ?? 25_000);
  const queue = todo.map((t) => ({ ...t, host: hostOf(t.url) }));
  const busy = new Set<string>();

  const worker = async () => {
    while (queue.length && Date.now() < deadline) {
      const t = Date.now();
      const idx = queue.findIndex((q) => !busy.has(q.host) && (nextSlot.get(q.host) ?? 0) <= t);
      if (idx < 0) {
        const waits = queue.map((q) => (busy.has(q.host) ? 150 : (nextSlot.get(q.host) ?? 0) - t));
        await sleep(Math.max(50, Math.min(...waits)));
        continue;
      }
      const item = queue.splice(idx, 1)[0];
      busy.add(item.host);
      let verdict: HealthVerdict;
      try {
        verdict = await checkLink(item.url);
      } catch {
        verdict = classifyError();
      } finally {
        busy.delete(item.host);
        nextSlot.set(item.host, Date.now() + HOST_GAP_MS);
      }
      const checkedAt = new Date();
      db.update(schema.favorites)
        .set({ healthStatus: verdict.status, healthCode: verdict.code, healthFinalUrl: verdict.finalUrl, healthCheckedAt: checkedAt })
        .where(eq(schema.favorites.id, item.id))
        .run();
      summary.checked++;
      summary[verdict.status === "unknown" ? "unreachable" : verdict.status]++;
      summary.results.push({ id: item.id, ...verdict, checkedAt: checkedAt.getTime() });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

  summary.remaining =
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.favorites)
      .where(and(...selectorConds(workspaceId, sel, now)))
      .get()?.n ?? 0;
  pruneSlots();
  return summary;
}

/** Marks a redirecting link as moved to its final URL (after the user accepts it). */
export function markHealthy(favoriteId: string, code: number | null = 200) {
  getDb()
    .update(schema.favorites)
    .set({ healthStatus: "ok", healthCode: code, healthFinalUrl: null, healthCheckedAt: new Date() })
    .where(eq(schema.favorites.id, favoriteId))
    .run();
}

/** Clears the health state (e.g. after the URL was edited by hand). */
export function resetHealth(favoriteId: string) {
  getDb()
    .update(schema.favorites)
    .set({ healthStatus: "unknown", healthCode: null, healthFinalUrl: null, healthCheckedAt: null })
    .where(eq(schema.favorites.id, favoriteId))
    .run();
}

// per-process politeness bookkeeping (shared across concurrent calls)
const nextSlot = new Map<string, number>();
function pruneSlots() {
  if (nextSlot.size < 2000) return;
  const now = Date.now();
  for (const [h, t] of nextSlot) if (t < now) nextSlot.delete(h);
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url;
  }
}

// ------------------------------------------------------------------ background sweep

/** Links not checked for this long are re-checked in the background. */
export const SWEEP_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;
const SWEEP_BATCH = 12;
const lastSweep = new Map<string, number>();

/**
 * Keeps link health fresh without a scheduler: when someone opens the library or Início,
 * a small batch of the stalest links (>7 days) is checked after the response is sent
 * (Next's `after`). At most once an hour per workspace and process.
 */
export async function sweepStaleLinks(workspaceId: string): Promise<HealthSummary | null> {
  const now = Date.now();
  if (now - (lastSweep.get(workspaceId) ?? 0) < SWEEP_EVERY_MS) return null;
  lastSweep.set(workspaceId, now);
  return checkFavorites(workspaceId, { staleAfterMs: SWEEP_STALE_MS, limit: SWEEP_BATCH }, { deadlineMs: 20_000 });
}

/** Links that started failing in the last week (for the "pede atenção" signal). */
export function recentlyBroken(workspaceId: string, hiddenCollections: Set<string>): number {
  const f = schema.favorites;
  const hidden = [...hiddenCollections];
  return (
    getDb()
      .select({ n: sql<number>`count(*)` })
      .from(f)
      .where(
        and(
          eq(f.workspaceId, workspaceId),
          isNull(f.archivedAt),
          inArray(f.healthStatus, ["broken", "unreachable"]),
          sql`${f.healthCheckedAt} > ${Date.now() - SWEEP_STALE_MS}`,
          hidden.length ? or(isNull(f.collectionId), sql`${f.collectionId} not in (${sql.join(hidden.map((h) => sql`${h}`), sql`, `)})`) : undefined,
        ),
      )
      .get()?.n ?? 0
  );
}
