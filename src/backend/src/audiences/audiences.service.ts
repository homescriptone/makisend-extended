import { AppError } from "@/core/errors";
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

export class AudienceService {
  constructor(private readonly repository: IAudienceRepository) {}

  async createList(userId: string, input: CreateAudienceListInput): Promise<AudienceListRecord> {
    return this.repository.createList(userId, {
      name: input.name.trim(),
      description: normalizeOptional(input.description),
    });
  }

  async listLists(userId: string): Promise<AudienceListWithCount[]> {
    return this.repository.findListsByUserId(userId);
  }

  async getList(id: string, userId: string): Promise<AudienceListRecord> {
    return this.requireOwnedList(id, userId);
  }

  async updateList(id: string, userId: string, input: UpdateAudienceListInput): Promise<AudienceListRecord> {
    await this.requireOwnedList(id, userId);
    return this.repository.updateList(id, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: normalizeOptional(input.description) } : {}),
    });
  }

  async deleteList(id: string, userId: string): Promise<void> {
    await this.requireOwnedList(id, userId);
    await this.repository.deleteList(id);
  }

  async listContacts(listId: string, userId: string): Promise<AudienceContactRecord[]> {
    await this.requireOwnedList(listId, userId);
    return this.repository.listContacts(listId);
  }

  async deleteContact(listId: string, contactId: string, userId: string): Promise<void> {
    await this.requireOwnedList(listId, userId);
    const deleted = await this.repository.deleteContact(listId, contactId);
    if (!deleted) throw new AppError(404, "Contact not found");
  }

  async importContacts(
    listId: string,
    userId: string,
    contacts: AudienceContactInput[],
  ): Promise<ImportContactsResult> {
    await this.requireOwnedList(listId, userId);
    const normalized = contacts.map((contact) => ({
      email: contact.email.trim().toLowerCase(),
      name: normalizeOptional(contact.name),
      variables: normalizeVariables(contact.variables),
    }));
    return this.repository.importContacts(listId, normalized);
  }

  private async requireOwnedList(id: string, userId: string): Promise<AudienceListRecord> {
    const list = await this.repository.findListById(id);
    if (!list || list.userId !== userId) throw new AppError(404, "List not found");
    return list;
  }
}

function normalizeOptional(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeVariables(
  value: Record<string, string> | null | undefined,
): Record<string, string> | null {
  if (!value) return null;
  const entries = Object.entries(value)
    .map(([key, val]) => [key.trim(), String(val).trim()] as const)
    .filter(([key, val]) => key && val !== undefined);
  if (entries.length === 0) return null;
  return Object.fromEntries(entries);
}
