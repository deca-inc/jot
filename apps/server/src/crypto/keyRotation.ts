/**
 * Key Rotation
 *
 * Provides functionality to rotate a user's encryption key (UEK).
 * This re-wraps all DEKs (document and asset) with a new UEK.
 *
 * Key rotation is useful for:
 * - Periodic security hygiene
 * - Suspected key compromise
 * - Password changes (future)
 */

import * as argon2 from "argon2";
import Database from "better-sqlite3";
import * as Y from "yjs";
import { AssetRepository } from "../db/repositories/assets.js";
import { DocumentRepository } from "../db/repositories/documents.js";
import { RefreshTokenRepository } from "../db/repositories/refreshTokens.js";
import { UserRepository } from "../db/repositories/users.js";
import {
  createNewUEK,
  deriveKEKAsync,
  rewrapDEK,
  base64ToBuffer,
} from "./uekCrypto.js";

/**
 * Wrapped key structure stored in Yjs document metadata
 */
interface WrappedKeyV2 {
  userId: string;
  wrappedDek: string;
  dekNonce: string;
  dekAuthTag: string;
}

/**
 * Result of key rotation operation
 */
export interface KeyRotationResult {
  success: boolean;
  documentsProcessed: number;
  documentsFailed: number;
  assetsProcessed: number;
  assetsFailed: number;
  errors: string[];
}

/**
 * Rotate encryption keys for a user
 *
 * This operation:
 * 1. Verifies the user's password
 * 2. Unwraps the current UEK
 * 3. Generates a new UEK
 * 4. Re-wraps all DEKs (documents and assets) with the new UEK
 * 5. Wraps the new UEK with a new salt
 * 6. Updates the user record and invalidates all sessions
 *
 * @param db - Database instance
 * @param email - User's email
 * @param password - User's password (for verification and new KEK derivation)
 * @param dryRun - If true, don't make any changes (preview only)
 */
export async function rotateUserKeys(
  db: Database.Database,
  email: string,
  password: string,
  dryRun = false,
): Promise<KeyRotationResult> {
  const userRepo = new UserRepository(db);
  const documentRepo = new DocumentRepository(db);
  const assetRepo = new AssetRepository(db);
  const refreshTokenRepo = new RefreshTokenRepository(db);

  const result: KeyRotationResult = {
    success: false,
    documentsProcessed: 0,
    documentsFailed: 0,
    assetsProcessed: 0,
    assetsFailed: 0,
    errors: [],
  };

  // 1. Get user and verify password
  const user = userRepo.getByEmail(email);
  if (!user) {
    result.errors.push(`User not found: ${email}`);
    return result;
  }

  const isValidPassword = await argon2.verify(user.passwordHash, password);
  if (!isValidPassword) {
    result.errors.push("Invalid password");
    return result;
  }

  // 2. Get current UEK data
  const currentUekData = userRepo.getUEK(user.id);
  if (!currentUekData) {
    result.errors.push("User has no UEK - cannot rotate keys");
    return result;
  }

  // 3. Derive KEK from password and unwrap current UEK
  const currentSalt = base64ToBuffer(currentUekData.salt);
  const currentKek = await deriveKEKAsync(password, currentSalt);

  let currentUek: Buffer;
  try {
    const { unwrapUEK } = await import("./uekCrypto.js");
    currentUek = unwrapUEK(
      currentUekData.wrappedUek,
      currentUekData.nonce,
      currentUekData.authTag,
      currentKek,
    );
  } catch (error) {
    result.errors.push(`Failed to unwrap current UEK: ${error}`);
    return result;
  }

  // 4. Generate new UEK
  const newUekData = createNewUEK(password);
  const newUek = newUekData.uek;

  // 5. Process all documents owned by user
  const documents = documentRepo.getByUserId(user.id);
  for (const doc of documents) {
    try {
      if (!doc.yjsState) {
        continue; // Skip empty documents
      }

      // Parse Yjs document
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, doc.yjsState);

      const metadata = ydoc.getMap("metadata");
      const isEncrypted = metadata.get("encrypted") as boolean;

      if (!isEncrypted) {
        continue; // Skip unencrypted documents
      }

      const wrappedKey = metadata.get("wrappedKey") as WrappedKeyV2 | undefined;
      if (!wrappedKey) {
        continue; // Skip if no wrapped key
      }

      // Re-wrap DEK with new UEK
      const newWrappedKey = rewrapDEK(
        wrappedKey.wrappedDek,
        wrappedKey.dekNonce,
        wrappedKey.dekAuthTag,
        currentUek,
        newUek,
      );

      if (!dryRun) {
        // Update the Yjs document with new wrapped key
        ydoc.transact(() => {
          metadata.set("wrappedKey", {
            userId: wrappedKey.userId,
            wrappedDek: newWrappedKey.wrappedDek,
            dekNonce: newWrappedKey.dekNonce,
            dekAuthTag: newWrappedKey.dekAuthTag,
          });
          metadata.set("updatedAt", Date.now());
        });

        // Save updated Yjs state
        const newState = Y.encodeStateAsUpdate(ydoc);
        documentRepo.upsert(doc.id, Buffer.from(newState), doc.metadata ?? undefined, user.id);
      }

      result.documentsProcessed++;
    } catch (error) {
      result.documentsFailed++;
      result.errors.push(`Document ${doc.id}: ${error}`);
    }
  }

  // 6. Process all encrypted assets owned by user
  const assets = assetRepo.getEncryptedAssetsByUserId(user.id);
  for (const asset of assets) {
    try {
      if (!asset.wrappedDek || !asset.dekNonce || !asset.dekAuthTag) {
        continue; // Skip assets without DEK
      }

      // Re-wrap DEK with new UEK
      const newWrappedDek = rewrapDEK(
        asset.wrappedDek,
        asset.dekNonce,
        asset.dekAuthTag,
        currentUek,
        newUek,
      );

      if (!dryRun) {
        assetRepo.updateEncryptionKeys(
          asset.id,
          newWrappedDek.wrappedDek,
          newWrappedDek.dekNonce,
          newWrappedDek.dekAuthTag,
        );
      }

      result.assetsProcessed++;
    } catch (error) {
      result.assetsFailed++;
      result.errors.push(`Asset ${asset.id}: ${error}`);
    }
  }

  // 7. Update user with new UEK and invalidate sessions
  if (!dryRun) {
    // Use a transaction for atomicity
    const transaction = db.transaction(() => {
      // Update user UEK
      userRepo.setUEK(
        user.id,
        newUekData.wrappedUek,
        newUekData.salt,
        newUekData.nonce,
        newUekData.authTag,
      );

      // Invalidate all refresh tokens (force re-login on all devices)
      refreshTokenRepo.deleteAllForUser(user.id);
    });

    transaction();
  }

  result.success = result.documentsFailed === 0 && result.assetsFailed === 0;
  return result;
}
