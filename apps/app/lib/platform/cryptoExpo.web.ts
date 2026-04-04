/**
 * Web shim for expo-crypto
 *
 * Uses the Web Crypto API (crypto.getRandomValues / crypto.randomUUID)
 * to provide equivalent functionality on web.
 */

export function getRandomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

export async function getRandomBytesAsync(size: number): Promise<Uint8Array> {
  return getRandomBytes(size);
}

export function randomUUID(): string {
  return crypto.randomUUID();
}

export function digest(
  _algorithm: string,
  _data: ArrayBuffer | Uint8Array,
): Promise<ArrayBuffer> {
  // Basic stub - could be implemented with SubtleCrypto if needed
  return Promise.resolve(new ArrayBuffer(32));
}

export const CryptoDigestAlgorithm = {
  SHA1: "SHA-1",
  SHA256: "SHA-256",
  SHA384: "SHA-384",
  SHA512: "SHA-512",
  MD5: "MD5",
} as const;

export const CryptoEncoding = {
  HEX: "hex",
  BASE64: "base64",
} as const;
