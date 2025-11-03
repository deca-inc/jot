import { useDatabase } from "./DatabaseProvider";
import { SQLiteDatabase } from "expo-sqlite";

export type EntryType = "journal" | "ai_chat";

export type Block =
  | {
      type: "paragraph";
      content: string;
      role?: "user" | "assistant" | "system";
    }
  | {
      type: "heading1" | "heading2" | "heading3";
      content: string;
      role?: "user" | "assistant" | "system";
    }
  | {
      type: "list";
      ordered?: boolean;
      items: string[];
      role?: "user" | "assistant" | "system";
    }
  | {
      type: "checkbox";
      checked: boolean;
      content: string;
      role?: "user" | "assistant" | "system";
    }
  | {
      type: "code";
      language?: string;
      content: string;
      role?: "user" | "assistant" | "system";
    }
  | {
      type: "markdown";
      content: string;
      role?: "user" | "assistant" | "system";
    }
  | {
      type: "table";
      headers?: string[];
      rows: string[][];
      role?: "user" | "assistant" | "system";
    }
  | {
      type: "image";
      url: string;
      alt?: string;
      role?: "user" | "assistant" | "system";
    }
  | {
      type: "quote";
      content: string;
      role?: "user" | "assistant" | "system";
    };

export interface Entry {
  id: number;
  type: EntryType;
  title: string;
  blocks: Block[];
  tags: string[];
  attachments: string[];
  isFavorite: boolean;
  embedding: Uint8Array | null;
  embeddingModel: string | null;
  embeddingCreatedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateEntryInput {
  type: EntryType;
  title: string;
  blocks: Block[];
  tags?: string[];
  attachments?: string[];
  isFavorite?: boolean;
}

export interface UpdateEntryInput {
  title?: string;
  blocks?: Block[];
  tags?: string[];
  attachments?: string[];
  isFavorite?: boolean;
}

/**
 * Extract plain text preview from blocks for display in list items
 */
export function extractPreviewText(blocks: Block[]): string {
  for (const block of blocks) {
    if (
      block.type === "paragraph" ||
      block.type === "heading1" ||
      block.type === "heading2" ||
      block.type === "heading3"
    ) {
      if (block.content.trim()) {
        return block.content;
      }
    } else if (block.type === "markdown") {
      if (block.content.trim()) {
        // Strip markdown syntax for preview
        return block.content.replace(/[#*_`\[\]()]/g, "").trim();
      }
    }
  }
  return "";
}

/**
 * Data access layer for entries
 */
export class EntryRepository {
  constructor(private db: SQLiteDatabase) {}

  /**
   * Create a new entry
   */
  async create(input: CreateEntryInput): Promise<Entry> {
    const now = Date.now();
    const result = await this.db.runAsync(
      `INSERT INTO entries (type, title, blocks, tags, attachments, isFavorite, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.type,
        input.title,
        JSON.stringify(input.blocks),
        JSON.stringify(input.tags || []),
        JSON.stringify(input.attachments || []),
        input.isFavorite ? 1 : 0,
        now,
        now,
      ]
    );

    const entry = await this.getById(result.lastInsertRowId);
    if (!entry) {
      throw new Error("Failed to retrieve created entry");
    }
    return entry;
  }

  /**
   * Get entry by ID
   */
  async getById(id: number): Promise<Entry | null> {
    const result = await this.db.getFirstAsync<{
      id: number;
      type: EntryType;
      title: string;
      blocks: string;
      tags: string;
      attachments: string;
      isFavorite: number;
      embedding: Uint8Array | null;
      embeddingModel: string | null;
      embeddingCreatedAt: number | null;
      createdAt: number;
      updatedAt: number;
    }>(`SELECT * FROM entries WHERE id = ?`, [id]);

    if (!result) {
      return null;
    }

    return this.mapRowToEntry(result);
  }

  /**
   * Get all entries with optional filtering
   */
  async getAll(options?: {
    type?: EntryType;
    isFavorite?: boolean;
    tag?: string;
    limit?: number;
    offset?: number;
    orderBy?: "createdAt" | "updatedAt";
    order?: "ASC" | "DESC";
  }): Promise<Entry[]> {
    let query = "SELECT * FROM entries WHERE 1=1";
    const params: any[] = [];

    if (options?.type) {
      query += " AND type = ?";
      params.push(options.type);
    }

    if (options?.isFavorite !== undefined) {
      query += " AND isFavorite = ?";
      params.push(options.isFavorite ? 1 : 0);
    }

    if (options?.tag) {
      query += " AND tags LIKE ?";
      params.push(`%"${options.tag}"%`);
    }

    const orderBy = options?.orderBy || "updatedAt";
    const order = options?.order || "DESC";
    query += ` ORDER BY ${orderBy} ${order}`;

    if (options?.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    if (options?.offset) {
      query += " OFFSET ?";
      params.push(options.offset);
    }

    const results = await this.db.getAllAsync<{
      id: number;
      type: EntryType;
      title: string;
      blocks: string;
      tags: string;
      attachments: string;
      isFavorite: number;
      embedding: Uint8Array | null;
      embeddingModel: string | null;
      embeddingCreatedAt: number | null;
      createdAt: number;
      updatedAt: number;
    }>(query, params);

    return results.map((row) => this.mapRowToEntry(row));
  }

  /**
   * Update an entry
   */
  async update(id: number, input: UpdateEntryInput): Promise<Entry> {
    const now = Date.now();
    const updates: string[] = [];
    const params: any[] = [];

    if (input.title !== undefined) {
      updates.push("title = ?");
      params.push(input.title);
    }

    if (input.blocks !== undefined) {
      updates.push("blocks = ?");
      params.push(JSON.stringify(input.blocks));
    }

    if (input.tags !== undefined) {
      updates.push("tags = ?");
      params.push(JSON.stringify(input.tags));
    }

    if (input.attachments !== undefined) {
      updates.push("attachments = ?");
      params.push(JSON.stringify(input.attachments));
    }

    if (input.isFavorite !== undefined) {
      updates.push("isFavorite = ?");
      params.push(input.isFavorite ? 1 : 0);
    }

    if (updates.length === 0) {
      const entry = await this.getById(id);
      if (!entry) {
        throw new Error("Entry not found");
      }
      return entry;
    }

    updates.push("updatedAt = ?");
    params.push(now);
    params.push(id);

    await this.db.runAsync(
      `UPDATE entries SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    const entry = await this.getById(id);
    if (!entry) {
      throw new Error("Entry not found after update");
    }
    return entry;
  }

  /**
   * Delete an entry
   */
  async delete(id: number): Promise<void> {
    await this.db.runAsync("DELETE FROM entries WHERE id = ?", [id]);
  }

  /**
   * Toggle favorite status
   */
  async toggleFavorite(id: number): Promise<Entry> {
    const entry = await this.getById(id);
    if (!entry) {
      throw new Error("Entry not found");
    }
    return this.update(id, { isFavorite: !entry.isFavorite });
  }

  /**
   * Map database row to Entry object
   */
  private mapRowToEntry(row: {
    id: number;
    type: EntryType;
    title: string;
    blocks: string;
    tags: string;
    attachments: string;
    isFavorite: number;
    embedding: Uint8Array | null;
    embeddingModel: string | null;
    embeddingCreatedAt: number | null;
    createdAt: number;
    updatedAt: number;
  }): Entry {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      blocks: JSON.parse(row.blocks) as Block[],
      tags: JSON.parse(row.tags) as string[],
      attachments: JSON.parse(row.attachments) as string[],
      isFavorite: row.isFavorite === 1,
      embedding: row.embedding,
      embeddingModel: row.embeddingModel,
      embeddingCreatedAt: row.embeddingCreatedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

/**
 * Hook to get entry repository instance
 */
export function useEntryRepository(): EntryRepository {
  const db = useDatabase();
  return new EntryRepository(db);
}
