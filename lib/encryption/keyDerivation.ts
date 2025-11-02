/**
 * Key derivation utilities using Argon2id
 *
 * Generates a 256-bit (32 byte) master key from a user passphrase.
 *
 * Uses Argon2id for memory-hard key derivation, which provides better security
 * against specialized attack hardware compared to PBKDF2.
 *
 * Default key generation uses cryptographically secure random keys for seamless UX.
 * Passphrase-based derivation is available for optional enhanced security mode.
 */

import * as SecureStore from "expo-secure-store";
import { install } from "react-native-quick-crypto";
import argon2 from "react-native-argon2";

// Install global shims (including Buffer) - this sets up global.Buffer
install();

// Use Buffer from global after install (react-native-quick-crypto sets it up)
const Buffer = (global as any).Buffer;

const SALT_KEY = "encryption_salt";
const DERIVED_KEY_STORAGE_KEY = "master_key_encrypted";
const KEY_LENGTH = 32; // 256 bits = 32 bytes

// Argon2id configuration - memory-hard parameters for secure key derivation
const ARGON2_MEMORY = 65536; // 64 MB - good balance of security and performance
const ARGON2_ITERATIONS = 3; // Standard recommendation for Argon2id
const ARGON2_PARALLELISM = 4; // Standard recommendation

/**
 * Generate a random salt for key derivation using expo-crypto
 */
async function generateSalt(): Promise<string> {
  const { getRandomBytes } = await import("expo-crypto");
  // Generate 16 bytes of random data (128 bits)
  const bytes = getRandomBytes(16);

  // Convert to hex string for storage
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Get or create salt for key derivation
 */
async function getOrCreateSalt(): Promise<string> {
  let salt = await SecureStore.getItemAsync(SALT_KEY);
  if (!salt) {
    salt = await generateSalt();
    await SecureStore.setItemAsync(SALT_KEY, salt);
  }
  return salt;
}

/**
 * Convert hex string to Buffer (for react-native-quick-crypto)
 */
function hexToBuffer(hex: string): any {
  return Buffer.from(hex, "hex");
}

/**
 * Convert Buffer to hex string
 */
function bufferToHex(buffer: any): string {
  return buffer.toString("hex");
}

/**
 * Generate a random 256-bit encryption key
 *
 * This generates a cryptographically secure random key for database encryption.
 * The key is automatically stored in the OS keystore (Keychain) for secure access.
 *
 * This approach provides seamless UX (no passphrase needed) while still protecting
 * against lost/stolen devices, nosy processes, and cloud providers, which matches
 * our threat model.
 */
export async function generateMasterKey(): Promise<string> {
  const { getRandomBytes } = await import("expo-crypto");
  // Generate 32 bytes (256 bits) of cryptographically secure random data
  const keyBytes = getRandomBytes(KEY_LENGTH);

  // Convert to hex string for storage
  return bufferToHex(Buffer.from(keyBytes));
}

/**
 * Derive a 256-bit key from passphrase using Argon2id
 *
 * This is kept for optional future use if users want passphrase-based encryption,
 * but by default we use auto-generated keys for better UX.
 *
 * Uses Argon2id (memory-hard) for secure key derivation, providing better
 * protection against specialized attack hardware compared to PBKDF2.
 */
export async function deriveKeyFromPassphrase(
  passphrase: string
): Promise<string> {
  const salt = await getOrCreateSalt();

  // Derive 256-bit key using Argon2id
  // Argon2id provides memory-hard key derivation, making it resistant to
  // specialized attack hardware (ASICs, GPUs) compared to PBKDF2
  const result = await argon2(passphrase, salt, {
    iterations: ARGON2_ITERATIONS,
    memory: ARGON2_MEMORY,
    parallelism: ARGON2_PARALLELISM,
    hashLength: KEY_LENGTH,
    mode: "argon2id",
    saltEncoding: "hex", // Our salt is stored as hex string
  });

  // rawHash is already hex-encoded
  return result.rawHash;
}

/**
 * Store the derived master key securely
 * The key is encrypted with the OS keystore
 */
export async function storeMasterKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(DERIVED_KEY_STORAGE_KEY, key);
}

/**
 * Retrieve the stored master key from secure storage
 */
export async function getMasterKey(): Promise<string | null> {
  return await SecureStore.getItemAsync(DERIVED_KEY_STORAGE_KEY);
}

/**
 * Get or create the master encryption key
 *
 * If no key exists, generates a new cryptographically secure key and stores it.
 * If a key already exists, retrieves it from secure storage.
 *
 * This provides seamless encryption with zero user friction - the key is
 * automatically managed and stored securely in the OS keystore.
 */
export async function getOrCreateMasterKey(): Promise<string> {
  let key = await getMasterKey();
  if (!key) {
    // Generate and store a new key
    key = await generateMasterKey();
    await storeMasterKey(key);
  }
  return key;
}

/**
 * Check if a master key exists (database is encrypted)
 */
export async function hasMasterKey(): Promise<boolean> {
  const key = await getMasterKey();
  return key !== null;
}

/**
 * Clear the master key (e.g., on logout or key change)
 */
export async function clearMasterKey(): Promise<void> {
  await SecureStore.deleteItemAsync(DERIVED_KEY_STORAGE_KEY);
}

/**
 * Clear the salt (use when changing encryption keys)
 */
export async function clearSalt(): Promise<void> {
  await SecureStore.deleteItemAsync(SALT_KEY);
}
