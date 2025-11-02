#!/usr/bin/env tsx
/**
 * Migration creation script
 *
 * Creates a new migration file and automatically registers it.
 * Usage:
 *   pnpm create:migration <migration-name>
 */

import * as fs from "fs";
import * as path from "path";

const migrationsDir = path.join(process.cwd(), "lib/db/migrations");
const migrationsIndexPath = path.join(migrationsDir, "index.ts");

const migrationTemplate = `import { type MigrationRunner } from "../migrationTypes";

export const up: MigrationRunner = async (db) => {
  await db.execAsync(\`
  \`);
};

export const down: MigrationRunner = async (db) => {
  await db.execAsync(\`
  \`);
};
`;

function generateTimestamp(): string {
  const date = new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}_${month}_${day}_${hours}_${minutes}_${seconds}`;
}

function sanitizeName(name: string): string {
  // Replace spaces and special chars with underscores, lowercase
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

async function createMigration(name: string) {
  const sanitizedName = sanitizeName(name);
  const timestamp = generateTimestamp();
  const fileName = `${timestamp}_${sanitizedName}.ts`;
  const filePath = path.join(migrationsDir, fileName);
  const importName = fileName.replace(".ts", "");

  // Check if file already exists
  if (fs.existsSync(filePath)) {
    console.error(`❌ Migration file already exists: ${fileName}`);
    process.exit(1);
  }

  // Create migration file
  fs.writeFileSync(filePath, migrationTemplate, "utf-8");
  console.log(`✅ Created migration file: ${filePath}`);

  // Read current index.ts
  const indexContent = fs.readFileSync(migrationsIndexPath, "utf-8");

  // Generate a safe variable name for the import
  const importVarName = sanitizedName
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/^[0-9]/, "_$&"); // Ensure it doesn't start with a number

  // Generate import and registration
  const importLine = `import * as ${importVarName} from "./${importName}";`;
  const registerLine = `registerMigration("${fileName}", async () => ${importVarName});`;

  // Parse the file to find insertion points
  const lines = indexContent.split("\n");
  let lastImportLine = -1;
  let lastRegisterEndLine = -1; // End of last registerMigration call (the closing );)
  let commentLine = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("import ") && lines[i].includes(" from ")) {
      lastImportLine = i;
    }
    // Find the closing ); of registerMigration calls
    if (
      lines[i].trim().endsWith(");") &&
      lines[i].includes("registerMigration")
    ) {
      lastRegisterEndLine = i;
    }
    if (lines[i].includes("// Add new migrations here:")) {
      commentLine = i;
    }
  }

  const newLines = [...lines];

  // Add import after the last import line
  if (!indexContent.includes(`from "./${importName}"`)) {
    const insertIndex = lastImportLine >= 0 ? lastImportLine + 1 : 3; // After first comment block
    newLines.splice(insertIndex, 0, importLine);
    // Update indices if we inserted before them
    if (lastRegisterEndLine >= insertIndex) {
      lastRegisterEndLine++;
    }
    if (commentLine >= insertIndex) {
      commentLine++;
    }
  }

  // Add registration after the last registerMigration call
  if (!indexContent.includes(`registerMigration("${fileName}"`)) {
    if (lastRegisterEndLine >= 0) {
      // Insert after the closing ); of the last registerMigration
      newLines.splice(lastRegisterEndLine + 1, 0, registerLine);
    } else if (commentLine >= 0) {
      newLines.splice(commentLine + 1, 0, registerLine);
    } else {
      // Append before the last comment
      newLines.splice(newLines.length - 1, 0, registerLine);
    }
  }

  const newContent = newLines.join("\n");

  // Write updated index.ts
  fs.writeFileSync(migrationsIndexPath, newContent, "utf-8");
  console.log(`✅ Registered migration in ${migrationsIndexPath}`);

  console.log(`\n📝 Migration created: ${fileName}`);
  console.log(`   Edit: ${filePath}`);
}

async function main() {
  const migrationName = process.argv[2];

  if (!migrationName) {
    console.error(`
❌ Migration name is required

Usage:
  pnpm create:migration <migration-name>

Example:
  pnpm create:migration add_user_table
  pnpm create:migration add tags index
    `);
    process.exit(1);
  }

  // Ensure migrations directory exists
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }

  try {
    await createMigration(migrationName);
  } catch (error) {
    console.error("❌ Failed to create migration:", error);
    process.exit(1);
  }
}

main();
