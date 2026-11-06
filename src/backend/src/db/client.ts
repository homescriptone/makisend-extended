import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "./schema";

/**
 * The database port: every repository and service depends on this type, never
 * on a driver. It is the common shape of Drizzle's SQLite-compatible drivers
 * (D1, better-sqlite3, libSQL), so the same query code runs on Cloudflare and
 * on a plain SQLite file.
 *
 * `TRunResult` is `unknown` on purpose: D1 and better-sqlite3 return different
 * result shapes for `db.run()`. Use `affectedRows()` when the number of
 * changed rows matters.
 */
export type Database = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>;

/**
 * Providers implemented by an adapter module:
 * - `d1`     — Cloudflare D1 (`db/d1.ts`, the only one the Worker imports);
 * - `sqlite` — a local SQLite file through better-sqlite3 (`db/sqlite.ts`);
 * - `turso`  — libSQL / Turso, local `file:` or remote (`db/turso.ts`).
 *
 * The adapters are separate modules on purpose: importing the SQLite driver
 * would pull a native Node module into the Workers bundle.
 */
export type DatabaseProvider = "d1" | "sqlite" | "turso";

/**
 * Number of rows changed by a `db.run(...)` call, normalized across drivers:
 * D1 reports it under `meta.changes`, better-sqlite3 under `changes`, and
 * libSQL under `rowsAffected`.
 */
export function affectedRows(result: unknown): number {
  if (typeof result !== "object" || result === null) return 0;

  if ("meta" in result) {
    const meta = (result as { meta?: { changes?: number } }).meta;
    return Number(meta?.changes ?? 0);
  }
  if ("changes" in result) {
    return Number((result as { changes?: number }).changes ?? 0);
  }
  if ("rowsAffected" in result) {
    return Number((result as { rowsAffected?: number }).rowsAffected ?? 0);
  }
  return 0;
}
