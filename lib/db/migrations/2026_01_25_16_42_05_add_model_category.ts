import { type MigrationRunner } from "../migrationTypes";

export const up: MigrationRunner = async (db) => {
  console.log("[Migration] Adding modelCategory column to custom_models...");

  // Add modelCategory column to distinguish LLM from STT models
  // Default to 'llm' for existing models
  await db.execAsync(`
    ALTER TABLE custom_models ADD COLUMN modelCategory TEXT DEFAULT 'llm' CHECK(modelCategory IN ('llm', 'stt'));
  `);

  // Add index for faster category-based queries
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_custom_models_category ON custom_models(modelCategory);
  `);

  console.log("[Migration] modelCategory column added successfully");
};

export const down: MigrationRunner = async (db) => {
  console.log("[Migration] Removing modelCategory from custom_models...");

  await db.execAsync(`
    DROP INDEX IF EXISTS idx_custom_models_category;
  `);

  // SQLite doesn't support DROP COLUMN directly in older versions
  // We need to recreate the table without the column
  await db.execAsync(`
    CREATE TABLE custom_models_backup AS SELECT
      id, modelId, modelType, displayName, description,
      huggingFaceUrl, folderName, pteFileName, tokenizerFileName, tokenizerConfigFileName,
      modelSize, quantization, ramRequired,
      providerId, baseUrl, modelName, apiKeyRef, customHeaders, maxTokens, temperature,
      isEnabled, privacyAcknowledged, createdAt, updatedAt
    FROM custom_models;
  `);

  await db.execAsync(`DROP TABLE custom_models;`);

  await db.execAsync(`
    CREATE TABLE custom_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      modelId TEXT NOT NULL UNIQUE,
      modelType TEXT NOT NULL CHECK(modelType IN ('custom-local', 'remote-api')),
      displayName TEXT NOT NULL,
      description TEXT,
      huggingFaceUrl TEXT,
      folderName TEXT,
      pteFileName TEXT,
      tokenizerFileName TEXT,
      tokenizerConfigFileName TEXT,
      modelSize TEXT,
      quantization TEXT,
      ramRequired TEXT,
      providerId TEXT,
      baseUrl TEXT,
      modelName TEXT,
      apiKeyRef TEXT,
      customHeaders TEXT,
      maxTokens INTEGER,
      temperature REAL,
      isEnabled INTEGER DEFAULT 1,
      privacyAcknowledged INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);

  await db.execAsync(`
    INSERT INTO custom_models SELECT * FROM custom_models_backup;
  `);

  await db.execAsync(`DROP TABLE custom_models_backup;`);

  console.log("[Migration] modelCategory column removed");
};
