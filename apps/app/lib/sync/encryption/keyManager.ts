/**
 * Key Manager
 *
 * Manages user's E2EE encryption using UEK (User Encryption Key):
 * - UEK is a per-user symmetric key (not per-device)
 * - UEK is wrapped with KEK derived from user's password
 * - All devices with the same password can access the same UEK
 * - DEKs for entries are wrapped with UEK (not RSA)
 *
 * Key hierarchy:
 * Password → PBKDF2 → KEK (Key Encryption Key)
 *                        ↓
 *              Wrap/Unwrap UEK (User Encryption Key)
 *                        ↓
 *              Wrap/Unwrap DEK per entry
 */

import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import {
  generateUEK,
  generateSalt,
  deriveKEK,
  wrapUEK,
  unwrapUEK,
  uint8ArrayToBase64,
  base64ToUint8Array,
} from "./crypto";

// Storage keys
const UEK_STORAGE_KEY = "jot_e2ee_uek";
const UEK_VERSION_STORAGE_KEY = "jot_e2ee_uek_version";
const DEVICE_ID_STORAGE_KEY = "jot_device_id";

// Legacy storage keys (for migration/cleanup)
const LEGACY_PRIVATE_KEY_STORAGE_KEY = "jot_e2ee_private_key";
const LEGACY_PUBLIC_KEY_STORAGE_KEY = "jot_e2ee_public_key";
const LEGACY_KEY_TYPE_STORAGE_KEY = "jot_e2ee_key_type";

/**
 * UEK data for registration (to be sent to server)
 */
export interface UEKRegistrationData {
  wrappedUek: string;
  salt: string;
  nonce: string;
  authTag: string;
}

/**
 * UEK data received from server
 */
export interface UEKServerData {
  wrappedUek: string;
  salt: string;
  nonce: string;
  authTag: string;
  version: number;
}

/**
 * Get or create a stable device ID for this device
 * (Kept for session tracking, not for E2EE)
 */
export async function getDeviceId(): Promise<string> {
  let deviceId = await SecureStore.getItemAsync(DEVICE_ID_STORAGE_KEY);
  if (!deviceId) {
    deviceId = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_ID_STORAGE_KEY, deviceId);
    console.log("[KeyManager] Generated new device ID:", deviceId);
  }
  return deviceId;
}

/**
 * Check if UEK exists locally
 */
export async function hasUEK(): Promise<boolean> {
  const uek = await SecureStore.getItemAsync(UEK_STORAGE_KEY);
  return uek !== null;
}

/**
 * Store UEK in secure storage
 *
 * @param uek - The unwrapped UEK (Uint8Array)
 * @param version - UEK version number
 */
export async function storeUEK(
  uek: Uint8Array,
  version: number,
): Promise<void> {
  const uekBase64 = uint8ArrayToBase64(uek);
  await SecureStore.setItemAsync(UEK_STORAGE_KEY, uekBase64);
  await SecureStore.setItemAsync(UEK_VERSION_STORAGE_KEY, version.toString());
  console.log("[KeyManager] UEK stored locally (version:", version, ")");
}

/**
 * Get UEK from secure storage
 *
 * @returns The UEK as Uint8Array, or null if not stored
 */
export async function getUEK(): Promise<Uint8Array | null> {
  const uekBase64 = await SecureStore.getItemAsync(UEK_STORAGE_KEY);
  if (!uekBase64) {
    return null;
  }
  return base64ToUint8Array(uekBase64);
}

/**
 * Get UEK version
 */
export async function getUEKVersion(): Promise<number> {
  const version = await SecureStore.getItemAsync(UEK_VERSION_STORAGE_KEY);
  return version ? parseInt(version, 10) : 0;
}

/**
 * Delete UEK from secure storage (for logout/reset)
 */
export async function deleteUEK(): Promise<void> {
  await SecureStore.deleteItemAsync(UEK_STORAGE_KEY);
  await SecureStore.deleteItemAsync(UEK_VERSION_STORAGE_KEY);

  // Also clean up legacy RSA keys if they exist
  await SecureStore.deleteItemAsync(LEGACY_PRIVATE_KEY_STORAGE_KEY);
  await SecureStore.deleteItemAsync(LEGACY_PUBLIC_KEY_STORAGE_KEY);
  await SecureStore.deleteItemAsync(LEGACY_KEY_TYPE_STORAGE_KEY);

  console.log("[KeyManager] UEK deleted from local storage");
}

/**
 * Create UEK for new user registration
 *
 * Generates a new UEK, wraps it with KEK derived from password,
 * and returns both the wrapped data (for server) and unwrapped UEK (for local storage)
 *
 * @param password - User's password (for KEK derivation)
 * @returns { registrationData, uek } - Data to send to server and UEK to store locally
 */
export async function createUEKForRegistration(
  password: string,
): Promise<{ registrationData: UEKRegistrationData; uek: Uint8Array }> {
  console.log("[KeyManager] Creating UEK for registration...");

  // Generate random UEK and salt
  const uek = generateUEK();
  const salt = generateSalt();

  // Derive KEK from password
  const kek = await deriveKEK(password, salt);

  // Wrap UEK with KEK
  const { wrappedUek, nonce, authTag } = await wrapUEK(uek, kek);

  console.log("[KeyManager] UEK created and wrapped for registration");

  return {
    registrationData: {
      wrappedUek,
      salt: uint8ArrayToBase64(salt),
      nonce,
      authTag,
    },
    uek,
  };
}

/**
 * Unwrap UEK received from server during login
 *
 * @param password - User's password (for KEK derivation)
 * @param serverData - UEK data from server
 * @returns The unwrapped UEK
 */
export async function unwrapUEKForLogin(
  password: string,
  serverData: UEKServerData,
): Promise<Uint8Array> {
  console.log("[KeyManager] Unwrapping UEK from server...");

  // Convert salt from base64
  const salt = base64ToUint8Array(serverData.salt);

  // Derive KEK from password
  const kek = await deriveKEK(password, salt);

  // Unwrap UEK
  const uek = await unwrapUEK(
    serverData.wrappedUek,
    serverData.nonce,
    serverData.authTag,
    kek,
  );

  console.log(
    "[KeyManager] UEK unwrapped successfully (version:",
    serverData.version,
    ")",
  );
  return uek;
}

// ============================================================================
// Legacy compatibility functions (deprecated)
// ============================================================================

/**
 * @deprecated Use hasUEK() instead
 */
export async function hasKeypair(): Promise<boolean> {
  // Check for UEK first (new system)
  if (await hasUEK()) {
    return true;
  }
  // Fall back to legacy RSA key check
  const privateKey = await SecureStore.getItemAsync(
    LEGACY_PRIVATE_KEY_STORAGE_KEY,
  );
  return privateKey !== null;
}

/**
 * @deprecated RSA keypairs are no longer used. Use UEK instead.
 */
export async function getOrCreateKeypair(): Promise<{
  privateKey: string;
  publicKey: string;
  keyType: string;
}> {
  // This function is deprecated but kept for backward compatibility
  // during migration. New code should use UEK-based encryption.
  console.warn(
    "[KeyManager] getOrCreateKeypair is deprecated. Use UEK-based encryption instead.",
  );

  const privateKey = await SecureStore.getItemAsync(
    LEGACY_PRIVATE_KEY_STORAGE_KEY,
  );
  const publicKey = await SecureStore.getItemAsync(
    LEGACY_PUBLIC_KEY_STORAGE_KEY,
  );
  const keyType = await SecureStore.getItemAsync(LEGACY_KEY_TYPE_STORAGE_KEY);

  if (privateKey && publicKey && keyType) {
    return { privateKey, publicKey, keyType };
  }

  // Return empty values - new registrations should use UEK
  throw new Error(
    "RSA keypairs are no longer supported. Please re-register to use UEK-based encryption.",
  );
}

/**
 * @deprecated Use getUEK() instead
 */
export async function getPrivateKey(): Promise<string | null> {
  return SecureStore.getItemAsync(LEGACY_PRIVATE_KEY_STORAGE_KEY);
}

/**
 * @deprecated Not needed with UEK - all devices share the same key
 */
export async function fetchUserDeviceKeys(
  _userId: string,
  _serverUrl: string,
  _getToken: () => Promise<string | null>,
): Promise<{ deviceId: string; publicKey: string; keyType: string }[]> {
  console.warn(
    "[KeyManager] fetchUserDeviceKeys is deprecated. UEK-based encryption doesn't require device keys.",
  );
  return [];
}

/**
 * @deprecated Not needed with UEK - key is derived from password
 */
export async function uploadPublicKey(
  _serverUrl: string,
  _getToken: () => Promise<string | null>,
): Promise<boolean> {
  console.warn(
    "[KeyManager] uploadPublicKey is deprecated. UEK-based encryption doesn't require key upload.",
  );
  return true;
}

/**
 * @deprecated Use deleteUEK() instead
 */
export async function deleteKeypair(): Promise<void> {
  await deleteUEK();
}
