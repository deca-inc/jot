/**
 * E2EE Encryption Module
 *
 * Provides end-to-end encryption for synced entries using UEK (User Encryption Key).
 *
 * V2 Encryption (UEK-based):
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
  // UEK-related (V2)
  generateUEK,
  generateSalt,
  deriveKEK,
  wrapUEK,
  unwrapUEK,
  wrapDEKSymmetric,
  unwrapDEKSymmetric,
  // Legacy RSA (V1 - deprecated)
  generateUserKeypair,
  wrapDEK,
  unwrapDEK,
  // Utilities
  uint8ArrayToBase64,
  base64ToUint8Array,
  // Types
  type EncryptedEntry,
  type EncryptedEntryV2,
  type WrappedKey,
  type UserKeypair,
} from "./crypto";

// Key management (UEK-based)
export {
  // UEK functions (V2)
  hasUEK,
  getUEK,
  storeUEK,
  deleteUEK,
  getUEKVersion,
  createUEKForRegistration,
  unwrapUEKForLogin,
  // Device ID (still used for session tracking)
  getDeviceId,
  // Types
  type UEKRegistrationData,
  type UEKServerData,
  // Legacy functions (deprecated - for V1 compatibility)
  hasKeypair,
  getOrCreateKeypair,
  getPrivateKey,
  deleteKeypair,
  fetchUserDeviceKeys,
  uploadPublicKey,
} from "./keyManager";

// Entry encryption
export {
  encryptEntry,
  decryptEntry,
  hasAccess,
  getAuthorizedUsers,
  // Deprecated
  addSharedUser,
  removeSharedUser,
} from "./entryEncryption";
