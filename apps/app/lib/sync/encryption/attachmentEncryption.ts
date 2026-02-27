/**
 * Attachment E2EE for Sync
 *
 * Encrypts attachments before uploading to the server and decrypts after downloading.
 * Each attachment is encrypted with a unique DEK wrapped with the user's UEK.
 */

import {
  base64ToUint8Array,
  generateDEK,
  generateNonce,
  uint8ArrayToBase64,
  unwrapDEKSymmetric,
  wrapDEKSymmetric,
} from "./crypto";
import { getUEK } from "./keyManager";

const AUTH_TAG_SIZE = 16; // 128 bits for GCM

export interface EncryptedAttachmentData {
  /** Encrypted file content */
  ciphertext: Uint8Array;
  /** Nonce for content encryption (base64) */
  contentNonce: string;
  /** Auth tag for content (base64) */
  contentAuthTag: string;
  /** DEK wrapped with UEK (base64) */
  wrappedDek: string;
  /** Nonce for DEK wrapping (base64) */
  dekNonce: string;
  /** Auth tag for DEK wrapping (base64) */
  dekAuthTag: string;
}

export interface DecryptionParams {
  /** Encrypted file content */
  ciphertext: Uint8Array;
  /** Nonce for content encryption (base64) */
  contentNonce: string;
  /** Auth tag for content (base64) */
  contentAuthTag: string;
  /** DEK wrapped with UEK (base64) */
  wrappedDek: string;
  /** Nonce for DEK wrapping (base64) */
  dekNonce: string;
  /** Auth tag for DEK wrapping (base64) */
  dekAuthTag: string;
}

/**
 * Encrypt an attachment for upload
 *
 * @param content - File content as Uint8Array
 * @returns Encrypted data with wrapped DEK
 */
export async function encryptAttachmentForUpload(
  content: Uint8Array,
): Promise<EncryptedAttachmentData> {
  const uek = await getUEK();
  if (!uek) {
    throw new Error("UEK not available - user not authenticated");
  }

  // Generate per-attachment DEK
  const dek = generateDEK();
  const contentNonce = generateNonce();

  // Import DEK for Web Crypto API
  const key = await crypto.subtle.importKey(
    "raw",
    dek.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  // Encrypt content with DEK
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: contentNonce.buffer as ArrayBuffer,
      tagLength: AUTH_TAG_SIZE * 8,
    },
    key,
    content.buffer as ArrayBuffer,
  );

  const encrypted = new Uint8Array(encryptedBuffer);

  // GCM appends the auth tag to the ciphertext
  const ciphertext = encrypted.slice(0, -AUTH_TAG_SIZE);
  const contentAuthTag = encrypted.slice(-AUTH_TAG_SIZE);

  // Wrap DEK with UEK
  const { wrappedDek, dekNonce, dekAuthTag } = await wrapDEKSymmetric(dek, uek);

  return {
    ciphertext,
    contentNonce: uint8ArrayToBase64(contentNonce),
    contentAuthTag: uint8ArrayToBase64(contentAuthTag),
    wrappedDek,
    dekNonce,
    dekAuthTag,
  };
}

/**
 * Decrypt an attachment after download
 *
 * @param params - Encrypted data with DEK info
 * @returns Decrypted file content
 */
export async function decryptAttachmentFromDownload(
  params: DecryptionParams,
): Promise<Uint8Array> {
  const uek = await getUEK();
  if (!uek) {
    throw new Error("UEK not available - user not authenticated");
  }

  // Unwrap DEK with UEK
  const dek = await unwrapDEKSymmetric(
    params.wrappedDek,
    params.dekNonce,
    params.dekAuthTag,
    uek,
  );

  // Prepare for decryption
  const contentNonce = base64ToUint8Array(params.contentNonce);
  const contentAuthTag = base64ToUint8Array(params.contentAuthTag);

  // Combine ciphertext and auth tag (GCM expects them together)
  const combined = new Uint8Array(
    params.ciphertext.length + contentAuthTag.length,
  );
  combined.set(params.ciphertext);
  combined.set(contentAuthTag, params.ciphertext.length);

  // Import DEK for Web Crypto API
  const key = await crypto.subtle.importKey(
    "raw",
    dek.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  // Decrypt content
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: contentNonce.buffer as ArrayBuffer,
      tagLength: AUTH_TAG_SIZE * 8,
    },
    key,
    combined.buffer as ArrayBuffer,
  );

  return new Uint8Array(decryptedBuffer);
}

/**
 * Check if an asset needs decryption based on metadata headers
 */
export function isAssetEncrypted(headers: Headers): boolean {
  return headers.get("X-Encrypted") === "true";
}

/**
 * Extract decryption params from response headers
 */
export function getDecryptionParamsFromHeaders(
  headers: Headers,
): Omit<DecryptionParams, "ciphertext"> | null {
  const wrappedDek = headers.get("X-Wrapped-DEK");
  const dekNonce = headers.get("X-DEK-Nonce");
  const dekAuthTag = headers.get("X-DEK-AuthTag");
  const contentNonce = headers.get("X-Content-Nonce");
  const contentAuthTag = headers.get("X-Content-AuthTag");

  if (
    !wrappedDek ||
    !dekNonce ||
    !dekAuthTag ||
    !contentNonce ||
    !contentAuthTag
  ) {
    return null;
  }

  return {
    wrappedDek,
    dekNonce,
    dekAuthTag,
    contentNonce,
    contentAuthTag,
  };
}
