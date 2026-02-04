import { createServer } from "http";
import { Hocuspocus } from "@hocuspocus/server";
import Database from "better-sqlite3";
import express from "express";
import { WebSocketServer } from "ws";
import { createApiRoutes } from "./api/routes.js";
import { createHocuspocusConfig } from "./sync/hocuspocus.js";
import { logger, setLogLevel, LogLevel } from "./utils/logger.js";

export interface ServerConfig {
  port: number;
  db: Database.Database;
  verbose?: boolean;
}

export interface JotServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getPort(): number;
}

export function createServer_impl(config: ServerConfig): JotServer {
  const startTime = Date.now();
  const app = express();
  const httpServer = createServer(app);

  if (config.verbose) {
    setLogLevel("debug");
  }

  // Middleware
  app.use(express.json());

  // API routes
  app.use("/api", createApiRoutes(config.db, startTime));

  // Health check at root
  app.get("/", (_req, res) => {
    res.json({ ok: true, service: "jot-server" });
  });

  // Create Hocuspocus instance for Yjs sync
  let hocuspocus: Hocuspocus | null = null;
  let wss: WebSocketServer | null = null;

  return {
    async start() {
      return new Promise((resolve) => {
        // Start HTTP server
        httpServer.listen(config.port, () => {
          logger.info(`HTTP server listening on port ${config.port}`);

          // Create Hocuspocus with configuration
          const hocuspocusConfig = createHocuspocusConfig(config.db);
          hocuspocus = new Hocuspocus(hocuspocusConfig);

          // Create WebSocket server with noServer mode
          wss = new WebSocketServer({ noServer: true });

          // Handle WebSocket upgrade requests
          httpServer.on("upgrade", (request, socket, head) => {
            wss?.handleUpgrade(request, socket, head, (websocket) => {
              hocuspocus?.handleConnection(websocket, request);
            });
          });

          logger.info(`WebSocket server ready for Yjs sync`);
          logger.info(`Server started at http://localhost:${config.port}`);

          resolve();
        });
      });
    },

    async stop() {
      return new Promise((resolve, reject) => {
        if (wss) {
          wss.close();
          wss = null;
        }

        if (hocuspocus) {
          hocuspocus.destroy();
          hocuspocus = null;
        }

        httpServer.close((err) => {
          if (err) {
            reject(err);
          } else {
            logger.info("Server stopped");
            resolve();
          }
        });
      });
    },

    getPort() {
      return config.port;
    },
  };
}

// Re-export for convenience
export { setLogLevel };
export type { LogLevel };
