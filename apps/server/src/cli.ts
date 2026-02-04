#!/usr/bin/env node
import { Command } from "commander";
import { getDatabase, closeDatabase } from "./db/client.js";
import { DocumentRepository } from "./db/repositories/documents.js";
import { SessionRepository } from "./db/repositories/sessions.js";
import { getModelManager } from "./llm/models.js";
import { createServer_impl } from "./server.js";

const program = new Command();

program
  .name("jot-server")
  .description("Jot sync server - headless CLI for Yjs sync and LLM inference")
  .version("1.0.0");

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

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log("\nShutting down...");
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

// Parse arguments
program.parse();
