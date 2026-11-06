/**
 * Database port (S2): the same Drizzle migrations and repositories run on a
 * plain SQLite database, with no Miniflare, workerd or D1 involved.
 *
 * The Worker still uses the D1 adapter (covered by the Miniflare tests); this
 * suite is the proof that the data layer no longer depends on it.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { user } from "@/db/schema";
import type { Database } from "@/db/client";
import { createAuth } from "@/lib/auth";
import { claimOwnership, needsSetup, releaseOwnership } from "@/lib/owner-lock";
import { SendEmailRepository } from "@/send-email/send-email.repository";
import { TemplateRepository } from "@/templates/templates.repository";
import { createDatabase as createSqlite, type SqliteDatabase } from "@/db/sqlite";
import { createDatabase as createTurso, type TursoDatabase } from "@/db/turso";

const migrationDir = join(import.meta.dirname, "../../drizzle");

/** The same files `wrangler d1 migrations apply` reads, one statement at a time. */
const migrationStatements = readdirSync(migrationDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .flatMap((file) =>
    readFileSync(join(migrationDir, file), "utf8")
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean),
  );

const EXPECTED_TABLES = [
  "account",
  "apikey",
  "audience_contacts",
  "audience_lists",
  "email_attachments",
  "email_contents",
  "email_histories",
  "email_logs",
  "idempotency_keys",
  "instance_owner",
  "rate_limit",
  "send_rate_limit",
  "session",
  "smtp_config",
  "templates",
  "two_factor",
  "update_check",
  "user",
  "verification",
];

async function tableNames(db: Database) {
  const rows = await db.all<{ name: string }>(sql`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name
  `);
  return rows.map((row) => row.name);
}

describe("SQLite adapter (better-sqlite3)", () => {
  let db: SqliteDatabase;

  beforeEach(() => {
    db = createSqlite({ provider: "sqlite", filename: ":memory:" });
    for (const statement of migrationStatements) db.$client.exec(statement);
  });

  afterEach(() => {
    db.$client.close();
  });

  it("applies every Drizzle migration", async () => {
    expect(await tableNames(db)).toEqual(EXPECTED_TABLES);
  });

  it("round-trips the send-email and template repositories", async () => {
    await db.insert(user).values({ id: "user-1", name: "Owner", email: "owner@example.com" });

    const emails = new SendEmailRepository(db);
    await emails.createPendingEmailLog("email-1", "user-1", "to@example.com", "Hello");
    await emails.saveEmailContent("email-1", {
      text: "plain text",
      html: "<p>plain text</p>",
      smtpConfigId: "smtp-1",
    });
    await emails.saveEmailAttachments("email-1", [
      { filename: "a.txt", contentType: "text/plain", content: "ciphertext" },
    ]);
    await emails.completeEmailLog("email-1", "smtp-id", "2026-01-01T00:00:00.000Z", 42);

    expect(await emails.getEmailForSending("email-1")).toEqual({
      to: "to@example.com",
      subject: "Hello",
      text: "plain text",
      html: "<p>plain text</p>",
      smtpConfigId: "smtp-1",
    });
    expect(await emails.getEmailAttachments("email-1")).toEqual([
      { filename: "a.txt", contentType: "text/plain", content: "ciphertext" },
    ]);

    const templates = new TemplateRepository(db);
    const created = await templates.create("user-1", {
      name: "Welcome",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
    });
    expect(await templates.findById(created.id)).toMatchObject({
      id: created.id,
      userId: "user-1",
      name: "Welcome",
    });
    expect(await templates.findByUserId("user-1")).toHaveLength(1);
  });

  it("runs the single-account owner lock", async () => {
    expect(await needsSetup(db)).toBe(true);
    expect(await claimOwnership(db)).toBe(true);
    expect(await claimOwnership(db)).toBe(false);
    expect(await needsSetup(db)).toBe(true);

    await releaseOwnership(db);
    expect(await claimOwnership(db)).toBe(true);
  });

  it("runs Better Auth on the shared database", async () => {
    const auth = createAuth(
      {
        BETTER_AUTH_SECRET: "test-secret-0123456789-0123456789-abcdef",
        BETTER_AUTH_URL: "http://localhost:8787",
        FRONTEND_URL: "http://localhost:4321",
        RATE_LIMIT: "off",
      },
      db,
    );

    const created = await auth.api.signUpEmail({
      body: { email: "admin@example.com", password: "password123", name: "Admin" },
    });
    expect(created.user.email).toBe("admin@example.com");
    expect(await needsSetup(db)).toBe(false);

    // The owner lock runs inside Better Auth's own creation hook, on SQLite too.
    await expect(
      auth.api.signUpEmail({
        body: { email: "other@example.com", password: "password123", name: "Other" },
      }),
    ).rejects.toThrow();
  });
});

describe("Turso adapter (libSQL, local file)", () => {
  let dir: string;
  let db: TursoDatabase;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "makisend-libsql-"));
    db = createTurso({ provider: "turso", url: `file:${join(dir, "test.db")}` });
    for (const statement of migrationStatements) await db.$client.execute(statement);
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("applies the same migrations and reads through a repository", async () => {
    expect(await tableNames(db)).toEqual(EXPECTED_TABLES);
    await db.insert(user).values({ id: "user-1", name: "Owner", email: "owner@example.com" });

    const templates = new TemplateRepository(db);
    const created = await templates.create("user-1", {
      name: "Welcome",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
    });

    expect(await templates.findById(created.id)).toMatchObject({ name: "Welcome" });
  });
});
