/* global module */

// Simple pseudo-random UUID v4 generator for testing
function randomUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Generate random bytes for testing
function getRandomBytes(length) {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

module.exports = {
  randomUUID,
  getRandomBytes,
  digestStringAsync: async () => "mockedHash",
  CryptoDigestAlgorithm: {
    SHA256: "SHA-256",
    SHA512: "SHA-512",
  },
};
