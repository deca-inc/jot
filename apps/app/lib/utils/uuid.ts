/**
 * UUIDv7 Generator
 *
 * UUIDv7 is a time-ordered UUID that combines:
 * - 48-bit Unix timestamp (milliseconds) - provides time ordering
 * - 4-bit version (7)
 * - 12-bit random - sub-millisecond uniqueness
 * - 2-bit variant (RFC 4122)
 * - 62-bit random - collision resistance
 *
 * Benefits over UUIDv4:
 * - Sortable by creation time
 * - Better database index performance
 * - Practically zero collision probability
 *
 * Format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 * where x is timestamp/random and y is variant (8, 9, a, or b)
 */

import * as Crypto from "expo-crypto";

/**
 * Generate a UUIDv7 string
 *
 * @returns A UUIDv7 string in standard format (xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx)
 */
export function generateUuidV7(): string {
  const now = Date.now();

  // Get 6 random bytes for the random portion
  const randomBytes = Crypto.getRandomBytes(10);

  // Timestamp (48 bits = 6 bytes)
  // Split into high 32 bits and low 16 bits
  const timestampHigh = Math.floor(now / 0x10000);
  const timestampLow = now & 0xffff;

  // Build the UUID bytes
  const bytes = new Uint8Array(16);

  // Bytes 0-3: timestamp high (32 bits)
  bytes[0] = (timestampHigh >> 24) & 0xff;
  bytes[1] = (timestampHigh >> 16) & 0xff;
  bytes[2] = (timestampHigh >> 8) & 0xff;
  bytes[3] = timestampHigh & 0xff;

  // Bytes 4-5: timestamp low (16 bits)
  bytes[4] = (timestampLow >> 8) & 0xff;
  bytes[5] = timestampLow & 0xff;

  // Byte 6: version (7) in high nibble, random in low nibble
  bytes[6] = (0x7 << 4) | (randomBytes[0] & 0x0f);

  // Byte 7: random
  bytes[7] = randomBytes[1];

  // Byte 8: variant (10xx) in high 2 bits, random in low 6 bits
  bytes[8] = (0x2 << 6) | (randomBytes[2] & 0x3f);

  // Bytes 9-15: random
  bytes[9] = randomBytes[3];
  bytes[10] = randomBytes[4];
  bytes[11] = randomBytes[5];
  bytes[12] = randomBytes[6];
  bytes[13] = randomBytes[7];
  bytes[14] = randomBytes[8];
  bytes[15] = randomBytes[9];

  // Convert to hex string with dashes
  return formatUuid(bytes);
}

/**
 * Format UUID bytes as a standard UUID string
 */
function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * Extract timestamp from a UUIDv7
 *
 * @param uuid A UUIDv7 string
 * @returns Unix timestamp in milliseconds, or null if not a valid UUIDv7
 */
export function extractTimestampFromUuidV7(uuid: string): number | null {
  // Remove dashes and validate length
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32) {
    return null;
  }

  // Check version (should be 7)
  const version = parseInt(hex[12], 16);
  if (version !== 7) {
    return null;
  }

  // Extract timestamp from first 48 bits (12 hex chars)
  const timestampHex = hex.slice(0, 12);
  const timestamp = parseInt(timestampHex, 16);

  return timestamp;
}

/**
 * Validate that a string is a valid UUID format
 *
 * @param uuid The string to validate
 * @returns true if the string is a valid UUID format
 */
export function isValidUuid(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Check if a UUID is a UUIDv7
 *
 * @param uuid The UUID to check
 * @returns true if the UUID is a valid UUIDv7
 */
export function isUuidV7(uuid: string): boolean {
  if (!isValidUuid(uuid)) {
    return false;
  }

  // Check version nibble (position 14-15 in the string, accounting for dashes)
  const versionChar = uuid.charAt(14);
  return versionChar === "7";
}
