import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

export interface SqliteDatabaseOptions {
  provider: "sqlite";
  /** File path, or `":memory:"` for a throwaway database. */
  filename: string;
}

/** Concrete instance: `$client` lets the runtime close the connection. */
export type SqliteDatabase = BetterSQLite3Database<typeof schema> & {
  $client: BetterSqlite3.Database;
};

/**
 * Local SQLite adapter (Node runtime, integration tests). Never imported from
 * the Worker entry graph: better-sqlite3 is a native module workerd cannot run.
 */
export function createDatabase(options: SqliteDatabaseOptions): SqliteDatabase {
  const client = new BetterSqlite3(options.filename);
  client.pragma("foreign_keys = ON");
  if (options.filename !== ":memory:") client.pragma("journal_mode = WAL");
  return drizzle(client, { schema });
}
