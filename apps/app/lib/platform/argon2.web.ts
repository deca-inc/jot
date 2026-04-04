/**
 * Web shim for react-native-argon2
 *
 * Uses PBKDF2 via Web Crypto API as a fallback for Argon2id.
 * TODO: Replace with hash-wasm or argon2-browser for proper Argon2id support
 *
 * WARNING: PBKDF2 is less resistant to GPU/ASIC attacks than Argon2id.
 * This is a development placeholder. For production, use a proper
 * Argon2id WebAssembly implementation.
 */

interface Argon2Options {
  iterations?: number;
  memory?: number;
  parallelism?: number;
  hashLength?: number;
  mode?: string;
  saltEncoding?: string;
}

interface Argon2Result {
  rawHash: string;
  encodedHash: string;
}

/**
 * Fallback key derivation using PBKDF2 via Web Crypto API.
 *
 * TODO: Replace with proper Argon2id WebAssembly implementation
 */
async function argon2(
  password: string,
  salt: string,
  options: Argon2Options = {},
): Promise<Argon2Result> {
  const hashLength = options.hashLength ?? 32;
  const iterations = options.iterations ?? 3;

  // Convert password and salt to bytes
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  // Handle salt encoding
  let saltBytes: Uint8Array;
  if (options.saltEncoding === "hex") {
    saltBytes = hexToUint8Array(salt);
  } else {
    saltBytes = encoder.encode(salt);
  }

  // Use PBKDF2 as a fallback (Web Crypto API)
  // Scale iterations: Argon2 uses ~3 iterations with high memory,
  // PBKDF2 needs many more iterations to compensate
  const pbkdf2Iterations = iterations * 100000;

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: pbkdf2Iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    hashLength * 8,
  );

  const hashBytes = new Uint8Array(derivedBits);
  const rawHash = uint8ArrayToHex(hashBytes);

  return {
    rawHash,
    encodedHash: rawHash,
  };
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export { argon2 };
export default argon2;
