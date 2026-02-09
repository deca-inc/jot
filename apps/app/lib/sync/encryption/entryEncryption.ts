/**
 * Entry Encryption Service
 *
 * High-level API for encrypting/decrypting journal entries for sync.
 *
 * V2 Encryption (UEK-based):
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
  // Legacy imports for v1 compatibility
  unwrapDEK,
  type EncryptedEntry,
  type EncryptedEntryV2,
  type WrappedKey,
} from "./crypto";
import { getUEK, getPrivateKey } from "./keyManager";
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

  console.log(`[EntryEncryption] Entry ${entry.id} encrypted with UEK (v2)`);

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
 * @deprecated Use encryptEntry with UEK-based encryption
 * Legacy function signature for backward compatibility
 */
export async function encryptEntryLegacy(
  entry: Entry,
  ownerId: string,
  _sharedWith: string[] = [],
  _serverUrl: string,
  _getToken: () => Promise<string | null>,
): Promise<EncryptedEntryV2> {
  // Redirect to new UEK-based encryption
  return encryptEntry(entry, ownerId);
}

/**
 * Type guard to check if entry is V2 (UEK-based)
 */
function isEncryptedEntryV2(
  encrypted: EncryptedEntry | EncryptedEntryV2,
): encrypted is EncryptedEntryV2 {
  return encrypted.version === 2 && "wrappedKey" in encrypted;
}

/**
 * Decrypt an entry
 *
 * Supports both V1 (RSA-based) and V2 (UEK-based) encryption.
 * V2 is preferred - all devices with same credentials can decrypt.
 *
 * @param encrypted - The encrypted entry structure (v1 or v2)
 * @param currentUserId - The current user's ID
 * @returns Decrypted entry data
 */
export async function decryptEntry(
  encrypted: EncryptedEntry | EncryptedEntryV2,
  currentUserId: string,
): Promise<Partial<Entry>> {
  let dek: Uint8Array;

  if (isEncryptedEntryV2(encrypted)) {
    // V2: UEK-based decryption
    dek = await decryptV2(encrypted, currentUserId);
  } else {
    // V1: RSA-based decryption (legacy)
    dek = await decryptV1(encrypted, currentUserId);
  }

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
 * Decrypt DEK using V2 (UEK-based) encryption
 */
async function decryptV2(
  encrypted: EncryptedEntryV2,
  currentUserId: string,
): Promise<Uint8Array> {
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

  console.log("[EntryEncryption] DEK unwrapped using UEK (v2)");
  return dek;
}

/**
 * Decrypt DEK using V1 (RSA-based) encryption (legacy)
 */
async function decryptV1(
  encrypted: EncryptedEntry,
  currentUserId: string,
): Promise<Uint8Array> {
  // Find a wrapped key for this user
  const wrappedKey = encrypted.wrappedKeys.find(
    (wk) => wk.userId === currentUserId,
  );

  if (!wrappedKey) {
    throw new Error(
      `No access to this entry - no wrapped key found for user ${currentUserId}`,
    );
  }

  // Get private key (legacy RSA)
  const privateKey = await getPrivateKey();
  if (!privateKey) {
    throw new Error(
      "No RSA private key available - cannot decrypt v1 entry. " +
        "This entry was encrypted with the old RSA-based system.",
    );
  }

  // Unwrap DEK using RSA-OAEP
  const dek = await unwrapDEK(wrappedKey.wrappedDek, privateKey);

  console.log("[EntryEncryption] DEK unwrapped using RSA (v1 legacy)");
  return dek;
}

/**
 * Check if a user has access to an encrypted entry
 */
export function hasAccess(
  encrypted: EncryptedEntry | EncryptedEntryV2,
  userId: string,
): boolean {
  if (isEncryptedEntryV2(encrypted)) {
    return encrypted.wrappedKey.userId === userId;
  }
  return encrypted.wrappedKeys.some((wk) => wk.userId === userId);
}

/**
 * Get list of users who have access to an entry
 */
export function getAuthorizedUsers(
  encrypted: EncryptedEntry | EncryptedEntryV2,
): string[] {
  if (isEncryptedEntryV2(encrypted)) {
    return [encrypted.wrappedKey.userId];
  }
  return [...new Set(encrypted.wrappedKeys.map((wk) => wk.userId))];
}

// ============================================================================
// Deprecated functions (V1 sharing - not supported in V2)
// ============================================================================

/**
 * @deprecated Sharing is not supported in V2 (UEK-based) encryption.
 * In V2, each user has their own UEK and cannot share entries.
 * Future sharing would require re-encrypting with recipient's UEK.
 */
export async function addSharedUser(
  _encrypted: EncryptedEntry,
  _currentUserId: string,
  _newUserId: string,
  _serverUrl: string,
  _getToken: () => Promise<string | null>,
): Promise<WrappedKey[]> {
  throw new Error(
    "Sharing is not supported in V2 (UEK-based) encryption. " +
      "Each user has their own UEK and entries cannot be shared directly.",
  );
}

/**
 * @deprecated Not applicable for V2 encryption
 */
export function removeSharedUser(
  _encrypted: EncryptedEntry,
  _userIdToRemove: string,
): WrappedKey[] {
  throw new Error("removeSharedUser is not supported in V2 encryption.");
}
