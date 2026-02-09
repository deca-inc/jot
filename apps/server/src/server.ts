import { randomBytes } from "crypto";
import { createServer } from "http";
import { Hocuspocus } from "@hocuspocus/server";
import Database from "better-sqlite3";
import express from "express";
import { WebSocketServer } from "ws";
import { createApiRoutes } from "./api/routes.js";
import { AuthService } from "./auth/authService.js";
import { createHocuspocusConfig } from "./sync/hocuspocus.js";
import { logger, setLogLevel, LogLevel } from "./utils/logger.js";

export interface ServerConfig {
  port: number;
  db: Database.Database;
  verbose?: boolean;
  jwtSecret?: string;
}

export interface JotServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getPort(): number;
  getAuthService(): AuthService;
}

export function createServer_impl(config: ServerConfig): JotServer {
  const startTime = Date.now();
  const app = express();
  const httpServer = createServer(app);

  if (config.verbose) {
    setLogLevel("debug");
  }

  // Initialize JWT secret
  const jwtSecret = config.jwtSecret || process.env.JWT_SECRET || randomBytes(32).toString("hex");
  if (!config.jwtSecret && !process.env.JWT_SECRET) {
    logger.warn("No JWT_SECRET configured - using randomly generated secret. Sessions will not persist across server restarts.");
  }

  // Initialize AuthService
  const authService = new AuthService(config.db, {
    jwtSecret,
  });

  // Middleware
  app.use(express.json());

  // API routes
  app.use("/api", createApiRoutes({ db: config.db, startTime, authService }));

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
          const hocuspocusConfig = createHocuspocusConfig(config.db, authService);
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

    getAuthService() {
      return authService;
    },
  };
}

// Re-export for convenience
export { setLogLevel };
export type { LogLevel };
