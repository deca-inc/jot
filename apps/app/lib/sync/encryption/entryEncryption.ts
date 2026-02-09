/**
 * Entry Encryption Service
 *
 * High-level API for encrypting/decrypting journal entries for sync.
 *
 * Encryption (UEK-based):
 * - Each entry is encrypted with a unique DEK (Data Encryption Key)
 * - DEK is wrapped with user's UEK (symmetric encryption)
 * - All devices with the same user credentials can decrypt
 *
 * Key hierarchy:
 * Password → PBKDF2 → KEK → unwrap UEK → unwrap DEK → decrypt content
 */

import {
  generateDEK,
  encryptContent,
  decryptContent,
  wrapDEKSymmetric,
  unwrapDEKSymmetric,
  type EncryptedEntryV2,
} from "./crypto";
import { getUEK } from "./keyManager";
import type { Entry } from "../../db/entries";

/**
 * Encrypt an entry for sync (V2 - UEK-based)
 *
 * Simple per-user encryption:
 * - DEK is wrapped with user's UEK (symmetric)
 * - All devices with the same credentials can decrypt
 * - No need to fetch device keys or wrap for multiple devices
 *
 * @param entry - The entry to encrypt
 * @param ownerId - The owner's user ID
 * @returns Encrypted entry structure (v2)
 */
export async function encryptEntry(
  entry: Entry,
  ownerId: string,
): Promise<EncryptedEntryV2> {
  // Get UEK from local storage
  const uek = await getUEK();
  if (!uek) {
    throw new Error("UEK not available - cannot encrypt. Please log in again.");
  }

  // Generate DEK for this entry
  const dek = generateDEK();

  // Serialize entry content
  const plaintext = JSON.stringify({
    title: entry.title,
    blocks: entry.blocks,
    tags: entry.tags,
    attachments: entry.attachments,
    type: entry.type,
    isFavorite: entry.isFavorite,
    isPinned: entry.isPinned,
    archivedAt: entry.archivedAt,
    agentId: entry.agentId,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  });

  // Encrypt content with DEK
  const { ciphertext, nonce, authTag } = await encryptContent(plaintext, dek);

  // Wrap DEK with UEK (symmetric encryption)
  const { wrappedDek, dekNonce, dekAuthTag } = await wrapDEKSymmetric(dek, uek);

  return {
    ciphertext,
    nonce,
    authTag,
    wrappedKey: {
      userId: ownerId,
      wrappedDek,
      dekNonce,
      dekAuthTag,
    },
    version: 2,
  };
}

/**
 * Decrypt an entry
 *
 * @param encrypted - The encrypted entry structure
 * @param currentUserId - The current user's ID
 * @returns Decrypted entry data
 */
export async function decryptEntry(
  encrypted: EncryptedEntryV2,
  currentUserId: string,
): Promise<Partial<Entry>> {
  // Check if this entry is for the current user
  if (encrypted.wrappedKey.userId !== currentUserId) {
    throw new Error(
      `No access to this entry - encrypted for user ${encrypted.wrappedKey.userId}, not ${currentUserId}`,
    );
  }

  // Get UEK from local storage
  const uek = await getUEK();
  if (!uek) {
    throw new Error("UEK not available - cannot decrypt. Please log in again.");
  }

  // Unwrap DEK with UEK
  const dek = await unwrapDEKSymmetric(
    encrypted.wrappedKey.wrappedDek,
    encrypted.wrappedKey.dekNonce,
    encrypted.wrappedKey.dekAuthTag,
    uek,
  );

  // Decrypt content with DEK
  const plaintext = await decryptContent(
    encrypted.ciphertext,
    encrypted.nonce,
    encrypted.authTag,
    dek,
  );

  // Parse decrypted content
  const data = JSON.parse(plaintext) as {
    title: string;
    blocks: Entry["blocks"];
    tags: string[];
    attachments: string[];
    type: Entry["type"];
    isFavorite: boolean;
    isPinned: boolean;
    archivedAt: number | null;
    agentId: number | null;
    createdAt: number;
    updatedAt: number;
  };

  return data;
}

/**
 * Check if a user has access to an encrypted entry
 */
export function hasAccess(
  encrypted: EncryptedEntryV2,
  userId: string,
): boolean {
  return encrypted.wrappedKey.userId === userId;
}

/**
 * Get list of users who have access to an entry
 */
export function getAuthorizedUsers(encrypted: EncryptedEntryV2): string[] {
  return [encrypted.wrappedKey.userId];
}
