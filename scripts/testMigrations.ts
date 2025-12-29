#!/usr/bin/env tsx
/**
 * Migration testing script
 *
 * Run this script to test migrations in a controlled environment.
 * Usage:
 *   pnpm test:migrations up
 *   pnpm test:migrations down [count]
 *   pnpm test:migrations seed [--seeds]
 *   pnpm test:migrations reset
 *   pnpm test:migrations status
 */

import * as fs from "fs";
import * as path from "path";
import { migrateTo, migrateBack } from "../lib/db/migrations";
import { createTestDatabase, TestDatabase } from "../lib/db/test/dbAdapter";
import "../lib/db/migrations/index"; // Register migrations

const TEST_DATABASE_PATH = path.join(process.cwd(), "journal-test.db");
const command = process.argv[2];
const includeSeeds = process.argv.includes("--seeds");

async function openTestDatabase(): Promise<TestDatabase> {
  // Delete existing test database if it exists
  if (fs.existsSync(TEST_DATABASE_PATH)) {
    fs.unlinkSync(TEST_DATABASE_PATH);
  }
  return createTestDatabase(TEST_DATABASE_PATH);
}

async function closeTestDatabase(db: TestDatabase) {
  await db.closeAsync();
  if (fs.existsSync(TEST_DATABASE_PATH)) {
    fs.unlinkSync(TEST_DATABASE_PATH);
  }
}

async function main() {
  try {
    switch (command) {
      case "up": {
        console.log("🧪 Testing migrations UP...");
        if (includeSeeds) {
          console.log("  (including seeds)");
        }
        const db = await openTestDatabase();
        try {
          await migrateTo(db as any, Number.POSITIVE_INFINITY, {
            verbose: true,
            includeSeeds,
          });
          console.log("✅ Migrations UP completed successfully");
        } catch (error) {
          console.error("❌ Migration UP failed:", error);
          await closeTestDatabase(db);
          throw error;
        }
        break;
      }

      case "down": {
        const count = process.argv[3];
        const rollbackCount =
          count === "batch" ? "batch" : count ? parseInt(count, 10) : "batch";
        console.log(`🧪 Testing migrations DOWN (${rollbackCount})...`);
        console.log("  (seeds are always included in rollback)");

        // Open existing DB without deleting - we need existing migrations to rollback
        let db: TestDatabase;
        if (fs.existsSync(TEST_DATABASE_PATH)) {
          db = createTestDatabase(TEST_DATABASE_PATH);
        } else {
          // No DB exists, run migrations first
          console.log(
            "  No existing migrations found, running migrations with seeds first...",
          );
          db = await openTestDatabase();
          await migrateTo(db as any, Number.POSITIVE_INFINITY, {
            verbose: false,
            includeSeeds: true,
          });
        }

        try {
          await migrateBack(db as any, rollbackCount, { verbose: true });
          console.log("✅ Migrations DOWN completed successfully");
          await db.closeAsync();
        } catch (error) {
          console.error("❌ Migration DOWN failed:", error);
          await db.closeAsync();
          throw error;
        }
        break;
      }

      case "seed": {
        console.log("🧪 Testing migrations with seed data...");
        if (includeSeeds) {
          console.log("  (using registered seed migrations)");
        } else {
          console.log("  (no seeds - database will be empty)");
        }
        const db = await openTestDatabase();
        try {
          await migrateTo(db as any, Number.POSITIVE_INFINITY, {
            verbose: true,
            includeSeeds,
          });

          // Verify data exists
          const entries = await db.getAllAsync("SELECT * FROM entries");
          const settings = await db.getAllAsync("SELECT * FROM settings");

          console.log(
            `✅ Test complete: ${entries.length} entries, ${settings.length} settings`,
          );
          console.log("📊 Sample entries:");
          for (const entry of entries) {
            console.log(
              `  - ${entry.type}: "${entry.title}" (${entry.tags || "no tags"})`,
            );
          }
        } catch (error) {
          console.error("❌ Migration test with seed failed:", error);
          await closeTestDatabase(db);
          throw error;
        }
        break;
      }

      case "reset": {
        console.log("🧪 Resetting test database...");
        const db = await openTestDatabase();
        try {
          // Clear all data (same as seed migration's down function)
          await db.runAsync("DELETE FROM entries");
          await db.runAsync("DELETE FROM settings");
          await db.runAsync("DELETE FROM entries_fts");

          // Re-run migrations to ensure schema is correct
          await migrateTo(db as any, Number.POSITIVE_INFINITY, {
            verbose: false,
          });

          console.log("✅ Test database reset complete");
        } catch (error) {
          console.error("❌ Reset failed:", error);
          await closeTestDatabase(db);
          throw error;
        }
        break;
      }

      case "status": {
        const db = await openTestDatabase();
        try {
          const migrations = await db.getAllAsync<{
            id: number;
            name: string;
            batch: number;
          }>("SELECT * FROM migrations ORDER BY id");
          console.log(`\n📋 Migration Status:`);
          console.log(`Total migrations: ${migrations.length}`);
          if (migrations.length > 0) {
            console.log(`\nApplied migrations:`);
            migrations.forEach((m) => {
              console.log(`  - ${m.name} (batch ${m.batch})`);
            });
          } else {
            console.log("No migrations applied yet.");
          }
        } finally {
          await closeTestDatabase(db);
        }
        break;
      }

      default:
        console.log(`
Migration Testing Script

Usage:
  pnpm test:migrations <command> [options]

Commands:
  up              Run all pending migrations
  down [count]    Rollback migrations (count or "batch")
  reset           Clear test data and re-run migrations
  status          Show current migration status

Examples:
  pnpm test:migrations up
  pnpm test:migrations down 1
  pnpm test:migrations reset
  pnpm test:migrations status
        `);
        process.exit(1);
    }
  } catch (error) {
    console.error("Migration test failed:", error);
    process.exit(1);
  }
}

main();
