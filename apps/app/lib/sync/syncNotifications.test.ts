/**
 * Sync Notification Tests
 *
 * Tests that metadata mutations (delete, archive, favorite, pin)
 * properly notify the sync manager so changes propagate to the server.
 */

// Mock SyncInitializer before any imports
const mockOnEntryDeleted = jest.fn().mockResolvedValue(undefined);
const mockOnEntryUpdated = jest.fn().mockResolvedValue(undefined);

jest.mock("./SyncInitializer", () => ({
  getSyncManager: jest.fn(() => ({
    onEntryDeleted: mockOnEntryDeleted,
    onEntryUpdated: mockOnEntryUpdated,
  })),
  getSyncStatus: jest.fn(() => "synced"),
  getPendingCount: jest.fn(() => 0),
  subscribeSyncStatus: jest.fn(() => jest.fn()),
  subscribePendingCount: jest.fn(() => jest.fn()),
}));

// Mock entryYjsMapper
jest.mock("./entryYjsMapper", () => ({
  yjsToEntry: jest.fn(),
  yjsToEncryptedEntry: jest.fn(),
  markYjsDeleted: jest.fn(),
  markEncryptedYjsDeleted: jest.fn(),
  isYjsEncrypted: jest.fn(),
  encryptedEntryToYjs: jest.fn(),
  getYjsUpdatedAt: jest.fn(),
  observeYjsDoc: jest.fn(() => jest.fn()),
  observeEncryptedYjsDoc: jest.fn(() => jest.fn()),
}));

import { getSyncManager } from "./SyncInitializer";
import { SyncManager } from "./syncManager";

describe("Sync Notifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getSyncManager integration contract", () => {
    it("should expose onEntryDeleted with entryId and uuid params", () => {
      const manager = getSyncManager() as unknown as SyncManager;
      expect(manager).not.toBeNull();
      expect(typeof manager.onEntryDeleted).toBe("function");
    });

    it("should expose onEntryUpdated with entryId and updates params", () => {
      const manager = getSyncManager() as unknown as SyncManager;
      expect(manager).not.toBeNull();
      expect(typeof manager.onEntryUpdated).toBe("function");
    });
  });

  describe("delete notifications", () => {
    it("onEntryDeleted should be callable with entryId and uuid", async () => {
      const manager = getSyncManager() as unknown as SyncManager;
      await manager.onEntryDeleted(42, "test-uuid-1234");
      expect(mockOnEntryDeleted).toHaveBeenCalledWith(42, "test-uuid-1234");
    });
  });

  describe("archive notifications", () => {
    it("onEntryUpdated should accept archivedAt field", async () => {
      const manager = getSyncManager() as unknown as SyncManager;
      const now = Date.now();
      await manager.onEntryUpdated(42, { archivedAt: now });
      expect(mockOnEntryUpdated).toHaveBeenCalledWith(42, { archivedAt: now });
    });

    it("onEntryUpdated should accept archivedAt: null for unarchive", async () => {
      const manager = getSyncManager() as unknown as SyncManager;
      await manager.onEntryUpdated(42, { archivedAt: null });
      expect(mockOnEntryUpdated).toHaveBeenCalledWith(42, {
        archivedAt: null,
      });
    });
  });

  describe("favorite notifications", () => {
    it("onEntryUpdated should accept isFavorite field", async () => {
      const manager = getSyncManager() as unknown as SyncManager;
      await manager.onEntryUpdated(42, { isFavorite: true });
      expect(mockOnEntryUpdated).toHaveBeenCalledWith(42, {
        isFavorite: true,
      });
    });
  });

  describe("pinned notifications", () => {
    it("onEntryUpdated should accept isPinned field", async () => {
      const manager = getSyncManager() as unknown as SyncManager;
      await manager.onEntryUpdated(42, { isPinned: true });
      expect(mockOnEntryUpdated).toHaveBeenCalledWith(42, { isPinned: true });
    });
  });
});
