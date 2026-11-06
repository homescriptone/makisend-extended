import { and, count, desc, eq } from "drizzle-orm";
import { audienceContacts, audienceLists } from "@/db/schema";
import type { Database } from "@/db/client";
import type {
  AudienceContactInput,
  AudienceContactRecord,
  AudienceListRecord,
  AudienceListWithCount,
  CreateAudienceListInput,
  IAudienceRepository,
  ImportContactsResult,
  UpdateAudienceListInput,
} from "./audiences.types";

export class AudienceRepository implements IAudienceRepository {
  constructor(private readonly db: Database) {}

  async createList(userId: string, input: CreateAudienceListInput): Promise<AudienceListRecord> {
    const [row] = await this.db
      .insert(audienceLists)
      .values({
        userId,
        name: input.name,
        description: input.description ?? null,
      })
      .returning();
    return this.toList(row);
  }

  async findListsByUserId(userId: string): Promise<AudienceListWithCount[]> {
    const rows = await this.db
      .select({
        id: audienceLists.id,
        userId: audienceLists.userId,
        name: audienceLists.name,
        description: audienceLists.description,
        createdAt: audienceLists.createdAt,
        updatedAt: audienceLists.updatedAt,
        contactCount: count(audienceContacts.id),
      })
      .from(audienceLists)
      .leftJoin(audienceContacts, eq(audienceContacts.listId, audienceLists.id))
      .where(eq(audienceLists.userId, userId))
      .groupBy(audienceLists.id)
      .orderBy(desc(audienceLists.updatedAt));

    return rows.map((row) => ({
      ...this.toList(row),
      contactCount: Number(row.contactCount),
    }));
  }

  async findListById(id: string): Promise<AudienceListRecord | null> {
    const [row] = await this.db
      .select()
      .from(audienceLists)
      .where(eq(audienceLists.id, id))
      .limit(1);
    return row ? this.toList(row) : null;
  }

  async updateList(id: string, input: UpdateAudienceListInput): Promise<AudienceListRecord> {
    const [row] = await this.db
      .update(audienceLists)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      })
      .where(eq(audienceLists.id, id))
      .returning();
    return this.toList(row);
  }

  async deleteList(id: string): Promise<void> {
    await this.db.delete(audienceLists).where(eq(audienceLists.id, id));
  }

  async listContacts(listId: string): Promise<AudienceContactRecord[]> {
    const rows = await this.db
      .select()
      .from(audienceContacts)
      .where(eq(audienceContacts.listId, listId))
      .orderBy(desc(audienceContacts.createdAt));
    return rows.map((row) => this.toContact(row));
  }

  async deleteContact(listId: string, contactId: string): Promise<boolean> {
    const result = await this.db
      .delete(audienceContacts)
      .where(and(eq(audienceContacts.id, contactId), eq(audienceContacts.listId, listId)))
      .returning({ id: audienceContacts.id });
    return result.length > 0;
  }

  async importContacts(listId: string, contacts: AudienceContactInput[]): Promise<ImportContactsResult> {
    let imported = 0;
    let skipped = 0;
    for (const contact of contacts) {
      const inserted = await this.db
        .insert(audienceContacts)
        .values({
          listId,
          email: contact.email,
          name: contact.name ?? null,
          variables: contact.variables ? JSON.stringify(contact.variables) : null,
        })
        .onConflictDoNothing({
          target: [audienceContacts.listId, audienceContacts.email],
        })
        .returning({ id: audienceContacts.id });
      if (inserted.length > 0) imported++;
      else skipped++;
    }
    return { imported, skipped, total: contacts.length };
  }

  private toList(row: typeof audienceLists.$inferSelect): AudienceListRecord {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      description: row.description ?? null,
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
    };
  }

  private toContact(row: typeof audienceContacts.$inferSelect): AudienceContactRecord {
    let variables: Record<string, string> | null = null;
    if (typeof row.variables === "string" && row.variables) {
      try {
        variables = JSON.parse(row.variables) as Record<string, string>;
      } catch {
        variables = null;
      }
    }
    return {
      id: row.id,
      listId: row.listId,
      email: row.email,
      name: row.name ?? null,
      variables,
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    };
  }
}
