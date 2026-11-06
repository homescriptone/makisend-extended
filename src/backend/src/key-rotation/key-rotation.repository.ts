import { sql } from "drizzle-orm";
import { affectedRows, type Database } from "@/db/client";
import type { EncryptedColumn, IKeyRotationRepository } from "./key-rotation.types";

/**
 * Every encrypted column in the database. A new encrypted column MUST be added here,
 * or a rotation would leave it on the old key (and break it once that key is deleted).
 * Identifiers are constants, never user input: they are interpolated into the SQL.
 */
export const ENCRYPTED_COLUMNS: readonly EncryptedColumn[] = [
  { table: "smtp_config", primaryKey: "id", column: "smtphostname" },
  { table: "smtp_config", primaryKey: "id", column: "smtpusername" },
  { table: "smtp_config", primaryKey: "id", column: "smtppassword" },
  { table: "smtp_config", primaryKey: "id", column: "sender_email" },
  { table: "email_logs", primaryKey: "internalId", column: "to" },
  { table: "email_contents", primaryKey: "email_id", column: "text_body" },
  { table: "email_contents", primaryKey: "email_id", column: "html_body" },
  // The file as base64, encrypted (POST /send-email `attachments`).
  { table: "email_attachments", primaryKey: "id", column: "content" },
];

const quote = (identifier: string) => `"${identifier}"`;
/** Identifiers come from ENCRYPTED_COLUMNS (constants), never from a request. */
const identifier = (name: string) => sql.raw(quote(name));

export class KeyRotationRepository implements IKeyRotationRepository {
  constructor(private readonly db: Database) {}

  async findStale(target: EncryptedColumn, currentPrefix: string, limit: number) {
    const { table, primaryKey, column } = target;
    return this.db.all<{ id: string; value: string }>(sql`
      SELECT ${identifier(primaryKey)} AS id, ${identifier(column)} AS value
      FROM ${identifier(table)}
      WHERE ${identifier(column)} <> '' AND ${identifier(column)} NOT LIKE ${currentPrefix}
      LIMIT ${limit}
    `);
  }

  async countStale(target: EncryptedColumn, currentPrefix: string): Promise<number> {
    const { table, column } = target;
    const row = await this.db.get<{ n: number }>(sql`
      SELECT COUNT(*) AS n FROM ${identifier(table)}
      WHERE ${identifier(column)} <> '' AND ${identifier(column)} NOT LIKE ${currentPrefix}
    `);
    return row?.n ?? 0;
  }

  /**
   * Compare-and-swap: only writes when the cell still holds the value that was
   * re-encrypted, so an edit made in between (e.g. a new SMTP password) is never lost.
   */
  async replace(target: EncryptedColumn, id: string, previous: string, next: string): Promise<boolean> {
    const { table, primaryKey, column } = target;
    const result = await this.db.run(sql`
      UPDATE ${identifier(table)} SET ${identifier(column)} = ${next}
      WHERE ${identifier(primaryKey)} = ${id} AND ${identifier(column)} = ${previous}
    `);
    return affectedRows(result) > 0;
  }
}
