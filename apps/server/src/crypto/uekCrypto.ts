/**
 * Server-Side E2EE Crypto Utilities
 *
 * Provides encryption primitives for server-side key operations:
 * - Symmetric encryption (AES-256-GCM)
 * - UEK (User Encryption Key) wrap/unwrap
 * - DEK wrap/unwrap for key rotation
 *
 * Uses Node.js native crypto module.
 */

import crypto from "crypto";

// Key sizes
const DEK_SIZE = 32; // 256 bits for AES-256
const NONCE_SIZE = 12; // 96 bits for GCM
const AUTH_TAG_SIZE = 16; // 128 bits for GCM
const UEK_SIZE = 32; // 256 bits for UEK
const SALT_SIZE = 32; // 256 bits for PBKDF2 salt
const PBKDF2_ITERATIONS = 600000; // 600K iterations (OWASP recommendation)

/**
 * Generate a random Data Encryption Key (DEK)
 */
export function generateDEK(): Buffer {
  return crypto.randomBytes(DEK_SIZE);
}

/**
 * Generate a random nonce for AES-GCM
 */
export function generateNonce(): Buffer {
  return crypto.randomBytes(NONCE_SIZE);
}

/**
 * Generate a random User Encryption Key (UEK)
 */
export function generateUEK(): Buffer {
  return crypto.randomBytes(UEK_SIZE);
}

/**
 * Generate a random salt for PBKDF2
 */
export function generateSalt(): Buffer {
  return crypto.randomBytes(SALT_SIZE);
}

/**
 * Derive a Key Encryption Key (KEK) from password using PBKDF2
 *
 * @param password - User's password
 * @param salt - Random salt (stored with wrapped UEK)
 * @returns 256-bit KEK for wrapping/unwrapping UEK
 */
export function deriveKEK(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256");
}

/**
 * Derive KEK asynchronously (preferred for production)
 */
export async function deriveKEKAsync(
  password: string,
  salt: Buffer,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, 32, "sha256", (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/**
 * Encrypt with AES-256-GCM
 *
 * @param plaintext - Content to encrypt
 * @param key - 256-bit encryption key
 * @returns { ciphertext, nonce, authTag }
 */
export function encryptAesGcm(
  plaintext: Buffer,
  key: Buffer,
): { ciphertext: Buffer; nonce: Buffer; authTag: Buffer } {
  const nonce = generateNonce();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return { ciphertext, nonce, authTag };
}

/**
 * Decrypt with AES-256-GCM
 *
 * @param ciphertext - Encrypted content
 * @param nonce - Nonce/IV used for encryption
 * @param authTag - Authentication tag
 * @param key - 256-bit encryption key
 * @returns Decrypted plaintext
 */
export function decryptAesGcm(
  ciphertext: Buffer,
  nonce: Buffer,
  authTag: Buffer,
  key: Buffer,
): Buffer {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
}

/**
 * Wrap UEK with KEK using AES-GCM
 *
 * @param uek - The User Encryption Key to wrap
 * @param kek - Key Encryption Key (derived from password)
 * @returns { wrappedUek, nonce, authTag } - All base64 encoded
 */
export function wrapUEK(
  uek: Buffer,
  kek: Buffer,
): { wrappedUek: string; nonce: string; authTag: string } {
  const { ciphertext, nonce, authTag } = encryptAesGcm(uek, kek);

  return {
    wrappedUek: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * Unwrap UEK using KEK with AES-GCM
 *
 * @param wrappedUek - Base64 encoded wrapped UEK
 * @param nonce - Base64 encoded nonce
 * @param authTag - Base64 encoded authentication tag
 * @param kek - Key Encryption Key (derived from password)
 * @returns The unwrapped UEK
 */
export function unwrapUEK(
  wrappedUek: string,
  nonce: string,
  authTag: string,
  kek: Buffer,
): Buffer {
  return decryptAesGcm(
    Buffer.from(wrappedUek, "base64"),
    Buffer.from(nonce, "base64"),
    Buffer.from(authTag, "base64"),
    kek,
  );
}

/**
 * Wrap DEK with UEK using AES-GCM
 *
 * @param dek - The DEK to wrap
 * @param uek - User Encryption Key
 * @returns { wrappedDek, dekNonce, dekAuthTag } - All base64 encoded
 */
export function wrapDEK(
  dek: Buffer,
  uek: Buffer,
): { wrappedDek: string; dekNonce: string; dekAuthTag: string } {
  const { ciphertext, nonce, authTag } = encryptAesGcm(dek, uek);

  return {
    wrappedDek: ciphertext.toString("base64"),
    dekNonce: nonce.toString("base64"),
    dekAuthTag: authTag.toString("base64"),
  };
}

/**
 * Unwrap DEK using UEK with AES-GCM
 *
 * @param wrappedDek - Base64 encoded wrapped DEK
 * @param dekNonce - Base64 encoded nonce
 * @param dekAuthTag - Base64 encoded authentication tag
 * @param uek - User Encryption Key
 * @returns The unwrapped DEK
 */
export function unwrapDEK(
  wrappedDek: string,
  dekNonce: string,
  dekAuthTag: string,
  uek: Buffer,
): Buffer {
  return decryptAesGcm(
    Buffer.from(wrappedDek, "base64"),
    Buffer.from(dekNonce, "base64"),
    Buffer.from(dekAuthTag, "base64"),
    uek,
  );
}

/**
 * Re-wrap a DEK with a new UEK (for key rotation)
 *
 * @param wrappedDek - Base64 encoded DEK wrapped with old UEK
 * @param dekNonce - Base64 encoded nonce
 * @param dekAuthTag - Base64 encoded auth tag
 * @param oldUek - Old User Encryption Key
 * @param newUek - New User Encryption Key
 * @returns DEK wrapped with new UEK
 */
export function rewrapDEK(
  wrappedDek: string,
  dekNonce: string,
  dekAuthTag: string,
  oldUek: Buffer,
  newUek: Buffer,
): { wrappedDek: string; dekNonce: string; dekAuthTag: string } {
  // Unwrap with old UEK
  const dek = unwrapDEK(wrappedDek, dekNonce, dekAuthTag, oldUek);

  // Re-wrap with new UEK
  return wrapDEK(dek, newUek);
}

/**
 * Create new UEK data for registration or key rotation
 *
 * @param password - User's password
 * @returns New UEK and wrapped data for storage
 */
export function createNewUEK(password: string): {
  uek: Buffer;
  wrappedUek: string;
  salt: string;
  nonce: string;
  authTag: string;
} {
  const uek = generateUEK();
  const salt = generateSalt();
  const kek = deriveKEK(password, salt);
  const wrapped = wrapUEK(uek, kek);

  return {
    uek,
    wrappedUek: wrapped.wrappedUek,
    salt: salt.toString("base64"),
    nonce: wrapped.nonce,
    authTag: wrapped.authTag,
  };
}

// Utility functions for base64 conversion

export function bufferToBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

export function base64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, "base64");
}

// Constants export
export const CRYPTO_CONSTANTS = {
  DEK_SIZE,
  NONCE_SIZE,
  AUTH_TAG_SIZE,
  UEK_SIZE,
  SALT_SIZE,
  PBKDF2_ITERATIONS,
} as const;
