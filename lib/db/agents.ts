import { SQLiteDatabase } from "expo-sqlite";
import { useDatabase } from "./DatabaseProvider";

// =============================================================================
// TYPES
// =============================================================================

export type ThinkMode = "no-think" | "think" | "none";

export interface Agent {
  id: number;
  name: string;
  systemPrompt: string;
  thinkMode: ThinkMode;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateAgentInput {
  name: string;
  systemPrompt: string;
  thinkMode?: ThinkMode;
}

export interface UpdateAgentInput {
  name?: string;
  systemPrompt?: string;
  thinkMode?: ThinkMode;
}

// =============================================================================
// REPOSITORY
// =============================================================================

export class AgentRepository {
  constructor(private db: SQLiteDatabase) {}

  /**
   * Create a new agent
   */
  async create(input: CreateAgentInput): Promise<Agent> {
    const now = Date.now();
    const thinkMode = input.thinkMode ?? "no-think";

    const result = await this.db.runAsync(
      `INSERT INTO agents (name, systemPrompt, thinkMode, isDefault, createdAt, updatedAt)
       VALUES (?, ?, ?, 0, ?, ?)`,
      [input.name, input.systemPrompt, thinkMode, now, now],
    );

    const agent = await this.getById(result.lastInsertRowId);
    if (!agent) {
      throw new Error("Failed to create agent");
    }

    return agent;
  }

  /**
   * Get an agent by ID
   */
  async getById(id: number): Promise<Agent | null> {
    const row = await this.db.getFirstAsync<{
      id: number;
      name: string;
      systemPrompt: string;
      thinkMode: string;
      isDefault: number;
      createdAt: number;
      updatedAt: number;
    }>(`SELECT * FROM agents WHERE id = ?`, [id]);

    if (!row) return null;

    return this.rowToAgent(row);
  }

  /**
   * Get all agents
   */
  async getAll(): Promise<Agent[]> {
    const rows = await this.db.getAllAsync<{
      id: number;
      name: string;
      systemPrompt: string;
      thinkMode: string;
      isDefault: number;
      createdAt: number;
      updatedAt: number;
    }>(`SELECT * FROM agents ORDER BY isDefault DESC, name ASC`);

    return rows.map((row) => this.rowToAgent(row));
  }

  /**
   * Get the default agent
   */
  async getDefault(): Promise<Agent | null> {
    const row = await this.db.getFirstAsync<{
      id: number;
      name: string;
      systemPrompt: string;
      thinkMode: string;
      isDefault: number;
      createdAt: number;
      updatedAt: number;
    }>(`SELECT * FROM agents WHERE isDefault = 1 LIMIT 1`);

    if (!row) return null;

    return this.rowToAgent(row);
  }

  /**
   * Update an agent
   */
  async update(id: number, input: UpdateAgentInput): Promise<Agent> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Agent not found: ${id}`);
    }

    const now = Date.now();
    const name = input.name ?? existing.name;
    const systemPrompt = input.systemPrompt ?? existing.systemPrompt;
    const thinkMode = input.thinkMode ?? existing.thinkMode;

    await this.db.runAsync(
      `UPDATE agents SET name = ?, systemPrompt = ?, thinkMode = ?, updatedAt = ? WHERE id = ?`,
      [name, systemPrompt, thinkMode, now, id],
    );

    const updated = await this.getById(id);
    if (!updated) {
      throw new Error("Failed to update agent");
    }

    return updated;
  }

  /**
   * Delete an agent (cannot delete the default agent)
   */
  async delete(id: number): Promise<void> {
    const agent = await this.getById(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }

    if (agent.isDefault) {
      throw new Error("Cannot delete the default agent");
    }

    // Clear agentId references in entries
    await this.db.runAsync(
      `UPDATE entries SET agentId = NULL WHERE agentId = ?`,
      [id],
    );

    await this.db.runAsync(`DELETE FROM agents WHERE id = ?`, [id]);
  }

  /**
   * Set an agent as the default (unsets other defaults)
   */
  async setDefault(id: number): Promise<void> {
    const agent = await this.getById(id);
    if (!agent) {
      throw new Error(`Agent not found: ${id}`);
    }

    const now = Date.now();

    // Unset all defaults
    await this.db.runAsync(`UPDATE agents SET isDefault = 0, updatedAt = ?`, [
      now,
    ]);

    // Set new default
    await this.db.runAsync(
      `UPDATE agents SET isDefault = 1, updatedAt = ? WHERE id = ?`,
      [now, id],
    );
  }

  /**
   * Convert a database row to an Agent object
   */
  private rowToAgent(row: {
    id: number;
    name: string;
    systemPrompt: string;
    thinkMode: string;
    isDefault: number;
    createdAt: number;
    updatedAt: number;
  }): Agent {
    return {
      id: row.id,
      name: row.name,
      systemPrompt: row.systemPrompt,
      thinkMode: row.thinkMode as ThinkMode,
      isDefault: row.isDefault === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

// =============================================================================
// HOOK
// =============================================================================

export function useAgents() {
  const db = useDatabase();
  const repo = new AgentRepository(db);

  return {
    create: (input: CreateAgentInput) => repo.create(input),
    getById: (id: number) => repo.getById(id),
    getAll: () => repo.getAll(),
    getDefault: () => repo.getDefault(),
    update: (id: number, input: UpdateAgentInput) => repo.update(id, input),
    delete: (id: number) => repo.delete(id),
    setDefault: (id: number) => repo.setDefault(id),
  };
}
