export interface AudienceListRecord {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AudienceContactRecord {
  id: string;
  listId: string;
  email: string;
  name: string | null;
  variables: Record<string, string> | null;
  createdAt: Date;
}

export interface AudienceListWithCount extends AudienceListRecord {
  contactCount: number;
}

export interface CreateAudienceListInput {
  name: string;
  description?: string | null;
}

export interface UpdateAudienceListInput {
  name?: string;
  description?: string | null;
}

export interface AudienceContactInput {
  email: string;
  name?: string | null;
  variables?: Record<string, string> | null;
}

export interface ImportContactsResult {
  imported: number;
  skipped: number;
  total: number;
}

export interface IAudienceRepository {
  createList(userId: string, input: CreateAudienceListInput): Promise<AudienceListRecord>;
  findListsByUserId(userId: string): Promise<AudienceListWithCount[]>;
  findListById(id: string): Promise<AudienceListRecord | null>;
  updateList(id: string, input: UpdateAudienceListInput): Promise<AudienceListRecord>;
  deleteList(id: string): Promise<void>;
  listContacts(listId: string): Promise<AudienceContactRecord[]>;
  deleteContact(listId: string, contactId: string): Promise<boolean>;
  importContacts(listId: string, contacts: AudienceContactInput[]): Promise<ImportContactsResult>;
}
