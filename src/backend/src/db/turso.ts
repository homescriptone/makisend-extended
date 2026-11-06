import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

export interface TursoDatabaseOptions {
  provider: "turso";
  /** `file:` for a local database, `libsql://` or `https://` for a remote one. */
  url: string;
  authToken?: string;
}

/** Concrete instance: `$client` lets the runtime close the connection. */
export type TursoDatabase = LibSQLDatabase<typeof schema> & {
  $client: Client;
};

/**
 * libSQL / Turso adapter. It speaks HTTP, so it can also be used from a Worker;
 * it is kept out of the D1-only entry graph for now.
 */
export function createDatabase(options: TursoDatabaseOptions): TursoDatabase {
  const client = createClient({ url: options.url, authToken: options.authToken });
  return drizzle(client, { schema });
}
