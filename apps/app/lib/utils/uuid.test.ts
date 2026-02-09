import {
  generateUuidV7,
  isValidUuid,
  isUuidV7,
  extractTimestampFromUuidV7,
} from "./uuid";

describe("UUID Utilities", () => {
  describe("generateUuidV7", () => {
    it("should generate a valid UUID format", () => {
      const uuid = generateUuidV7();
      expect(isValidUuid(uuid)).toBe(true);
    });

    it("should generate UUIDv7 (version 7)", () => {
      const uuid = generateUuidV7();
      expect(isUuidV7(uuid)).toBe(true);
    });

    it("should generate unique UUIDs", () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        uuids.add(generateUuidV7());
      }
      expect(uuids.size).toBe(1000);
    });

    it("should generate time-ordered UUIDs", async () => {
      const uuid1 = generateUuidV7();
      // Wait 2ms to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 2));
      const uuid2 = generateUuidV7();

      // UUIDs generated later should sort higher (when timestamps differ)
      expect(uuid2 > uuid1).toBe(true);
    });
  });

  describe("isValidUuid", () => {
    it("should return true for valid UUIDs", () => {
      expect(isValidUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
      expect(isValidUuid("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(true);
    });

    it("should return false for invalid UUIDs", () => {
      expect(isValidUuid("not-a-uuid")).toBe(false);
      expect(isValidUuid("550e8400-e29b-41d4-a716")).toBe(false);
      expect(isValidUuid("550e8400e29b41d4a716446655440000")).toBe(false); // No dashes
      expect(isValidUuid("")).toBe(false);
    });
  });

  describe("isUuidV7", () => {
    it("should return true for UUIDv7", () => {
      const uuid = generateUuidV7();
      expect(isUuidV7(uuid)).toBe(true);
    });

    it("should return false for UUIDv4", () => {
      expect(isUuidV7("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
    });

    it("should return false for invalid UUIDs", () => {
      expect(isUuidV7("not-a-uuid")).toBe(false);
    });
  });

  describe("extractTimestampFromUuidV7", () => {
    it("should extract timestamp from UUIDv7", () => {
      const before = Date.now();
      const uuid = generateUuidV7();
      const after = Date.now();

      const timestamp = extractTimestampFromUuidV7(uuid);
      expect(timestamp).not.toBeNull();
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it("should return null for non-UUIDv7", () => {
      expect(
        extractTimestampFromUuidV7("550e8400-e29b-41d4-a716-446655440000"),
      ).toBeNull();
    });

    it("should return null for invalid UUIDs", () => {
      expect(extractTimestampFromUuidV7("not-a-uuid")).toBeNull();
    });
  });
});
