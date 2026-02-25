#!/usr/bin/env node
import { spawn } from "child_process";
import { Command } from "commander";
import { rotateUserKeys } from "./crypto/keyRotation.js";
import { getDatabase, closeDatabase } from "./db/client.js";
import { DocumentRepository } from "./db/repositories/documents.js";
import { SessionRepository } from "./db/repositories/sessions.js";
import { getModelManager } from "./llm/models.js";
import { createServer_impl } from "./server.js";
import {
  getCurrentVersion,
  checkForUpdates,
  isUpdateAvailable,
  getLatestRelease,
  getInstallCommand,
  startUpdateChecker,
  stopUpdateChecker,
} from "./utils/updater.js";

const program = new Command();

program
  .name("jot-server")
  .description("Jot sync server - headless CLI for Yjs sync and LLM inference")
  .version(getCurrentVersion());

// Start command
program
  .command("start")
  .description("Start the Jot server")
  .option("-p, --port <port>", "Port to listen on", "3000")
  .option("-d, --data-dir <dir>", "Data directory for database and models", "./data")
  .option("-v, --verbose", "Enable verbose logging")
  .action(async (options) => {
    const port = parseInt(process.env.PORT || options.port, 10);
    const dataDir = options.dataDir;
    const verbose = options.verbose || false;

    console.log(`Starting Jot server...`);
    console.log(`  Port: ${port}`);
    console.log(`  Data directory: ${dataDir}`);
    console.log(`  Verbose: ${verbose}`);

    const db = getDatabase({ dataDir, verbose });
    const server = createServer_impl({ port, db, verbose });

    // Start checking for updates in background
    startUpdateChecker();

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log("\nShutting down...");
      stopUpdateChecker();
      await server.stop();
      closeDatabase();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    await server.start();
  });

// Status command
program
  .command("status")
  .description("Show server status")
  .option("-d, --data-dir <dir>", "Data directory for database", "./data")
  .action((options) => {
    const dataDir = options.dataDir;

    try {
      const db = getDatabase({ dataDir, verbose: false });
      const documentRepo = new DocumentRepository(db);
      const sessionRepo = new SessionRepository(db);

      console.log("\nJot Server Status");
      console.log("=================");
      console.log(`Documents: ${documentRepo.count()}`);
      console.log(`Sessions: ${sessionRepo.count()}`);
      console.log(`Active sessions: ${sessionRepo.countActive()}`);

      closeDatabase();
    } catch (error) {
      console.error("Error reading database:", error);
      process.exit(1);
    }
  });

// Devices command
program
  .command("devices")
  .description("List connected sessions/devices")
  .option("-d, --data-dir <dir>", "Data directory for database", "./data")
  .option("-a, --active-only", "Show only active sessions")
  .action((options) => {
    const dataDir = options.dataDir;

    try {
      const db = getDatabase({ dataDir, verbose: false });
      const sessionRepo = new SessionRepository(db);

      const sessions = options.activeOnly
        ? sessionRepo.getActive()
        : sessionRepo.getAll();

      if (sessions.length === 0) {
        console.log("\nNo sessions found.");
      } else {
        console.log("\nSessions");
        console.log("========");
        for (const session of sessions) {
          const isActive = sessionRepo.getActive().some((s) => s.id === session.id);
          const status = isActive ? "[ACTIVE]" : "[INACTIVE]";
          const name = session.displayName || "(anonymous)";
          console.log(`  ${status} ${session.id}`);
          console.log(`    Name: ${name}`);
          console.log(`    Type: ${session.deviceType}`);
          console.log(`    Last seen: ${new Date(session.lastSeenAt).toLocaleString()}`);
          console.log("");
        }
      }

      closeDatabase();
    } catch (error) {
      console.error("Error reading database:", error);
      process.exit(1);
    }
  });

// Models commands
const modelsCommand = program
  .command("models")
  .description("Manage LLM models");

modelsCommand
  .command("list")
  .description("List available and downloaded models")
  .option("-d, --data-dir <dir>", "Data directory for models", "./data")
  .action((options) => {
    const dataDir = options.dataDir;
    const manager = getModelManager(dataDir);
    const models = manager.listAvailable();

    console.log("\nAvailable Models");
    console.log("================");

    for (const model of models) {
      const status = model.isDownloaded ? "[DOWNLOADED]" : "[AVAILABLE]";
      console.log(`\n${status} ${model.name}`);
      console.log(`  ID: ${model.id}`);
      console.log(`  Size: ${model.size}`);
      console.log(`  Category: ${model.category}`);
      console.log(`  Description: ${model.description}`);
    }

    console.log("\nTo download a model:");
    console.log("  jot-server models download <model-id>");
  });

modelsCommand
  .command("download <modelId>")
  .description("Download a model")
  .option("-d, --data-dir <dir>", "Data directory for models", "./data")
  .action(async (modelId, options) => {
    const dataDir = options.dataDir;
    const manager = getModelManager(dataDir);

    console.log(`\nDownloading model: ${modelId}`);

    try {
      await manager.download(modelId, (progress) => {
        process.stdout.write(`\rProgress: ${(progress * 100).toFixed(1)}%`);
      });
      console.log("\nDownload complete!");
    } catch (error) {
      if (error instanceof Error) {
        console.error(`\nError: ${error.message}`);
      }
      process.exit(1);
    }
  });

modelsCommand
  .command("delete <modelId>")
  .description("Delete a downloaded model")
  .option("-d, --data-dir <dir>", "Data directory for models", "./data")
  .action((modelId, options) => {
    const dataDir = options.dataDir;
    const manager = getModelManager(dataDir);

    const deleted = manager.delete(modelId);
    if (deleted) {
      console.log(`Model ${modelId} deleted.`);
    } else {
      console.log(`Model ${modelId} not found.`);
      process.exit(1);
    }
  });

// Key rotation command
program
  .command("rotate-keys")
  .description("Rotate user encryption key (re-encrypts all data)")
  .requiredOption("-e, --email <email>", "User email")
  .requiredOption("-p, --password <password>", "User password")
  .option("--dry-run", "Preview changes without making them")
  .option("-d, --data-dir <dir>", "Data directory for database", "./data")
  .action(async (options) => {
    const dataDir = options.dataDir;
    const dryRun = options.dryRun || false;

    if (dryRun) {
      console.log("\n=== DRY RUN MODE (no changes will be made) ===\n");
    }

    console.log(`Rotating keys for user: ${options.email}`);

    try {
      const db = getDatabase({ dataDir, verbose: false });
      const result = await rotateUserKeys(db, options.email, options.password, dryRun);

      console.log("\nKey Rotation Results");
      console.log("====================");
      console.log(`Documents processed: ${result.documentsProcessed}`);
      console.log(`Documents failed: ${result.documentsFailed}`);
      console.log(`Assets processed: ${result.assetsProcessed}`);
      console.log(`Assets failed: ${result.assetsFailed}`);

      if (result.errors.length > 0) {
        console.log("\nErrors:");
        for (const error of result.errors) {
          console.log(`  - ${error}`);
        }
      }

      if (result.success) {
        if (dryRun) {
          console.log("\n[DRY RUN] Key rotation would succeed.");
          console.log("[DRY RUN] Run without --dry-run to apply changes.");
        } else {
          console.log("\nKey rotation complete successfully!");
          console.log("All devices will need to re-login to get the new encryption key.");
        }
      } else {
        console.log("\nKey rotation completed with errors.");
        process.exit(1);
      }

      closeDatabase();
    } catch (error) {
      console.error("Key rotation failed:", error);
      closeDatabase();
      process.exit(1);
    }
  });

// Update command
program
  .command("update")
  .description("Check for updates and install the latest version")
  .option("-c, --check", "Only check for updates, don't install")
  .action(async (options) => {
    console.log(`\nCurrent version: ${getCurrentVersion()}`);
    console.log("Checking for updates...");

    await checkForUpdates();
    const release = getLatestRelease();

    if (!release) {
      console.log("Could not check for updates. Please try again later.");
      process.exit(1);
    }

    if (!isUpdateAvailable()) {
      console.log("You're already on the latest version!");
      process.exit(0);
    }

    console.log(`\nNew version available: ${release.version}`);
    console.log(`Release URL: ${release.url}`);

    if (options.check) {
      console.log(`\nTo update, run: jot-server update`);
      process.exit(0);
    }

    console.log("\nInstalling update...\n");

    const installCmd = getInstallCommand();
    const isWindows = process.platform === "win32";

    if (isWindows) {
      // On Windows, run PowerShell
      const child = spawn("powershell", ["-Command", installCmd], {
        stdio: "inherit",
        shell: true,
      });
      child.on("close", (code) => process.exit(code || 0));
    } else {
      // On Unix, run bash
      const child = spawn("bash", ["-c", installCmd], {
        stdio: "inherit",
        shell: true,
      });
      child.on("close", (code) => process.exit(code || 0));
    }
  });

// Parse arguments
program.parse();
