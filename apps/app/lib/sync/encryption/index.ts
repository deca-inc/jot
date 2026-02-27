/**
 * E2EE Encryption Module
 *
 * Provides end-to-end encryption for synced entries using UEK (User Encryption Key).
 *
 * Encryption (UEK-based):
 * - Per-user symmetric key (not per-device)
 * - Key derived from user's password via PBKDF2
 * - All devices with same credentials can decrypt
 */

// Core crypto primitives
export {
  generateDEK,
  generateNonce,
  encryptContent,
  decryptContent,
  // UEK-related
  generateUEK,
  generateSalt,
  deriveKEK,
  wrapUEK,
  unwrapUEK,
  wrapDEKSymmetric,
  unwrapDEKSymmetric,
  // Utilities
  uint8ArrayToBase64,
  base64ToUint8Array,
  // Types
  type EncryptedEntryV2,
} from "./crypto";

// Key management (UEK-based)
export {
  // UEK functions
  hasUEK,
  getUEK,
  storeUEK,
  deleteUEK,
  getUEKVersion,
  isUEKStale,
  createUEKForRegistration,
  unwrapUEKForLogin,
  // Device ID (still used for session tracking)
  getDeviceId,
  // Types
  type UEKRegistrationData,
  type UEKServerData,
} from "./keyManager";

// Entry encryption
export {
  encryptEntry,
  decryptEntry,
  hasAccess,
  getAuthorizedUsers,
} from "./entryEncryption";

// Attachment encryption
export {
  encryptAttachmentForUpload,
  decryptAttachmentFromDownload,
  isAssetEncrypted,
  getDecryptionParamsFromHeaders,
  type EncryptedAttachmentData,
  type DecryptionParams,
} from "./attachmentEncryption";
