import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import type { Database } from "./client";

export interface D1DatabaseOptions {
  provider: "d1";
  binding: D1Database;
}

/**
 * Cloudflare D1 adapter.
 *
 * Keep this module free of Node-only imports: it is reachable from the Worker
 * entry point through the container and the queue/workflow handlers.
 */
export function createDatabase(options: D1DatabaseOptions): Database {
  return drizzle(options.binding, { schema });
}
