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
 * Check if local UEK is stale compared to server version
 *
 * This can happen when:
 * - Keys were rotated on the server (e.g., via CLI)
 * - User changed password on another device
 *
 * @param serverVersion - The UEK version reported by the server
 * @returns true if local UEK is older than server version
 */
export async function isUEKStale(serverVersion: number): Promise<boolean> {
  const localVersion = await getUEKVersion();
  return serverVersion > localVersion;
}

/**
 * Delete UEK from secure storage (for logout/reset)
 */
export async function deleteUEK(): Promise<void> {
  await SecureStore.deleteItemAsync(UEK_STORAGE_KEY);
  await SecureStore.deleteItemAsync(UEK_VERSION_STORAGE_KEY);
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
  // Generate random UEK and salt
  const uek = generateUEK();
  const salt = generateSalt();

  // Derive KEK from password
  const kek = await deriveKEK(password, salt);

  // Wrap UEK with KEK
  const { wrappedUek, nonce, authTag } = await wrapUEK(uek, kek);

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

  return uek;
}
