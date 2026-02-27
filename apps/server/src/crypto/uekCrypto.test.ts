import {
  generateDEK,
  generateNonce,
  generateUEK,
  generateSalt,
  deriveKEK,
  deriveKEKAsync,
  encryptAesGcm,
  decryptAesGcm,
  wrapUEK,
  unwrapUEK,
  wrapDEK,
  unwrapDEK,
  rewrapDEK,
  createNewUEK,
  bufferToBase64,
  base64ToBuffer,
  CRYPTO_CONSTANTS,
} from "./uekCrypto.js";

describe("uekCrypto", () => {
  describe("key generation", () => {
    test("generateDEK returns 32-byte buffer", () => {
      const dek = generateDEK();
      expect(dek).toBeInstanceOf(Buffer);
      expect(dek.length).toBe(32);
    });

    test("generateNonce returns 12-byte buffer", () => {
      const nonce = generateNonce();
      expect(nonce).toBeInstanceOf(Buffer);
      expect(nonce.length).toBe(12);
    });

    test("generateUEK returns 32-byte buffer", () => {
      const uek = generateUEK();
      expect(uek).toBeInstanceOf(Buffer);
      expect(uek.length).toBe(32);
    });

    test("generateSalt returns 32-byte buffer", () => {
      const salt = generateSalt();
      expect(salt).toBeInstanceOf(Buffer);
      expect(salt.length).toBe(32);
    });

    test("generated keys are random", () => {
      const uek1 = generateUEK();
      const uek2 = generateUEK();
      expect(uek1.equals(uek2)).toBe(false);
    });
  });

  describe("deriveKEK", () => {
    test("derives same KEK from same password and salt", () => {
      const password = "test-password-123";
      const salt = generateSalt();

      const kek1 = deriveKEK(password, salt);
      const kek2 = deriveKEK(password, salt);

      expect(kek1.equals(kek2)).toBe(true);
    });

    test("derives different KEK from different passwords", () => {
      const salt = generateSalt();

      const kek1 = deriveKEK("password1", salt);
      const kek2 = deriveKEK("password2", salt);

      expect(kek1.equals(kek2)).toBe(false);
    });

    test("derives different KEK from different salts", () => {
      const password = "test-password";

      const kek1 = deriveKEK(password, generateSalt());
      const kek2 = deriveKEK(password, generateSalt());

      expect(kek1.equals(kek2)).toBe(false);
    });

    test("deriveKEKAsync returns same result as sync version", async () => {
      const password = "test-password";
      const salt = generateSalt();

      const kekSync = deriveKEK(password, salt);
      const kekAsync = await deriveKEKAsync(password, salt);

      expect(kekSync.equals(kekAsync)).toBe(true);
    });
  });

  describe("AES-GCM encryption", () => {
    test("encrypts and decrypts content correctly", () => {
      const key = generateDEK();
      const plaintext = Buffer.from("Hello, World!");

      const { ciphertext, nonce, authTag } = encryptAesGcm(plaintext, key);
      const decrypted = decryptAesGcm(ciphertext, nonce, authTag, key);

      expect(decrypted.toString()).toBe("Hello, World!");
    });

    test("ciphertext differs from plaintext", () => {
      const key = generateDEK();
      const plaintext = Buffer.from("Secret message");

      const { ciphertext } = encryptAesGcm(plaintext, key);

      expect(ciphertext.equals(plaintext)).toBe(false);
    });

    test("decryption fails with wrong key", () => {
      const key1 = generateDEK();
      const key2 = generateDEK();
      const plaintext = Buffer.from("Secret message");

      const { ciphertext, nonce, authTag } = encryptAesGcm(plaintext, key1);

      expect(() => {
        decryptAesGcm(ciphertext, nonce, authTag, key2);
      }).toThrow();
    });

    test("decryption fails with tampered ciphertext", () => {
      const key = generateDEK();
      const plaintext = Buffer.from("Secret message");

      const { ciphertext, nonce, authTag } = encryptAesGcm(plaintext, key);

      // Tamper with ciphertext
      ciphertext[0] ^= 0xff;

      expect(() => {
        decryptAesGcm(ciphertext, nonce, authTag, key);
      }).toThrow();
    });

    test("decryption fails with tampered auth tag", () => {
      const key = generateDEK();
      const plaintext = Buffer.from("Secret message");

      const { ciphertext, nonce, authTag } = encryptAesGcm(plaintext, key);

      // Tamper with auth tag
      authTag[0] ^= 0xff;

      expect(() => {
        decryptAesGcm(ciphertext, nonce, authTag, key);
      }).toThrow();
    });
  });

  describe("UEK wrap/unwrap", () => {
    test("wraps and unwraps UEK correctly", () => {
      const password = "test-password";
      const salt = generateSalt();
      const kek = deriveKEK(password, salt);
      const uek = generateUEK();

      const { wrappedUek, nonce, authTag } = wrapUEK(uek, kek);
      const unwrapped = unwrapUEK(wrappedUek, nonce, authTag, kek);

      expect(unwrapped.equals(uek)).toBe(true);
    });

    test("returns base64 encoded strings", () => {
      const kek = generateDEK();
      const uek = generateUEK();

      const { wrappedUek, nonce, authTag } = wrapUEK(uek, kek);

      // Base64 should only contain these characters
      const base64Regex = /^[A-Za-z0-9+/]+=*$/;
      expect(wrappedUek).toMatch(base64Regex);
      expect(nonce).toMatch(base64Regex);
      expect(authTag).toMatch(base64Regex);
    });

    test("unwrap fails with wrong password", () => {
      const salt = generateSalt();
      const kek1 = deriveKEK("password1", salt);
      const kek2 = deriveKEK("password2", salt);
      const uek = generateUEK();

      const { wrappedUek, nonce, authTag } = wrapUEK(uek, kek1);

      expect(() => {
        unwrapUEK(wrappedUek, nonce, authTag, kek2);
      }).toThrow();
    });
  });

  describe("DEK wrap/unwrap", () => {
    test("wraps and unwraps DEK correctly", () => {
      const uek = generateUEK();
      const dek = generateDEK();

      const { wrappedDek, dekNonce, dekAuthTag } = wrapDEK(dek, uek);
      const unwrapped = unwrapDEK(wrappedDek, dekNonce, dekAuthTag, uek);

      expect(unwrapped.equals(dek)).toBe(true);
    });

    test("unwrap fails with wrong UEK", () => {
      const uek1 = generateUEK();
      const uek2 = generateUEK();
      const dek = generateDEK();

      const { wrappedDek, dekNonce, dekAuthTag } = wrapDEK(dek, uek1);

      expect(() => {
        unwrapDEK(wrappedDek, dekNonce, dekAuthTag, uek2);
      }).toThrow();
    });
  });

  describe("rewrapDEK", () => {
    test("re-wraps DEK from old UEK to new UEK", () => {
      const oldUek = generateUEK();
      const newUek = generateUEK();
      const originalDek = generateDEK();

      // Wrap with old UEK
      const { wrappedDek, dekNonce, dekAuthTag } = wrapDEK(originalDek, oldUek);

      // Re-wrap with new UEK
      const rewrapped = rewrapDEK(
        wrappedDek,
        dekNonce,
        dekAuthTag,
        oldUek,
        newUek,
      );

      // Unwrap with new UEK should give original DEK
      const unwrapped = unwrapDEK(
        rewrapped.wrappedDek,
        rewrapped.dekNonce,
        rewrapped.dekAuthTag,
        newUek,
      );

      expect(unwrapped.equals(originalDek)).toBe(true);
    });

    test("old UEK cannot unwrap after re-wrap", () => {
      const oldUek = generateUEK();
      const newUek = generateUEK();
      const originalDek = generateDEK();

      const { wrappedDek, dekNonce, dekAuthTag } = wrapDEK(originalDek, oldUek);
      const rewrapped = rewrapDEK(
        wrappedDek,
        dekNonce,
        dekAuthTag,
        oldUek,
        newUek,
      );

      expect(() => {
        unwrapDEK(
          rewrapped.wrappedDek,
          rewrapped.dekNonce,
          rewrapped.dekAuthTag,
          oldUek,
        );
      }).toThrow();
    });
  });

  describe("createNewUEK", () => {
    test("creates new UEK with all required fields", () => {
      const result = createNewUEK("test-password");

      expect(result.uek).toBeInstanceOf(Buffer);
      expect(result.uek.length).toBe(32);
      expect(typeof result.wrappedUek).toBe("string");
      expect(typeof result.salt).toBe("string");
      expect(typeof result.nonce).toBe("string");
      expect(typeof result.authTag).toBe("string");
    });

    test("UEK can be unwrapped with same password", () => {
      const password = "test-password";
      const result = createNewUEK(password);

      const salt = base64ToBuffer(result.salt);
      const kek = deriveKEK(password, salt);
      const unwrapped = unwrapUEK(
        result.wrappedUek,
        result.nonce,
        result.authTag,
        kek,
      );

      expect(unwrapped.equals(result.uek)).toBe(true);
    });
  });

  describe("base64 utilities", () => {
    test("bufferToBase64 converts correctly", () => {
      const buffer = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      expect(bufferToBase64(buffer)).toBe("SGVsbG8=");
    });

    test("base64ToBuffer converts correctly", () => {
      const buffer = base64ToBuffer("SGVsbG8=");
      expect(buffer.toString()).toBe("Hello");
    });

    test("round-trip conversion", () => {
      const original = generateDEK();
      const base64 = bufferToBase64(original);
      const restored = base64ToBuffer(base64);
      expect(restored.equals(original)).toBe(true);
    });
  });

  describe("CRYPTO_CONSTANTS", () => {
    test("exports expected constants", () => {
      expect(CRYPTO_CONSTANTS.DEK_SIZE).toBe(32);
      expect(CRYPTO_CONSTANTS.NONCE_SIZE).toBe(12);
      expect(CRYPTO_CONSTANTS.AUTH_TAG_SIZE).toBe(16);
      expect(CRYPTO_CONSTANTS.UEK_SIZE).toBe(32);
      expect(CRYPTO_CONSTANTS.SALT_SIZE).toBe(32);
      expect(CRYPTO_CONSTANTS.PBKDF2_ITERATIONS).toBe(600000);
    });
  });
});
