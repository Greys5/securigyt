/**
 * SQLite-backed JSON cache.
 *
 * Every collector writes through here so a page load hits GitHub only when the
 * cached entry is missing or older than its scope TTL. The Refresh button
 * invalidates a scope and forces a refetch.
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type CacheScope =
  | "org-meta"
  | "org-repos"
  | "org-rulesets"
  | "org-apps"
  | "org-pats"
  | "org-hooks"
  | "org-members"
  | "org-alerts"
  | "org-billing"
  | "org-audit"
  | "repo-detail"
  | "repo-workflows"
  | "repo-collaborators"
  | "repo-rulesets"
  | "repo-codeowners"
  | "repo-security";

/** Freshness budget per scope, in milliseconds. */
const TTL_MS: Record<CacheScope, number> = {
  "org-meta": 30 * 60_000,
  "org-repos": 15 * 60_000,
  "org-rulesets": 30 * 60_000,
  "org-apps": 30 * 60_000,
  "org-pats": 30 * 60_000,
  "org-hooks": 30 * 60_000,
  "org-members": 30 * 60_000,
  "org-alerts": 10 * 60_000,
  "org-billing": 60 * 60_000,
  "org-audit": 10 * 60_000,
  "repo-detail": 15 * 60_000,
  "repo-workflows": 15 * 60_000,
  "repo-collaborators": 15 * 60_000,
  "repo-rulesets": 15 * 60_000,
  "repo-codeowners": 15 * 60_000,
  "repo-security": 10 * 60_000,
};

export type CachedValue<T> = {
  value: T;
  fetchedAt: number;
  stale: boolean;
};

const DB_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DB_DIR, "cache.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cache (
      scope      TEXT NOT NULL,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      PRIMARY KEY (scope, key)
    );
  `);
  return db;
}

type Row = { value: string; fetched_at: number };

export function readCache<T>(scope: CacheScope, key: string): CachedValue<T> | null {
  const row = getDb()
    .prepare<[string, string], Row>("SELECT value, fetched_at FROM cache WHERE scope = ? AND key = ?")
    .get(scope, key);
  if (!row) return null;

  try {
    return {
      value: JSON.parse(row.value) as T,
      fetchedAt: row.fetched_at,
      stale: Date.now() - row.fetched_at > TTL_MS[scope],
    };
  } catch {
    // Corrupted entry — treat as a miss and let the caller refetch.
    return null;
  }
}

export function writeCache<T>(scope: CacheScope, key: string, value: T): number {
  const fetchedAt = Date.now();
  getDb()
    .prepare(
      `INSERT INTO cache (scope, key, value, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at`,
    )
    .run(scope, key, JSON.stringify(value), fetchedAt);
  return fetchedAt;
}

/** Drop one key, a whole scope, or the entire cache. */
export function invalidate(scope?: CacheScope, key?: string): number {
  if (!scope) return getDb().prepare("DELETE FROM cache").run().changes;
  if (!key) return getDb().prepare("DELETE FROM cache WHERE scope = ?").run(scope).changes;
  return getDb().prepare("DELETE FROM cache WHERE scope = ? AND key = ?").run(scope, key).changes;
}

/**
 * Return the cached value when fresh, otherwise run `fetcher` and cache it.
 * If the fetch fails but a stale entry exists, the stale entry is served.
 */
export async function cached<T>(
  scope: CacheScope,
  key: string,
  fetcher: () => Promise<T>,
  opts: { force?: boolean } = {},
): Promise<CachedValue<T>> {
  const hit = readCache<T>(scope, key);
  if (hit && !hit.stale && !opts.force) return hit;

  try {
    const value = await fetcher();
    const fetchedAt = writeCache(scope, key, value);
    return { value, fetchedAt, stale: false };
  } catch (error) {
    if (hit) return hit;
    throw error;
  }
}

/** Newest `fetched_at` across a scope — powers the "last updated" label. */
export function scopeFetchedAt(scope: CacheScope): number | null {
  const row = getDb()
    .prepare<[string], { fetched_at: number | null }>(
      "SELECT MAX(fetched_at) AS fetched_at FROM cache WHERE scope = ?",
    )
    .get(scope);
  return row?.fetched_at ?? null;
}
