import { type MigrationRunner } from "../migrationTypes";

export const up: MigrationRunner = async (db) => {
  console.log("[Migration] Adding custom_models table...");

  // Create unified table for both custom local and remote API models
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS custom_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      modelId TEXT NOT NULL UNIQUE,
      modelType TEXT NOT NULL CHECK(modelType IN ('custom-local', 'remote-api')),
      displayName TEXT NOT NULL,
      description TEXT,

      -- For custom local models (ExecuTorch .pte)
      huggingFaceUrl TEXT,
      folderName TEXT,
      pteFileName TEXT,
      tokenizerFileName TEXT,
      tokenizerConfigFileName TEXT,
      modelSize TEXT,
      quantization TEXT,
      ramRequired TEXT,

      -- For remote API models
      providerId TEXT,
      baseUrl TEXT,
      modelName TEXT,
      apiKeyRef TEXT,
      customHeaders TEXT,
      maxTokens INTEGER,
      temperature REAL,

      -- Common fields
      isEnabled INTEGER DEFAULT 1,
      privacyAcknowledged INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);

  // Add index for faster type-based queries
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_custom_models_type ON custom_models(modelType);
  `);

  // Add index for enabled models lookup
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_custom_models_enabled ON custom_models(isEnabled);
  `);

  console.log("[Migration] custom_models table created successfully");
};

export const down: MigrationRunner = async (db) => {
  console.log("[Migration] Dropping custom_models table...");

  await db.execAsync(`
    DROP INDEX IF EXISTS idx_custom_models_enabled;
  `);

  await db.execAsync(`
    DROP INDEX IF EXISTS idx_custom_models_type;
  `);

  await db.execAsync(`
    DROP TABLE IF EXISTS custom_models;
  `);

  console.log("[Migration] custom_models table dropped");
};
