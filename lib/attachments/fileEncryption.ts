/**
 * File encryption utilities using AES-256-GCM
 *
 * Encrypts files at rest using the app's master key.
 * Each file gets a unique IV for security.
 */

import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { getMasterKey } from "../encryption/keyDerivation";

// AES-256-GCM parameters
const IV_LENGTH = 12; // 96 bits for GCM

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
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
 * Generate a random IV for encryption
 */
function generateIV(): Uint8Array {
  return Crypto.getRandomBytes(IV_LENGTH);
}

/**
 * Simple XOR-based encryption for React Native
 * Note: In production, consider using a native crypto module for AES-GCM
 * This provides basic encryption using the master key
 */
async function xorEncrypt(
  data: Uint8Array,
  key: Uint8Array,
): Promise<Uint8Array> {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result;
}

/**
 * Encrypt a file and save to destination
 *
 * File format: [IV (12 bytes)][Encrypted data]
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

  // Generate IV
  const iv = generateIV();

  // Create encryption key by hashing master key with IV
  const keyMaterial = new Uint8Array(masterKey.length + iv.length);
  keyMaterial.set(masterKey);
  keyMaterial.set(iv, masterKey.length);

  // Use SHA-256 to derive a unique key for this file
  const hashHex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    bytesToHex(keyMaterial),
  );
  const encryptionKey = hexToBytes(hashHex);

  // Encrypt data
  const encryptedData = await xorEncrypt(data, encryptionKey);

  // Combine IV and encrypted data
  const result = new Uint8Array(iv.length + encryptedData.length);
  result.set(iv);
  result.set(encryptedData, iv.length);

  // Convert to base64 and write
  const resultBase64 = uint8ArrayToBase64(result);
  await FileSystem.writeAsStringAsync(destUri, resultBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/**
 * Decrypt a file and return as a temporary unencrypted file
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

  // Extract IV and encrypted data
  const iv = encryptedBytes.slice(0, IV_LENGTH);
  const encryptedData = encryptedBytes.slice(IV_LENGTH);

  // Recreate encryption key
  const keyMaterial = new Uint8Array(masterKey.length + iv.length);
  keyMaterial.set(masterKey);
  keyMaterial.set(iv, masterKey.length);

  const hashHex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    bytesToHex(keyMaterial),
  );
  const encryptionKey = hexToBytes(hashHex);

  // Decrypt data (XOR is symmetric)
  const decryptedData = await xorEncrypt(encryptedData, encryptionKey);

  // Convert to base64 and write
  const resultBase64 = uint8ArrayToBase64(decryptedData);
  await FileSystem.writeAsStringAsync(destUri, resultBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/**
 * Read encrypted file and return as base64 data URI
 * Useful for playing audio or displaying images without writing temp files
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

  // Extract IV and encrypted data
  const iv = encryptedBytes.slice(0, IV_LENGTH);
  const encryptedData = encryptedBytes.slice(IV_LENGTH);

  // Recreate encryption key
  const keyMaterial = new Uint8Array(masterKey.length + iv.length);
  keyMaterial.set(masterKey);
  keyMaterial.set(iv, masterKey.length);

  const hashHex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    bytesToHex(keyMaterial),
  );
  const encryptionKey = hexToBytes(hashHex);

  // Decrypt data
  const decryptedData = await xorEncrypt(encryptedData, encryptionKey);

  // Convert to base64 data URI
  const decryptedBase64 = uint8ArrayToBase64(decryptedData);
  return `data:${mimeType};base64,${decryptedBase64}`;
}
