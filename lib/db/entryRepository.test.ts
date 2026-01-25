import { EntryRepository, type Block, type CreateEntryInput } from "./entries";
import { setupTestDatabase, TestDatabaseContext } from "./test/testDatabase";

describe("EntryRepository", () => {
  let ctx: TestDatabaseContext;
  let repo: EntryRepository;

  beforeEach(async () => {
    ctx = await setupTestDatabase();
    // Cast db to any since it matches the SQLiteDatabase interface
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo = new EntryRepository(ctx.db as any);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe("create", () => {
    it("creates a journal entry with required fields", async () => {
      const input: CreateEntryInput = {
        type: "journal",
        title: "My First Entry",
        blocks: [{ type: "paragraph", content: "Hello world" }],
      };

      const entry = await repo.create(input);

      expect(entry.id).toBeDefined();
      expect(entry.type).toBe("journal");
      expect(entry.title).toBe("My First Entry");
      expect(entry.blocks).toEqual([
        { type: "paragraph", content: "Hello world" },
      ]);
      expect(entry.tags).toEqual([]);
      expect(entry.attachments).toEqual([]);
      expect(entry.isFavorite).toBe(false);
      expect(entry.isPinned).toBe(false);
      expect(entry.archivedAt).toBeNull();
      expect(entry.createdAt).toBeDefined();
      expect(entry.updatedAt).toBeDefined();
    });

    it("creates an entry with tags and attachments", async () => {
      const entry = await repo.create({
        type: "journal",
        title: "Tagged Entry",
        blocks: [],
        tags: ["work", "important"],
        attachments: ["/path/to/file.jpg"],
        isFavorite: true,
      });

      expect(entry.tags).toEqual(["work", "important"]);
      expect(entry.attachments).toEqual(["/path/to/file.jpg"]);
      expect(entry.isFavorite).toBe(true);
    });

    it("defaults isPinned to true for countdown entries", async () => {
      const entry = await repo.create({
        type: "countdown",
        title: "My Countdown",
        blocks: [
          {
            type: "countdown",
            targetDate: Date.now() + 86400000,
            title: "Event",
          },
        ],
      });

      expect(entry.isPinned).toBe(true);
    });

    it("does not auto-pin countdown child entries", async () => {
      const parent = await repo.create({
        type: "countdown",
        title: "Parent Countdown",
        blocks: [],
      });

      const child = await repo.create({
        type: "countdown",
        title: "Child Entry",
        blocks: [],
        parentId: parent.id,
      });

      expect(child.isPinned).toBe(false);
      expect(child.parentId).toBe(parent.id);
    });

    it("creates an ai_chat entry", async () => {
      const entry = await repo.create({
        type: "ai_chat",
        title: "AI Conversation",
        blocks: [
          { type: "markdown", content: "Hello", role: "user" },
          { type: "markdown", content: "Hi there!", role: "assistant" },
        ],
      });

      expect(entry.type).toBe("ai_chat");
      expect(entry.blocks).toHaveLength(2);
      expect(entry.blocks[0].role).toBe("user");
      expect(entry.blocks[1].role).toBe("assistant");
    });
  });

  describe("getById", () => {
    it("returns entry by ID", async () => {
      const created = await repo.create({
        type: "journal",
        title: "Test Entry",
        blocks: [],
      });

      const found = await repo.getById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.title).toBe("Test Entry");
    });

    it("returns null for non-existent ID", async () => {
      const found = await repo.getById(99999);
      expect(found).toBeNull();
    });

    it("returns null for invalid ID", async () => {
      expect(await repo.getById(0)).toBeNull();
      expect(await repo.getById(-1)).toBeNull();
    });
  });

  describe("getAll", () => {
    beforeEach(async () => {
      // Create test entries
      await repo.create({
        type: "journal",
        title: "Journal 1",
        blocks: [],
        tags: ["personal"],
      });
      await repo.create({
        type: "journal",
        title: "Journal 2",
        blocks: [],
        isFavorite: true,
      });
      await repo.create({
        type: "ai_chat",
        title: "Chat 1",
        blocks: [],
      });
      await repo.create({
        type: "countdown",
        title: "Countdown 1",
        blocks: [],
      });
    });

    it("returns all entries", async () => {
      const entries = await repo.getAll();
      expect(entries).toHaveLength(4);
    });

    it("filters by type", async () => {
      const journals = await repo.getAll({ type: "journal" });
      expect(journals).toHaveLength(2);
      expect(journals.every((e) => e.type === "journal")).toBe(true);
    });

    it("filters by favorites", async () => {
      const favorites = await repo.getAll({ isFavorite: true });
      expect(favorites).toHaveLength(1);
      expect(favorites[0].title).toBe("Journal 2");
    });

    it("filters by tag", async () => {
      const tagged = await repo.getAll({ tag: "personal" });
      expect(tagged).toHaveLength(1);
      expect(tagged[0].title).toBe("Journal 1");
    });

    it("respects limit and offset", async () => {
      const limited = await repo.getAll({ limit: 2 });
      expect(limited).toHaveLength(2);

      const offsetted = await repo.getAll({ limit: 2, offset: 2 });
      expect(offsetted).toHaveLength(2);
    });

    it("excludes archived entries by default", async () => {
      // Archive one entry
      const entries = await repo.getAll();
      await repo.update(entries[0].id, { archivedAt: Date.now() });

      const active = await repo.getAll();
      expect(active).toHaveLength(3);

      const withArchived = await repo.getAll({ includeArchived: true });
      expect(withArchived).toHaveLength(4);
    });

    it("filters by date range", async () => {
      const now = Date.now();
      const entries = await repo.getAll({
        dateFrom: now - 1000,
        dateTo: now + 1000,
      });
      expect(entries.length).toBeGreaterThan(0);
    });

    it("excludes child entries by default", async () => {
      const parent = await repo.create({
        type: "journal",
        title: "Parent",
        blocks: [],
      });
      await repo.create({
        type: "journal",
        title: "Child",
        blocks: [],
        parentId: parent.id,
      });

      const withoutChildren = await repo.getAll();
      expect(withoutChildren.find((e) => e.title === "Child")).toBeUndefined();

      const withChildren = await repo.getAll({ includeChildren: true });
      expect(withChildren.find((e) => e.title === "Child")).toBeDefined();
    });

    it("filters by parentId", async () => {
      const parent = await repo.create({
        type: "journal",
        title: "Parent",
        blocks: [],
      });
      await repo.create({
        type: "journal",
        title: "Child 1",
        blocks: [],
        parentId: parent.id,
      });
      await repo.create({
        type: "journal",
        title: "Child 2",
        blocks: [],
        parentId: parent.id,
      });

      const children = await repo.getAll({ parentId: parent.id });
      expect(children).toHaveLength(2);
      expect(children.every((e) => e.parentId === parent.id)).toBe(true);
    });

    it("orders pinned entries first", async () => {
      const entries = await repo.getAll();
      const pinnedEntries = entries.filter((e) => e.isPinned);
      const unpinnedEntries = entries.filter((e) => !e.isPinned);

      // All pinned should come before unpinned
      if (pinnedEntries.length > 0 && unpinnedEntries.length > 0) {
        const lastPinnedIndex = entries.findIndex(
          (e) => e.id === pinnedEntries[pinnedEntries.length - 1].id,
        );
        const firstUnpinnedIndex = entries.findIndex(
          (e) => e.id === unpinnedEntries[0].id,
        );
        expect(lastPinnedIndex).toBeLessThan(firstUnpinnedIndex);
      }
    });
  });

  describe("update", () => {
    it("updates entry title", async () => {
      const entry = await repo.create({
        type: "journal",
        title: "Original Title",
        blocks: [],
      });

      const updated = await repo.update(entry.id, { title: "New Title" });

      expect(updated.title).toBe("New Title");
      expect(updated.updatedAt).toBeGreaterThanOrEqual(entry.updatedAt);
    });

    it("updates entry blocks", async () => {
      const entry = await repo.create({
        type: "journal",
        title: "Test",
        blocks: [{ type: "paragraph", content: "Original" }],
      });

      const newBlocks: Block[] = [
        { type: "paragraph", content: "Updated" },
        { type: "heading1", content: "New Heading" },
      ];

      const updated = await repo.update(entry.id, { blocks: newBlocks });

      expect(updated.blocks).toEqual(newBlocks);
    });

    it("updates favorite status", async () => {
      const entry = await repo.create({
        type: "journal",
        title: "Test",
        blocks: [],
      });

      expect(entry.isFavorite).toBe(false);

      const updated = await repo.update(entry.id, { isFavorite: true });
      expect(updated.isFavorite).toBe(true);
    });

    it("archives and unarchives entry", async () => {
      const entry = await repo.create({
        type: "journal",
        title: "Test",
        blocks: [],
      });

      const archived = await repo.update(entry.id, { archivedAt: Date.now() });
      expect(archived.archivedAt).not.toBeNull();

      const unarchived = await repo.update(entry.id, { archivedAt: null });
      expect(unarchived.archivedAt).toBeNull();
    });

    it("throws error for invalid ID", async () => {
      await expect(repo.update(0, { title: "Test" })).rejects.toThrow(
        "Invalid entry ID",
      );
    });

    it("throws error for non-existent entry", async () => {
      await expect(repo.update(99999, { title: "Test" })).rejects.toThrow();
    });
  });

  describe("delete", () => {
    it("deletes entry by ID", async () => {
      const entry = await repo.create({
        type: "journal",
        title: "To Delete",
        blocks: [],
      });

      await repo.delete(entry.id);

      const found = await repo.getById(entry.id);
      expect(found).toBeNull();
    });

    it("silently returns for invalid ID", async () => {
      // delete is idempotent - invalid IDs are silently ignored
      await expect(repo.delete(0)).resolves.toBeUndefined();
      await expect(repo.delete(-1)).resolves.toBeUndefined();
    });
  });

  describe("search", () => {
    beforeEach(async () => {
      await repo.create({
        type: "journal",
        title: "Meeting Notes",
        blocks: [{ type: "paragraph", content: "Discussed project timeline" }],
      });
      await repo.create({
        type: "journal",
        title: "Shopping List",
        blocks: [{ type: "paragraph", content: "Buy milk and bread" }],
      });
      await repo.create({
        type: "ai_chat",
        title: "AI Chat about project",
        blocks: [{ type: "markdown", content: "Help me with the project" }],
      });
    });

    it("searches by title", async () => {
      const results = await repo.search({ query: "Meeting" });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Meeting Notes");
    });

    it("searches by content", async () => {
      const results = await repo.search({ query: "milk" });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Shopping List");
    });

    it("searches across multiple entries", async () => {
      const results = await repo.search({ query: "project" });
      expect(results).toHaveLength(2);
    });

    it("returns empty for no matches", async () => {
      const results = await repo.search({ query: "nonexistent" });
      expect(results).toHaveLength(0);
    });

    it("returns empty for empty query", async () => {
      const results = await repo.search({ query: "" });
      expect(results).toHaveLength(0);
    });

    it("filters search by type", async () => {
      const results = await repo.search({ query: "project", type: "journal" });
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe("journal");
    });

    it("respects limit in search", async () => {
      const results = await repo.search({ query: "project", limit: 1 });
      expect(results).toHaveLength(1);
    });
  });
});
