import { type MigrationRunner } from "../migrationTypes";

export const up: MigrationRunner = async (db) => {
  console.log("[Migration] Adding tokenizer URL fields to custom_models...");

  // Add tokenizerUrl column to store full URL for tokenizer.json
  await db.execAsync(`
    ALTER TABLE custom_models ADD COLUMN tokenizerUrl TEXT;
  `);

  // Add tokenizerConfigUrl column to store full URL for tokenizer_config.json
  await db.execAsync(`
    ALTER TABLE custom_models ADD COLUMN tokenizerConfigUrl TEXT;
  `);

  // Add isDownloaded column to track download state
  await db.execAsync(`
    ALTER TABLE custom_models ADD COLUMN isDownloaded INTEGER DEFAULT 0;
  `);

  console.log("[Migration] Tokenizer URL fields added successfully");
};

export const down: MigrationRunner = async (db) => {
  console.log(
    "[Migration] Removing tokenizer URL fields from custom_models...",
  );

  // SQLite doesn't support DROP COLUMN directly, need to recreate table
  // For simplicity in down migration, we'll just note this limitation
  // In practice, down migrations are rarely run in production

  await db.execAsync(`
    CREATE TABLE custom_models_backup AS SELECT
      id, modelId, modelType, modelCategory, displayName, description,
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
      modelCategory TEXT DEFAULT 'llm' CHECK(modelCategory IN ('llm', 'stt')),
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

  console.log("[Migration] Tokenizer URL fields removed");
};
