/**
 * File encryption utilities using AES-256-GCM
 *
 * Encrypts files at rest using the app's master key.
 * Each file gets a unique nonce for security.
 *
 * File format: [nonce (12 bytes)][auth tag (16 bytes)][ciphertext]
 */

import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { getMasterKey } from "../encryption/keyDerivation";

// AES-256-GCM parameters
const NONCE_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to base64 string without stack overflow
 * Handles large arrays by building the string in chunks
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000; // 32KB chunks
  const chunks: string[] = [];

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
  }

  return btoa(chunks.join(""));
}

/**
 * Generate a random nonce for encryption
 */
function generateNonce(): Uint8Array {
  return Crypto.getRandomBytes(NONCE_LENGTH);
}

/**
 * Encrypt a file and save to destination using AES-256-GCM
 *
 * File format: [nonce (12 bytes)][auth tag (16 bytes)][ciphertext]
 *
 * @param sourceUri - Source file URI to encrypt
 * @param destUri - Destination URI for encrypted file
 */
export async function encryptFile(
  sourceUri: string,
  destUri: string,
): Promise<void> {
  const masterKeyHex = await getMasterKey();
  if (!masterKeyHex) {
    throw new Error("No master key available for encryption");
  }

  const masterKey = hexToBytes(masterKeyHex);

  // Read source file as base64
  const base64Content = await FileSystem.readAsStringAsync(sourceUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Convert base64 to binary
  const binaryString = atob(base64Content);
  const data = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    data[i] = binaryString.charCodeAt(i);
  }

  // Generate nonce
  const nonce = generateNonce();

  // Import master key for AES-GCM
  const key = await crypto.subtle.importKey(
    "raw",
    masterKey.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  // Encrypt with AES-256-GCM
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce.buffer as ArrayBuffer,
      tagLength: AUTH_TAG_LENGTH * 8,
    },
    key,
    data.buffer as ArrayBuffer,
  );

  const encrypted = new Uint8Array(encryptedBuffer);

  // GCM appends auth tag to ciphertext - separate them
  const ciphertext = encrypted.slice(0, -AUTH_TAG_LENGTH);
  const authTag = encrypted.slice(-AUTH_TAG_LENGTH);

  // Combine: [nonce][authTag][ciphertext]
  const result = new Uint8Array(
    NONCE_LENGTH + AUTH_TAG_LENGTH + ciphertext.length,
  );
  result.set(nonce, 0);
  result.set(authTag, NONCE_LENGTH);
  result.set(ciphertext, NONCE_LENGTH + AUTH_TAG_LENGTH);

  // Convert to base64 and write
  const resultBase64 = uint8ArrayToBase64(result);
  await FileSystem.writeAsStringAsync(destUri, resultBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/**
 * Decrypt a file and return as a temporary unencrypted file
 *
 * File format: [nonce (12 bytes)][auth tag (16 bytes)][ciphertext]
 *
 * @param encryptedUri - URI of encrypted file
 * @param destUri - Destination URI for decrypted file
 */
export async function decryptFile(
  encryptedUri: string,
  destUri: string,
): Promise<void> {
  const masterKeyHex = await getMasterKey();
  if (!masterKeyHex) {
    throw new Error("No master key available for decryption");
  }

  const masterKey = hexToBytes(masterKeyHex);

  // Read encrypted file as base64
  const base64Content = await FileSystem.readAsStringAsync(encryptedUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Convert base64 to binary
  const binaryString = atob(base64Content);
  const encryptedBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    encryptedBytes[i] = binaryString.charCodeAt(i);
  }

  // Extract nonce, auth tag, and ciphertext
  const nonce = encryptedBytes.slice(0, NONCE_LENGTH);
  const authTag = encryptedBytes.slice(
    NONCE_LENGTH,
    NONCE_LENGTH + AUTH_TAG_LENGTH,
  );
  const ciphertext = encryptedBytes.slice(NONCE_LENGTH + AUTH_TAG_LENGTH);

  // Combine ciphertext and auth tag (GCM expects them together)
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);

  // Import master key for AES-GCM
  const key = await crypto.subtle.importKey(
    "raw",
    masterKey.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  // Decrypt with AES-256-GCM
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: nonce.buffer as ArrayBuffer,
      tagLength: AUTH_TAG_LENGTH * 8,
    },
    key,
    combined.buffer as ArrayBuffer,
  );

  const decryptedData = new Uint8Array(decryptedBuffer);

  // Convert to base64 and write
  const resultBase64 = uint8ArrayToBase64(decryptedData);
  await FileSystem.writeAsStringAsync(destUri, resultBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/**
 * Read encrypted file and return as base64 data URI
 * Useful for playing audio or displaying images without writing temp files
 *
 * File format: [nonce (12 bytes)][auth tag (16 bytes)][ciphertext]
 */
export async function readEncryptedAsDataUri(
  encryptedUri: string,
  mimeType: string,
): Promise<string> {
  const masterKeyHex = await getMasterKey();
  if (!masterKeyHex) {
    throw new Error("No master key available for decryption");
  }

  const masterKey = hexToBytes(masterKeyHex);

  // Read encrypted file as base64
  const base64Content = await FileSystem.readAsStringAsync(encryptedUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Convert base64 to binary
  const binaryString = atob(base64Content);
  const encryptedBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    encryptedBytes[i] = binaryString.charCodeAt(i);
  }

  // Extract nonce, auth tag, and ciphertext
  const nonce = encryptedBytes.slice(0, NONCE_LENGTH);
  const authTag = encryptedBytes.slice(
    NONCE_LENGTH,
    NONCE_LENGTH + AUTH_TAG_LENGTH,
  );
  const ciphertext = encryptedBytes.slice(NONCE_LENGTH + AUTH_TAG_LENGTH);

  // Combine ciphertext and auth tag (GCM expects them together)
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);

  // Import master key for AES-GCM
  const key = await crypto.subtle.importKey(
    "raw",
    masterKey.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  // Decrypt with AES-256-GCM
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: nonce.buffer as ArrayBuffer,
      tagLength: AUTH_TAG_LENGTH * 8,
    },
    key,
    combined.buffer as ArrayBuffer,
  );

  const decryptedData = new Uint8Array(decryptedBuffer);

  // Convert to base64 data URI
  const decryptedBase64 = uint8ArrayToBase64(decryptedData);
  return `data:${mimeType};base64,${decryptedBase64}`;
}
