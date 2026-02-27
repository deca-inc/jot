import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { Router, type Request, type Response } from "express";
import { AuthService } from "../auth/authService.js";
import { AssetRepository } from "../db/repositories/assets.js";
import { AuditLogRepository } from "../db/repositories/auditLog.js";
import { logger } from "../utils/logger.js";
import { createAuthMiddleware } from "./middleware/authMiddleware.js";

// Storage directory for assets
const ASSETS_DIR = path.join(process.cwd(), "data", "assets");

// Max file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Create assets router for file upload/download
 */
export function createAssetsRouter(
  db: Database.Database,
  authService: AuthService,
  auditLog?: AuditLogRepository,
): Router {
  const router = Router();
  const assetRepo = new AssetRepository(db);
  const authMiddleware = createAuthMiddleware(authService);

  // Helper to get IP address
  const getIp = (req: Request) => req.ip ?? req.socket.remoteAddress ?? "unknown";

  // Ensure assets directory exists
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  /**
   * POST /api/assets/upload
   * Upload a file
   */
  router.post("/upload", authMiddleware, async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated", code: "NOT_AUTHENTICATED" });
      return;
    }

    const userId = req.user.userId;
    const contentType = req.headers["content-type"] ?? "";

    // Handle multipart form data manually for simplicity
    // In production, use multer or similar
    if (!contentType.includes("multipart/form-data")) {
      res.status(400).json({
        error: "Content-Type must be multipart/form-data",
        code: "INVALID_CONTENT_TYPE",
      });
      return;
    }

    // For now, we'll handle raw body uploads for simplicity
    // The client should send the file as the request body
    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_FILE_SIZE) {
        req.destroy();
        res.status(413).json({
          error: "File too large",
          code: "FILE_TOO_LARGE",
          maxSize: MAX_FILE_SIZE,
        });
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const buffer = Buffer.concat(chunks);

        // Parse multipart form data (simplified)
        // In production, use a proper multipart parser
        const boundary = contentType.split("boundary=")[1];
        if (!boundary) {
          res.status(400).json({ error: "Missing boundary", code: "MISSING_BOUNDARY" });
          return;
        }

        const parts = parseMultipart(buffer, boundary);
        const filePart = parts.find((p) => p.name === "file");
        const entryIdPart = parts.find((p) => p.name === "entryId");
        const filenamePart = parts.find((p) => p.name === "filename");
        const mimeTypePart = parts.find((p) => p.name === "mimeType");

        // E2EE fields
        const wrappedDekPart = parts.find((p) => p.name === "wrappedDek");
        const dekNoncePart = parts.find((p) => p.name === "dekNonce");
        const dekAuthTagPart = parts.find((p) => p.name === "dekAuthTag");
        const contentNoncePart = parts.find((p) => p.name === "contentNonce");
        const contentAuthTagPart = parts.find((p) => p.name === "contentAuthTag");

        if (!filePart || !filePart.data) {
          res.status(400).json({ error: "No file provided", code: "MISSING_FILE" });
          return;
        }

        const entryId = entryIdPart?.value ?? "unknown";
        const filename = filenamePart?.value ?? filePart.filename ?? "attachment";
        const mimeType = mimeTypePart?.value ?? filePart.contentType ?? "application/octet-stream";

        // Check if encrypted (all encryption fields must be present)
        const isEncrypted = Boolean(
          wrappedDekPart?.value &&
          dekNoncePart?.value &&
          dekAuthTagPart?.value &&
          contentNoncePart?.value &&
          contentAuthTagPart?.value,
        );

        // Generate unique asset ID
        const assetId = randomUUID();
        const ext = path.extname(filename) || "";
        const storagePath = path.join(ASSETS_DIR, `${assetId}${ext}`);

        // Write file to disk
        fs.writeFileSync(storagePath, filePart.data);

        // Save to database
        assetRepo.create({
          id: assetId,
          userId,
          entryId,
          filename,
          mimeType,
          size: filePart.data.length,
          storagePath,
          createdAt: Date.now(),
          isEncrypted,
          wrappedDek: wrappedDekPart?.value,
          dekNonce: dekNoncePart?.value,
          dekAuthTag: dekAuthTagPart?.value,
          contentNonce: contentNoncePart?.value,
          contentAuthTag: contentAuthTagPart?.value,
        });

        const encryptionStatus = isEncrypted ? " (encrypted)" : "";
        logger.info(`Asset uploaded: ${assetId} (${filePart.data.length} bytes)${encryptionStatus} by user ${userId}`);

        // Audit log
        auditLog?.log(userId, "asset_upload", "asset", assetId, getIp(req), {
          filename,
          size: filePart.data.length,
          isEncrypted,
          entryId,
        });

        res.status(201).json({
          id: assetId,
          url: `/api/assets/${assetId}`,
          isEncrypted,
        });
      } catch (error) {
        logger.error("Failed to process upload:", error);
        res.status(500).json({ error: "Upload failed", code: "UPLOAD_FAILED" });
      }
    });

    req.on("error", (error) => {
      logger.error("Upload error:", error);
      res.status(500).json({ error: "Upload failed", code: "UPLOAD_FAILED" });
    });
  });

  /**
   * GET /api/assets/:id
   * Download a file
   */
  router.get("/:id", authMiddleware, (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated", code: "NOT_AUTHENTICATED" });
      return;
    }

    const assetId = req.params.id;
    const userId = req.user.userId;

    const asset = assetRepo.getByIdForUser(assetId, userId);
    if (!asset) {
      res.status(404).json({ error: "Asset not found", code: "NOT_FOUND" });
      return;
    }

    // Check if file exists
    if (!fs.existsSync(asset.storagePath)) {
      res.status(404).json({ error: "File not found", code: "FILE_NOT_FOUND" });
      return;
    }

    // Set headers
    res.setHeader("Content-Type", asset.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${asset.filename}"`);
    res.setHeader("Content-Length", asset.size);

    // Set E2EE headers if encrypted
    if (asset.isEncrypted) {
      res.setHeader("X-Encrypted", "true");
      if (asset.wrappedDek) res.setHeader("X-Wrapped-DEK", asset.wrappedDek);
      if (asset.dekNonce) res.setHeader("X-DEK-Nonce", asset.dekNonce);
      if (asset.dekAuthTag) res.setHeader("X-DEK-AuthTag", asset.dekAuthTag);
      if (asset.contentNonce) res.setHeader("X-Content-Nonce", asset.contentNonce);
      if (asset.contentAuthTag) res.setHeader("X-Content-AuthTag", asset.contentAuthTag);
    }

    // Audit log
    auditLog?.log(userId, "asset_download", "asset", assetId, getIp(req), {
      filename: asset.filename,
      isEncrypted: asset.isEncrypted,
    });

    // Stream file
    const stream = fs.createReadStream(asset.storagePath);
    stream.pipe(res);
  });

  /**
   * GET /api/assets/:id/metadata
   * Get asset metadata
   */
  router.get("/:id/metadata", authMiddleware, (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated", code: "NOT_AUTHENTICATED" });
      return;
    }

    const assetId = req.params.id;
    const userId = req.user.userId;

    const asset = assetRepo.getByIdForUser(assetId, userId);
    if (!asset) {
      res.status(404).json({ error: "Asset not found", code: "NOT_FOUND" });
      return;
    }

    const metadata: Record<string, unknown> = {
      id: asset.id,
      entryId: asset.entryId,
      filename: asset.filename,
      mimeType: asset.mimeType,
      size: asset.size,
      url: `/api/assets/${asset.id}`,
      createdAt: asset.createdAt,
      isEncrypted: asset.isEncrypted,
    };

    // Include encryption details if encrypted
    if (asset.isEncrypted) {
      metadata.encryption = {
        wrappedDek: asset.wrappedDek,
        dekNonce: asset.dekNonce,
        dekAuthTag: asset.dekAuthTag,
        contentNonce: asset.contentNonce,
        contentAuthTag: asset.contentAuthTag,
      };
    }

    res.json(metadata);
  });

  /**
   * DELETE /api/assets/:id
   * Delete an asset
   */
  router.delete("/:id", authMiddleware, (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated", code: "NOT_AUTHENTICATED" });
      return;
    }

    const assetId = req.params.id;
    const userId = req.user.userId;

    const asset = assetRepo.getByIdForUser(assetId, userId);
    if (!asset) {
      res.status(404).json({ error: "Asset not found", code: "NOT_FOUND" });
      return;
    }

    // Delete file from disk
    if (fs.existsSync(asset.storagePath)) {
      fs.unlinkSync(asset.storagePath);
    }

    // Delete from database
    assetRepo.deleteForUser(assetId, userId);

    logger.info(`Asset deleted: ${assetId} by user ${userId}`);

    res.json({ success: true });
  });

  /**
   * GET /api/assets/entry/:entryId
   * Get all assets for an entry
   */
  router.get("/entry/:entryId", authMiddleware, (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated", code: "NOT_AUTHENTICATED" });
      return;
    }

    const entryId = req.params.entryId;
    const userId = req.user.userId;

    const assets = assetRepo.getByEntryId(entryId, userId);

    res.json({
      assets: assets.map((a) => ({
        id: a.id,
        entryId: a.entryId,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
        url: `/api/assets/${a.id}`,
        createdAt: a.createdAt,
      })),
    });
  });

  return router;
}

// Simple multipart parser
interface MultipartPart {
  name?: string;
  filename?: string;
  contentType?: string;
  value?: string;
  data?: Buffer;
}

function parseMultipart(buffer: Buffer, boundary: string): MultipartPart[] {
  const parts: MultipartPart[] = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const endBoundaryBuffer = Buffer.from(`--${boundary}--`);

  let start = buffer.indexOf(boundaryBuffer) + boundaryBuffer.length;

  while (start < buffer.length) {
    // Find next boundary
    let end = buffer.indexOf(boundaryBuffer, start);
    if (end === -1) {
      end = buffer.indexOf(endBoundaryBuffer, start);
      if (end === -1) break;
    }

    // Extract part data
    const partBuffer = buffer.slice(start, end);

    // Skip CRLF at start
    let partStart = 0;
    if (partBuffer[0] === 0x0d && partBuffer[1] === 0x0a) {
      partStart = 2;
    }

    // Find header/body separator (double CRLF)
    const headerEnd = partBuffer.indexOf(Buffer.from("\r\n\r\n"), partStart);
    if (headerEnd === -1) {
      start = end + boundaryBuffer.length;
      continue;
    }

    const headerStr = partBuffer.slice(partStart, headerEnd).toString();
    const bodyStart = headerEnd + 4;

    // Remove trailing CRLF from body
    let bodyEnd = partBuffer.length;
    if (partBuffer[bodyEnd - 2] === 0x0d && partBuffer[bodyEnd - 1] === 0x0a) {
      bodyEnd -= 2;
    }

    const body = partBuffer.slice(bodyStart, bodyEnd);

    // Parse headers
    const part: MultipartPart = {};
    const contentDisposition = headerStr.match(/Content-Disposition:\s*form-data;\s*(.+)/i);
    if (contentDisposition) {
      const params = contentDisposition[1];
      const nameMatch = params.match(/name="([^"]+)"/);
      const filenameMatch = params.match(/filename="([^"]+)"/);

      if (nameMatch) part.name = nameMatch[1];
      if (filenameMatch) part.filename = filenameMatch[1];
    }

    const contentTypeHeader = headerStr.match(/Content-Type:\s*(.+)/i);
    if (contentTypeHeader) {
      part.contentType = contentTypeHeader[1].trim();
    }

    // If it's a file, store as buffer; otherwise as string
    if (part.filename || part.contentType) {
      part.data = body;
    } else {
      part.value = body.toString();
    }

    parts.push(part);
    start = end + boundaryBuffer.length;
  }

  return parts;
}
