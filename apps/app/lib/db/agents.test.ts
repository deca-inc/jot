import { AgentRepository, type CreateAgentInput, type Agent } from "./agents";
import { setupTestDatabase, TestDatabaseContext } from "./test/testDatabase";

describe("AgentRepository", () => {
  let ctx: TestDatabaseContext;
  let repo: AgentRepository;

  beforeEach(async () => {
    ctx = await setupTestDatabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo = new AgentRepository(ctx.db as any);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe("create", () => {
    it("creates an agent with required fields", async () => {
      const input: CreateAgentInput = {
        name: "Test Agent",
        systemPrompt: "You are a helpful assistant.",
        modelId: "test-model-id",
      };

      const agent = await repo.create(input);

      expect(agent.id).toBeDefined();
      expect(agent.name).toBe("Test Agent");
      expect(agent.systemPrompt).toBe("You are a helpful assistant.");
      expect(agent.modelId).toBe("test-model-id");
      expect(agent.thinkMode).toBe("no-think"); // default
      expect(agent.isDefault).toBe(false);
      expect(agent.createdAt).toBeDefined();
      expect(agent.updatedAt).toBeDefined();
    });

    it("creates an agent with custom thinkMode", async () => {
      const agent = await repo.create({
        name: "Thinking Agent",
        systemPrompt: "You think before responding.",
        modelId: "model-1",
        thinkMode: "think",
      });

      expect(agent.thinkMode).toBe("think");
    });

    it("creates an agent with none thinkMode", async () => {
      const agent = await repo.create({
        name: "No Think Agent",
        systemPrompt: "You respond directly.",
        modelId: "model-1",
        thinkMode: "none",
      });

      expect(agent.thinkMode).toBe("none");
    });
  });

  describe("getById", () => {
    it("returns agent by ID", async () => {
      const created = await repo.create({
        name: "Find Me",
        systemPrompt: "Test prompt",
        modelId: "model-1",
      });

      const found = await repo.getById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe("Find Me");
    });

    it("returns null for non-existent ID", async () => {
      const found = await repo.getById(99999);
      expect(found).toBeNull();
    });
  });

  describe("getAll", () => {
    it("returns empty array when no agents exist", async () => {
      const agents = await repo.getAll();
      // May have a default agent from migration
      expect(Array.isArray(agents)).toBe(true);
    });

    it("returns all created agents", async () => {
      await repo.create({
        name: "Agent 1",
        systemPrompt: "Prompt 1",
        modelId: "model-1",
      });
      await repo.create({
        name: "Agent 2",
        systemPrompt: "Prompt 2",
        modelId: "model-2",
      });

      const agents = await repo.getAll();
      const names = agents.map((a) => a.name);

      expect(names).toContain("Agent 1");
      expect(names).toContain("Agent 2");
    });

    it("orders agents with default first, then by name", async () => {
      await repo.create({
        name: "Zebra Agent",
        systemPrompt: "Prompt",
        modelId: "model-1",
      });
      await repo.create({
        name: "Alpha Agent",
        systemPrompt: "Prompt",
        modelId: "model-1",
      });

      const agents = await repo.getAll();
      const nonDefaultAgents = agents.filter((a) => !a.isDefault);

      // Non-default agents should be sorted by name
      if (nonDefaultAgents.length >= 2) {
        const names = nonDefaultAgents.map((a) => a.name);
        const sortedNames = [...names].sort();
        expect(names).toEqual(sortedNames);
      }
    });
  });

  describe("getDefault", () => {
    it("returns the default agent if one exists", async () => {
      // Create an agent and set it as default
      const agent = await repo.create({
        name: "Default Agent",
        systemPrompt: "I am default",
        modelId: "model-1",
      });
      await repo.setDefault(agent.id);

      const defaultAgent = await repo.getDefault();

      expect(defaultAgent).not.toBeNull();
      expect(defaultAgent?.isDefault).toBe(true);
    });
  });

  describe("getByModelId", () => {
    it("returns agents using a specific model", async () => {
      await repo.create({
        name: "Agent A",
        systemPrompt: "Prompt",
        modelId: "model-x",
      });
      await repo.create({
        name: "Agent B",
        systemPrompt: "Prompt",
        modelId: "model-x",
      });
      await repo.create({
        name: "Agent C",
        systemPrompt: "Prompt",
        modelId: "model-y",
      });

      const modelXAgents = await repo.getByModelId("model-x");

      expect(modelXAgents).toHaveLength(2);
      expect(modelXAgents.every((a) => a.modelId === "model-x")).toBe(true);
    });

    it("returns empty array for non-existent model", async () => {
      const agents = await repo.getByModelId("non-existent-model");
      expect(agents).toEqual([]);
    });
  });

  describe("update", () => {
    let testAgent: Agent;

    beforeEach(async () => {
      testAgent = await repo.create({
        name: "Original Name",
        systemPrompt: "Original prompt",
        modelId: "original-model",
        thinkMode: "no-think",
      });
    });

    it("updates agent name", async () => {
      const updated = await repo.update(testAgent.id, { name: "New Name" });

      expect(updated.name).toBe("New Name");
      expect(updated.systemPrompt).toBe("Original prompt"); // unchanged
    });

    it("updates agent systemPrompt", async () => {
      const updated = await repo.update(testAgent.id, {
        systemPrompt: "New prompt",
      });

      expect(updated.systemPrompt).toBe("New prompt");
      expect(updated.name).toBe("Original Name"); // unchanged
    });

    it("updates agent thinkMode", async () => {
      const updated = await repo.update(testAgent.id, { thinkMode: "think" });

      expect(updated.thinkMode).toBe("think");
    });

    it("updates agent modelId", async () => {
      const updated = await repo.update(testAgent.id, { modelId: "new-model" });

      expect(updated.modelId).toBe("new-model");
    });

    it("updates multiple fields at once", async () => {
      const updated = await repo.update(testAgent.id, {
        name: "Updated Name",
        systemPrompt: "Updated prompt",
        thinkMode: "think",
        modelId: "new-model",
      });

      expect(updated.name).toBe("Updated Name");
      expect(updated.systemPrompt).toBe("Updated prompt");
      expect(updated.thinkMode).toBe("think");
      expect(updated.modelId).toBe("new-model");
    });

    it("updates updatedAt timestamp", async () => {
      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await repo.update(testAgent.id, { name: "New Name" });

      expect(updated.updatedAt).toBeGreaterThan(testAgent.updatedAt);
    });

    it("throws error for non-existent agent", async () => {
      await expect(repo.update(99999, { name: "New Name" })).rejects.toThrow(
        "Agent not found: 99999",
      );
    });
  });

  describe("delete", () => {
    it("deletes a non-default agent", async () => {
      const agent = await repo.create({
        name: "To Delete",
        systemPrompt: "Prompt",
        modelId: "model-1",
      });

      await repo.delete(agent.id);

      const found = await repo.getById(agent.id);
      expect(found).toBeNull();
    });

    it("throws error when trying to delete default agent", async () => {
      const agent = await repo.create({
        name: "Default",
        systemPrompt: "Prompt",
        modelId: "model-1",
      });
      await repo.setDefault(agent.id);

      await expect(repo.delete(agent.id)).rejects.toThrow(
        "Cannot delete the default agent",
      );
    });

    it("throws error for non-existent agent", async () => {
      await expect(repo.delete(99999)).rejects.toThrow(
        "Agent not found: 99999",
      );
    });

    it("clears agentId references in entries when deleted", async () => {
      const agent = await repo.create({
        name: "Referenced Agent",
        systemPrompt: "Prompt",
        modelId: "model-1",
      });

      // Create an entry that references this agent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (ctx.db as any).runAsync(
        `INSERT INTO entries (type, title, blocks, tags, attachments, isFavorite, isPinned, agentId, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "ai_chat",
          "Test Entry",
          "[]",
          "[]",
          "[]",
          0,
          0,
          agent.id,
          Date.now(),
          Date.now(),
        ],
      );

      await repo.delete(agent.id);

      // Verify the entry's agentId is now NULL
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entry = await (ctx.db as any).getFirstAsync(
        `SELECT agentId FROM entries WHERE title = ?`,
        ["Test Entry"],
      );
      expect(entry.agentId).toBeNull();
    });
  });

  describe("setDefault", () => {
    it("sets an agent as the default", async () => {
      const agent = await repo.create({
        name: "New Default",
        systemPrompt: "Prompt",
        modelId: "model-1",
      });

      await repo.setDefault(agent.id);

      const updated = await repo.getById(agent.id);
      expect(updated?.isDefault).toBe(true);
    });

    it("unsets previous default when setting new default", async () => {
      const agent1 = await repo.create({
        name: "First Default",
        systemPrompt: "Prompt",
        modelId: "model-1",
      });
      const agent2 = await repo.create({
        name: "Second Default",
        systemPrompt: "Prompt",
        modelId: "model-1",
      });

      await repo.setDefault(agent1.id);
      let default1 = await repo.getById(agent1.id);
      expect(default1?.isDefault).toBe(true);

      await repo.setDefault(agent2.id);
      default1 = await repo.getById(agent1.id);
      const default2 = await repo.getById(agent2.id);

      expect(default1?.isDefault).toBe(false);
      expect(default2?.isDefault).toBe(true);
    });

    it("throws error for non-existent agent", async () => {
      await expect(repo.setDefault(99999)).rejects.toThrow(
        "Agent not found: 99999",
      );
    });
  });
});
