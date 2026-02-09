/**
 * E2EE Crypto Utilities
 *
 * Provides encryption primitives for end-to-end encrypted sync:
 * - Symmetric encryption (AES-256-GCM for content)
 * - UEK (User Encryption Key) management
 * - DEK wrapping with UEK
 *
 * Each entry is encrypted with a unique DEK (Data Encryption Key).
 * The DEK is wrapped with the user's UEK using AES-GCM.
 *
 * Uses react-native-quick-crypto for native crypto operations.
 */

import * as Crypto from "expo-crypto";

// Key sizes
const DEK_SIZE = 32; // 256 bits for AES-256
const NONCE_SIZE = 12; // 96 bits for GCM
const AUTH_TAG_SIZE = 16; // 128 bits for GCM
const UEK_SIZE = 32; // 256 bits for UEK
const SALT_SIZE = 32; // 256 bits for PBKDF2 salt
const PBKDF2_ITERATIONS = 600000; // 600K iterations for PBKDF2

/**
 * Generate a random Data Encryption Key (DEK)
 */
export function generateDEK(): Uint8Array {
  return Crypto.getRandomBytes(DEK_SIZE);
}

/**
 * Generate a random nonce for AES-GCM
 */
export function generateNonce(): Uint8Array {
  return Crypto.getRandomBytes(NONCE_SIZE);
}

/**
 * Encrypt content with AES-256-GCM
 *
 * @param plaintext - Content to encrypt
 * @param dek - Data Encryption Key (256 bits)
 * @returns { ciphertext, nonce, authTag } - All base64 encoded
 */
export async function encryptContent(
  plaintext: string,
  dek: Uint8Array,
): Promise<{ ciphertext: string; nonce: string; authTag: string }> {
  const nonce = generateNonce();
  const plaintextBytes = new TextEncoder().encode(plaintext);

  // Import key for Web Crypto API
  const key = await crypto.subtle.importKey(
    "raw",
    dek.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  // Encrypt with AES-GCM
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce.buffer as ArrayBuffer,
      tagLength: AUTH_TAG_SIZE * 8,
    },
    key,
    plaintextBytes.buffer as ArrayBuffer,
  );

  const encrypted = new Uint8Array(encryptedBuffer);

  // GCM appends the auth tag to the ciphertext
  const ciphertext = encrypted.slice(0, -AUTH_TAG_SIZE);
  const authTag = encrypted.slice(-AUTH_TAG_SIZE);

  return {
    ciphertext: uint8ArrayToBase64(ciphertext),
    nonce: uint8ArrayToBase64(nonce),
    authTag: uint8ArrayToBase64(authTag),
  };
}

/**
 * Decrypt content with AES-256-GCM
 *
 * @param ciphertext - Base64 encoded ciphertext
 * @param nonce - Base64 encoded nonce
 * @param authTag - Base64 encoded authentication tag
 * @param dek - Data Encryption Key (256 bits)
 * @returns Decrypted plaintext
 */
export async function decryptContent(
  ciphertext: string,
  nonce: string,
  authTag: string,
  dek: Uint8Array,
): Promise<string> {
  const ciphertextBytes = base64ToUint8Array(ciphertext);
  const nonceBytes = base64ToUint8Array(nonce);
  const authTagBytes = base64ToUint8Array(authTag);

  // Combine ciphertext and auth tag (GCM expects them together)
  const combined = new Uint8Array(ciphertextBytes.length + authTagBytes.length);
  combined.set(ciphertextBytes);
  combined.set(authTagBytes, ciphertextBytes.length);

  // Import key
  const key = await crypto.subtle.importKey(
    "raw",
    dek.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  // Decrypt
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: nonceBytes.buffer as ArrayBuffer,
      tagLength: AUTH_TAG_SIZE * 8,
    },
    key,
    combined.buffer as ArrayBuffer,
  );

  return new TextDecoder().decode(decryptedBuffer);
}

// ============================================================================
// UEK (User Encryption Key) - Per-user symmetric key encryption
// ============================================================================

/**
 * Generate a random User Encryption Key (UEK)
 */
export function generateUEK(): Uint8Array {
  return Crypto.getRandomBytes(UEK_SIZE);
}

/**
 * Generate a random salt for PBKDF2
 */
export function generateSalt(): Uint8Array {
  return Crypto.getRandomBytes(SALT_SIZE);
}

/**
 * Derive a Key Encryption Key (KEK) from password using PBKDF2
 *
 * @param password - User's password
 * @param salt - Random salt (should be stored with wrapped UEK)
 * @returns 256-bit KEK for wrapping/unwrapping UEK
 */
export async function deriveKEK(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const passwordBytes = new TextEncoder().encode(password);

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBytes.buffer as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  // Derive 256 bits using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256, // 256 bits = 32 bytes
  );

  return new Uint8Array(derivedBits);
}

/**
 * Wrap UEK with KEK using AES-GCM
 *
 * @param uek - The User Encryption Key to wrap
 * @param kek - Key Encryption Key (derived from password)
 * @returns { wrappedUek, nonce, authTag } - All base64 encoded
 */
export async function wrapUEK(
  uek: Uint8Array,
  kek: Uint8Array,
): Promise<{ wrappedUek: string; nonce: string; authTag: string }> {
  const nonce = generateNonce();

  // Import KEK for AES-GCM
  const key = await crypto.subtle.importKey(
    "raw",
    kek.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  // Encrypt UEK with AES-GCM
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce.buffer as ArrayBuffer,
      tagLength: AUTH_TAG_SIZE * 8,
    },
    key,
    uek.buffer as ArrayBuffer,
  );

  const encrypted = new Uint8Array(encryptedBuffer);

  // GCM appends the auth tag to the ciphertext
  const wrappedUekBytes = encrypted.slice(0, -AUTH_TAG_SIZE);
  const authTag = encrypted.slice(-AUTH_TAG_SIZE);

  return {
    wrappedUek: uint8ArrayToBase64(wrappedUekBytes),
    nonce: uint8ArrayToBase64(nonce),
    authTag: uint8ArrayToBase64(authTag),
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
export async function unwrapUEK(
  wrappedUek: string,
  nonce: string,
  authTag: string,
  kek: Uint8Array,
): Promise<Uint8Array> {
  const wrappedBytes = base64ToUint8Array(wrappedUek);
  const nonceBytes = base64ToUint8Array(nonce);
  const authTagBytes = base64ToUint8Array(authTag);

  // Combine wrapped UEK and auth tag (GCM expects them together)
  const combined = new Uint8Array(wrappedBytes.length + authTagBytes.length);
  combined.set(wrappedBytes);
  combined.set(authTagBytes, wrappedBytes.length);

  // Import KEK
  const key = await crypto.subtle.importKey(
    "raw",
    kek.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  // Decrypt
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: nonceBytes.buffer as ArrayBuffer,
      tagLength: AUTH_TAG_SIZE * 8,
    },
    key,
    combined.buffer as ArrayBuffer,
  );

  return new Uint8Array(decryptedBuffer);
}

/**
 * Wrap DEK with UEK using symmetric encryption (AES-GCM)
 *
 * @param dek - The DEK to wrap
 * @param uek - User Encryption Key
 * @returns { wrappedDek, nonce, authTag } - All base64 encoded
 */
export async function wrapDEKSymmetric(
  dek: Uint8Array,
  uek: Uint8Array,
): Promise<{ wrappedDek: string; dekNonce: string; dekAuthTag: string }> {
  const nonce = generateNonce();

  // Import UEK for AES-GCM
  const key = await crypto.subtle.importKey(
    "raw",
    uek.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  // Encrypt DEK with AES-GCM
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce.buffer as ArrayBuffer,
      tagLength: AUTH_TAG_SIZE * 8,
    },
    key,
    dek.buffer as ArrayBuffer,
  );

  const encrypted = new Uint8Array(encryptedBuffer);

  // GCM appends the auth tag to the ciphertext
  const wrappedDekBytes = encrypted.slice(0, -AUTH_TAG_SIZE);
  const authTag = encrypted.slice(-AUTH_TAG_SIZE);

  return {
    wrappedDek: uint8ArrayToBase64(wrappedDekBytes),
    dekNonce: uint8ArrayToBase64(nonce),
    dekAuthTag: uint8ArrayToBase64(authTag),
  };
}

/**
 * Unwrap DEK using UEK with symmetric decryption (AES-GCM)
 *
 * @param wrappedDek - Base64 encoded wrapped DEK
 * @param dekNonce - Base64 encoded nonce
 * @param dekAuthTag - Base64 encoded authentication tag
 * @param uek - User Encryption Key
 * @returns The unwrapped DEK
 */
export async function unwrapDEKSymmetric(
  wrappedDek: string,
  dekNonce: string,
  dekAuthTag: string,
  uek: Uint8Array,
): Promise<Uint8Array> {
  const wrappedBytes = base64ToUint8Array(wrappedDek);
  const nonceBytes = base64ToUint8Array(dekNonce);
  const authTagBytes = base64ToUint8Array(dekAuthTag);

  // Combine wrapped DEK and auth tag (GCM expects them together)
  const combined = new Uint8Array(wrappedBytes.length + authTagBytes.length);
  combined.set(wrappedBytes);
  combined.set(authTagBytes, wrappedBytes.length);

  // Import UEK
  const key = await crypto.subtle.importKey(
    "raw",
    uek.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  // Decrypt
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: nonceBytes.buffer as ArrayBuffer,
      tagLength: AUTH_TAG_SIZE * 8,
    },
    key,
    combined.buffer as ArrayBuffer,
  );

  return new Uint8Array(decryptedBuffer);
}

/**
 * Encrypted entry structure (UEK-based)
 *
 * Each entry is encrypted with a unique DEK (Data Encryption Key).
 * The DEK is wrapped with the user's UEK using AES-GCM.
 */
export interface EncryptedEntryV2 {
  /** Encrypted content (base64) */
  ciphertext: string;
  /** Nonce/IV for AES-GCM content encryption (base64) */
  nonce: string;
  /** Authentication tag for content (base64) */
  authTag: string;
  /** Wrapped DEK for the user */
  wrappedKey: {
    /** User ID who can decrypt */
    userId: string;
    /** DEK encrypted with user's UEK (base64) */
    wrappedDek: string;
    /** Nonce for DEK wrapping (base64) */
    dekNonce: string;
    /** Authentication tag for DEK wrapping (base64) */
    dekAuthTag: string;
  };
  /** Encryption version */
  version: 2;
}

// Utility functions

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
