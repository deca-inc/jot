/**
 * Custom Models Repository
 *
 * Database operations for custom local and remote API models.
 * Provides CRUD operations and a React hook for data access.
 */

import {
  generateCustomLocalModelId,
  generateRemoteModelId,
  generateApiKeyRef,
} from "../ai/modelTypeGuards";
import type {
  CustomModelConfig,
  CustomLocalModelConfig,
  RemoteModelConfig,
  CustomModelRow,
  CreateCustomLocalModelInput,
  CreateRemoteModelInput,
  UpdateCustomModelInput,
  CustomModelType,
  ProviderId,
  ModelCategory,
} from "../ai/customModels";

// =============================================================================
// DATABASE INTERFACE
// =============================================================================

/**
 * Database interface for dependency injection.
 * This allows the repository to be tested without importing expo-sqlite.
 */
export interface DatabaseAdapter {
  runAsync(
    sql: string,
    params: (string | number | null)[],
  ): Promise<{ lastInsertRowId: number }>;
  getFirstAsync<T>(
    sql: string,
    params: (string | number | null)[],
  ): Promise<T | null>;
  getAllAsync<T>(sql: string, params: (string | number | null)[]): Promise<T[]>;
}

// =============================================================================
// REPOSITORY
// =============================================================================

export class CustomModelsRepository {
  constructor(private db: DatabaseAdapter) {}

  // ===========================================================================
  // CREATE OPERATIONS
  // ===========================================================================

  /**
   * Create a new custom local model entry.
   */
  async createCustomLocalModel(
    input: CreateCustomLocalModelInput,
  ): Promise<CustomLocalModelConfig> {
    const now = Date.now();
    const modelId = generateCustomLocalModelId(input.folderName);
    const modelCategory = input.modelCategory || "llm";

    await this.db.runAsync(
      `INSERT INTO custom_models (
        modelId, modelType, modelCategory, displayName, description,
        huggingFaceUrl, tokenizerUrl, tokenizerConfigUrl,
        folderName, pteFileName, tokenizerFileName, tokenizerConfigFileName,
        modelSize, quantization, ramRequired, isDownloaded,
        isEnabled, privacyAcknowledged, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        modelId,
        "custom-local",
        modelCategory,
        input.displayName,
        input.description || null,
        input.huggingFaceUrl || null,
        input.tokenizerUrl || null,
        input.tokenizerConfigUrl || null,
        input.folderName,
        input.pteFileName,
        input.tokenizerFileName || null,
        input.tokenizerConfigFileName || null,
        input.modelSize || null,
        input.quantization || null,
        input.ramRequired || null,
        0, // isDownloaded - not downloaded yet
        1, // isEnabled
        0, // privacyAcknowledged (not needed for local models)
        now,
        now,
      ],
    );

    const model = await this.getByModelId(modelId);
    if (!model) {
      throw new Error("Failed to create custom local model");
    }

    return model as CustomLocalModelConfig;
  }

  /**
   * Create a new remote API model entry.
   */
  async createRemoteModel(
    input: CreateRemoteModelInput,
  ): Promise<RemoteModelConfig> {
    const now = Date.now();
    const modelId = generateRemoteModelId(input.providerId, input.modelName);
    const apiKeyRef = generateApiKeyRef(modelId);
    const modelCategory = input.modelCategory || "llm";

    await this.db.runAsync(
      `INSERT INTO custom_models (
        modelId, modelType, modelCategory, displayName, description,
        providerId, baseUrl, modelName, apiKeyRef,
        customHeaders, maxTokens, temperature,
        isEnabled, privacyAcknowledged, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        modelId,
        "remote-api",
        modelCategory,
        input.displayName,
        input.description || null,
        input.providerId,
        input.baseUrl,
        input.modelName,
        apiKeyRef,
        input.customHeaders ? JSON.stringify(input.customHeaders) : null,
        input.maxTokens || null,
        input.temperature || null,
        1, // isEnabled
        0, // privacyAcknowledged (requires user acknowledgment)
        now,
        now,
      ],
    );

    const model = await this.getByModelId(modelId);
    if (!model) {
      throw new Error("Failed to create remote model");
    }

    return model as RemoteModelConfig;
  }

  // ===========================================================================
  // READ OPERATIONS
  // ===========================================================================

  /**
   * Get all custom models.
   */
  async getAll(): Promise<CustomModelConfig[]> {
    const rows = await this.db.getAllAsync<CustomModelRow>(
      `SELECT * FROM custom_models ORDER BY createdAt DESC`,
      [],
    );

    return rows.map((row) => this.rowToModel(row));
  }

  /**
   * Get a model by its modelId.
   */
  async getByModelId(modelId: string): Promise<CustomModelConfig | null> {
    const row = await this.db.getFirstAsync<CustomModelRow>(
      `SELECT * FROM custom_models WHERE modelId = ?`,
      [modelId],
    );

    if (!row) return null;

    return this.rowToModel(row);
  }

  /**
   * Get models by type.
   */
  async getByType(modelType: CustomModelType): Promise<CustomModelConfig[]> {
    const rows = await this.db.getAllAsync<CustomModelRow>(
      `SELECT * FROM custom_models WHERE modelType = ? ORDER BY createdAt DESC`,
      [modelType],
    );

    return rows.map((row) => this.rowToModel(row));
  }

  /**
   * Get only enabled models.
   */
  async getEnabledModels(): Promise<CustomModelConfig[]> {
    const rows = await this.db.getAllAsync<CustomModelRow>(
      `SELECT * FROM custom_models WHERE isEnabled = 1 ORDER BY createdAt DESC`,
      [],
    );

    return rows.map((row) => this.rowToModel(row));
  }

  /**
   * Get custom local models only.
   */
  async getCustomLocalModels(): Promise<CustomLocalModelConfig[]> {
    const models = await this.getByType("custom-local");
    return models as CustomLocalModelConfig[];
  }

  /**
   * Get remote API models only.
   */
  async getRemoteModels(): Promise<RemoteModelConfig[]> {
    const models = await this.getByType("remote-api");
    return models as RemoteModelConfig[];
  }

  /**
   * Get models by category (LLM or STT).
   */
  async getByCategory(category: ModelCategory): Promise<CustomModelConfig[]> {
    const rows = await this.db.getAllAsync<CustomModelRow>(
      `SELECT * FROM custom_models WHERE modelCategory = ? ORDER BY createdAt DESC`,
      [category],
    );

    return rows.map((row) => this.rowToModel(row));
  }

  /**
   * Get custom local models by category.
   */
  async getCustomLocalModelsByCategory(
    category: ModelCategory,
  ): Promise<CustomLocalModelConfig[]> {
    const rows = await this.db.getAllAsync<CustomModelRow>(
      `SELECT * FROM custom_models WHERE modelType = ? AND modelCategory = ? ORDER BY createdAt DESC`,
      ["custom-local", category],
    );

    return rows.map((row) => this.rowToModel(row)) as CustomLocalModelConfig[];
  }

  /**
   * Get remote models by category.
   */
  async getRemoteModelsByCategory(
    category: ModelCategory,
  ): Promise<RemoteModelConfig[]> {
    const rows = await this.db.getAllAsync<CustomModelRow>(
      `SELECT * FROM custom_models WHERE modelType = ? AND modelCategory = ? ORDER BY createdAt DESC`,
      ["remote-api", category],
    );

    return rows.map((row) => this.rowToModel(row)) as RemoteModelConfig[];
  }

  // ===========================================================================
  // UPDATE OPERATIONS
  // ===========================================================================

  /**
   * Update a custom model.
   */
  async update(
    modelId: string,
    input: UpdateCustomModelInput,
  ): Promise<CustomModelConfig> {
    const existing = await this.getByModelId(modelId);
    if (!existing) {
      throw new Error(`Model not found: ${modelId}`);
    }

    const now = Date.now();
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.displayName !== undefined) {
      updates.push("displayName = ?");
      values.push(input.displayName);
    }

    if (input.description !== undefined) {
      updates.push("description = ?");
      values.push(input.description);
    }

    if (input.isEnabled !== undefined) {
      updates.push("isEnabled = ?");
      values.push(input.isEnabled ? 1 : 0);
    }

    if (input.privacyAcknowledged !== undefined) {
      updates.push("privacyAcknowledged = ?");
      values.push(input.privacyAcknowledged ? 1 : 0);
    }

    if (input.maxTokens !== undefined) {
      updates.push("maxTokens = ?");
      values.push(input.maxTokens);
    }

    if (input.temperature !== undefined) {
      updates.push("temperature = ?");
      values.push(input.temperature);
    }

    if (input.customHeaders !== undefined) {
      updates.push("customHeaders = ?");
      values.push(JSON.stringify(input.customHeaders));
    }

    if (input.baseUrl !== undefined) {
      updates.push("baseUrl = ?");
      values.push(input.baseUrl);
    }

    if (input.modelName !== undefined) {
      updates.push("modelName = ?");
      values.push(input.modelName);
    }

    // Custom local model URL fields
    if (input.huggingFaceUrl !== undefined) {
      updates.push("huggingFaceUrl = ?");
      values.push(input.huggingFaceUrl);
    }

    if (input.tokenizerUrl !== undefined) {
      updates.push("tokenizerUrl = ?");
      values.push(input.tokenizerUrl);
    }

    if (input.tokenizerConfigUrl !== undefined) {
      updates.push("tokenizerConfigUrl = ?");
      values.push(input.tokenizerConfigUrl);
    }

    if (input.tokenizerFileName !== undefined) {
      updates.push("tokenizerFileName = ?");
      values.push(input.tokenizerFileName);
    }

    if (input.tokenizerConfigFileName !== undefined) {
      updates.push("tokenizerConfigFileName = ?");
      values.push(input.tokenizerConfigFileName);
    }

    if (input.isDownloaded !== undefined) {
      updates.push("isDownloaded = ?");
      values.push(input.isDownloaded ? 1 : 0);
    }

    updates.push("updatedAt = ?");
    values.push(now);
    values.push(modelId);

    await this.db.runAsync(
      `UPDATE custom_models SET ${updates.join(", ")} WHERE modelId = ?`,
      values,
    );

    const updated = await this.getByModelId(modelId);
    if (!updated) {
      throw new Error("Failed to update model");
    }

    return updated;
  }

  /**
   * Acknowledge privacy for a remote model.
   */
  async acknowledgePrivacy(modelId: string): Promise<void> {
    const now = Date.now();

    await this.db.runAsync(
      `UPDATE custom_models SET privacyAcknowledged = 1, updatedAt = ? WHERE modelId = ?`,
      [now, modelId],
    );
  }

  /**
   * Enable or disable a model.
   */
  async setEnabled(modelId: string, enabled: boolean): Promise<void> {
    const now = Date.now();

    await this.db.runAsync(
      `UPDATE custom_models SET isEnabled = ?, updatedAt = ? WHERE modelId = ?`,
      [enabled ? 1 : 0, now, modelId],
    );
  }

  /**
   * Mark a custom local model as downloaded.
   */
  async setDownloaded(modelId: string, downloaded: boolean): Promise<void> {
    const now = Date.now();

    await this.db.runAsync(
      `UPDATE custom_models SET isDownloaded = ?, updatedAt = ? WHERE modelId = ?`,
      [downloaded ? 1 : 0, now, modelId],
    );
  }

  // ===========================================================================
  // DELETE OPERATIONS
  // ===========================================================================

  /**
   * Delete a custom model by modelId.
   */
  async delete(modelId: string): Promise<void> {
    const existing = await this.getByModelId(modelId);
    if (!existing) {
      throw new Error(`Model not found: ${modelId}`);
    }

    await this.db.runAsync(`DELETE FROM custom_models WHERE modelId = ?`, [
      modelId,
    ]);
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private rowToModel(row: CustomModelRow): CustomModelConfig {
    const modelCategory = (row.modelCategory || "llm") as ModelCategory;

    if (row.modelType === "custom-local") {
      return {
        modelId: row.modelId,
        modelType: "custom-local",
        modelCategory,
        displayName: row.displayName,
        description: row.description || undefined,
        huggingFaceUrl: row.huggingFaceUrl || undefined,
        tokenizerUrl: row.tokenizerUrl || undefined,
        tokenizerConfigUrl: row.tokenizerConfigUrl || undefined,
        folderName: row.folderName || "",
        pteFileName: row.pteFileName || "",
        tokenizerFileName: row.tokenizerFileName || undefined,
        tokenizerConfigFileName: row.tokenizerConfigFileName || undefined,
        modelSize: row.modelSize || undefined,
        quantization: row.quantization || undefined,
        ramRequired: row.ramRequired || undefined,
        isEnabled: row.isEnabled === 1,
        isDownloaded: row.isDownloaded === 1,
      } as CustomLocalModelConfig;
    }

    return {
      modelId: row.modelId,
      modelType: "remote-api",
      modelCategory,
      displayName: row.displayName,
      description: row.description || undefined,
      providerId: row.providerId as ProviderId,
      baseUrl: row.baseUrl || "",
      modelName: row.modelName || "",
      apiKeyRef: row.apiKeyRef || "",
      customHeaders: row.customHeaders
        ? JSON.parse(row.customHeaders)
        : undefined,
      maxTokens: row.maxTokens || undefined,
      temperature: row.temperature || undefined,
      isEnabled: row.isEnabled === 1,
      privacyAcknowledged: row.privacyAcknowledged === 1,
    } as RemoteModelConfig;
  }
}

// =============================================================================
// HOOK (requires React and expo-sqlite)
// =============================================================================

// The hook is in a separate file to avoid importing expo-sqlite in tests
// See: lib/db/useCustomModels.ts
