import { CustomModelsRepository, type DatabaseAdapter } from "./customModels";
import type {
  CreateCustomLocalModelInput,
  CreateRemoteModelInput,
} from "../ai/customModels";

// Mock database type with access to mock methods
interface MockedDb {
  runAsync: jest.Mock;
  getFirstAsync: jest.Mock;
  getAllAsync: jest.Mock;
}

// Mock the database adapter
const createMockDb = () => ({
  runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1 }),
  getFirstAsync: jest.fn(),
  getAllAsync: jest.fn().mockResolvedValue([]),
});

describe("CustomModelsRepository", () => {
  let mockDb: MockedDb;
  let repo: CustomModelsRepository;

  beforeEach(() => {
    mockDb = createMockDb();
    repo = new CustomModelsRepository(mockDb as unknown as DatabaseAdapter);
    jest.clearAllMocks();
  });

  describe("createCustomLocalModel", () => {
    const input: CreateCustomLocalModelInput = {
      displayName: "My Custom Model",
      description: "A test model",
      folderName: "my-custom-model",
      pteFileName: "model.pte",
      tokenizerFileName: "tokenizer.json",
      modelSize: "7B",
      quantization: "8-bit",
      ramRequired: "8GB",
    };

    it("creates a custom local model with correct modelId prefix", async () => {
      const mockRow = {
        id: 1,
        modelId: "custom-my-custom-model",
        modelType: "custom-local",
        displayName: input.displayName,
        description: input.description,
        folderName: input.folderName,
        pteFileName: input.pteFileName,
        tokenizerFileName: input.tokenizerFileName,
        tokenizerConfigFileName: null,
        huggingFaceUrl: null,
        modelSize: input.modelSize,
        quantization: input.quantization,
        ramRequired: input.ramRequired,
        providerId: null,
        baseUrl: null,
        modelName: null,
        apiKeyRef: null,
        customHeaders: null,
        maxTokens: null,
        temperature: null,
        isEnabled: 1,
        privacyAcknowledged: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockDb.getFirstAsync.mockResolvedValue(mockRow);

      const result = await repo.createCustomLocalModel(input);

      expect(result.modelId).toMatch(/^custom-/);
      expect(result.modelType).toBe("custom-local");
      expect(result.displayName).toBe(input.displayName);
      expect(result.folderName).toBe(input.folderName);
      expect(result.isEnabled).toBe(true);
    });

    it("generates a unique modelId based on folder name", async () => {
      const mockRow = {
        id: 1,
        modelId: "custom-my-custom-model",
        modelType: "custom-local",
        displayName: input.displayName,
        description: input.description,
        folderName: input.folderName,
        pteFileName: input.pteFileName,
        tokenizerFileName: input.tokenizerFileName,
        tokenizerConfigFileName: null,
        huggingFaceUrl: null,
        modelSize: input.modelSize,
        quantization: input.quantization,
        ramRequired: input.ramRequired,
        providerId: null,
        baseUrl: null,
        modelName: null,
        apiKeyRef: null,
        customHeaders: null,
        maxTokens: null,
        temperature: null,
        isEnabled: 1,
        privacyAcknowledged: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockDb.getFirstAsync.mockResolvedValue(mockRow);

      await repo.createCustomLocalModel(input);

      expect(mockDb.runAsync).toHaveBeenCalled();
      const callArgs = mockDb.runAsync.mock.calls[0];
      // modelId should be in the parameter array
      expect(callArgs[1]).toContain("custom-my-custom-model");
    });
  });

  describe("createRemoteModel", () => {
    const input: CreateRemoteModelInput = {
      displayName: "GPT-4",
      description: "OpenAI GPT-4",
      providerId: "openai",
      baseUrl: "https://api.openai.com/v1",
      modelName: "gpt-4-turbo",
      maxTokens: 4096,
      temperature: 0.7,
    };

    it("creates a remote model with correct modelId prefix", async () => {
      const mockRow = {
        id: 1,
        modelId: "remote-openai-gpt-4-turbo",
        modelType: "remote-api",
        displayName: input.displayName,
        description: input.description,
        folderName: null,
        pteFileName: null,
        tokenizerFileName: null,
        tokenizerConfigFileName: null,
        huggingFaceUrl: null,
        modelSize: null,
        quantization: null,
        ramRequired: null,
        providerId: input.providerId,
        baseUrl: input.baseUrl,
        modelName: input.modelName,
        apiKeyRef: "remote-openai-gpt-4-turbo-key",
        customHeaders: null,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        isEnabled: 1,
        privacyAcknowledged: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockDb.getFirstAsync.mockResolvedValue(mockRow);

      const result = await repo.createRemoteModel(input);

      expect(result.modelId).toMatch(/^remote-/);
      expect(result.modelType).toBe("remote-api");
      expect(result.providerId).toBe("openai");
      expect(result.apiKeyRef).toBeTruthy();
      expect(result.privacyAcknowledged).toBe(false);
    });

    it("generates apiKeyRef based on modelId", async () => {
      const mockRow = {
        id: 1,
        modelId: "remote-openai-gpt-4-turbo",
        modelType: "remote-api",
        displayName: input.displayName,
        description: input.description,
        folderName: null,
        pteFileName: null,
        tokenizerFileName: null,
        tokenizerConfigFileName: null,
        huggingFaceUrl: null,
        modelSize: null,
        quantization: null,
        ramRequired: null,
        providerId: input.providerId,
        baseUrl: input.baseUrl,
        modelName: input.modelName,
        apiKeyRef: "remote-openai-gpt-4-turbo-key",
        customHeaders: null,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        isEnabled: 1,
        privacyAcknowledged: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockDb.getFirstAsync.mockResolvedValue(mockRow);

      const result = await repo.createRemoteModel(input);

      expect(result.apiKeyRef).toContain("-key");
    });
  });

  describe("getAll", () => {
    it("returns all custom models", async () => {
      const mockRows = [
        {
          id: 1,
          modelId: "custom-model-1",
          modelType: "custom-local",
          displayName: "Model 1",
          description: null,
          folderName: "model-1",
          pteFileName: "model.pte",
          tokenizerFileName: null,
          tokenizerConfigFileName: null,
          huggingFaceUrl: null,
          modelSize: null,
          quantization: null,
          ramRequired: null,
          providerId: null,
          baseUrl: null,
          modelName: null,
          apiKeyRef: null,
          customHeaders: null,
          maxTokens: null,
          temperature: null,
          isEnabled: 1,
          privacyAcknowledged: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 2,
          modelId: "remote-openai-gpt-4",
          modelType: "remote-api",
          displayName: "GPT-4",
          description: null,
          folderName: null,
          pteFileName: null,
          tokenizerFileName: null,
          tokenizerConfigFileName: null,
          huggingFaceUrl: null,
          modelSize: null,
          quantization: null,
          ramRequired: null,
          providerId: "openai",
          baseUrl: "https://api.openai.com/v1",
          modelName: "gpt-4",
          apiKeyRef: "remote-openai-gpt-4-key",
          customHeaders: null,
          maxTokens: 4096,
          temperature: 0.7,
          isEnabled: 1,
          privacyAcknowledged: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      mockDb.getAllAsync.mockResolvedValue(mockRows);

      const results = await repo.getAll();

      expect(results).toHaveLength(2);
      expect(results[0].modelType).toBe("custom-local");
      expect(results[1].modelType).toBe("remote-api");
    });
  });

  describe("getByModelId", () => {
    it("returns the correct model", async () => {
      const mockRow = {
        id: 1,
        modelId: "custom-my-model",
        modelType: "custom-local",
        displayName: "My Model",
        description: null,
        folderName: "my-model",
        pteFileName: "model.pte",
        tokenizerFileName: null,
        tokenizerConfigFileName: null,
        huggingFaceUrl: null,
        modelSize: null,
        quantization: null,
        ramRequired: null,
        providerId: null,
        baseUrl: null,
        modelName: null,
        apiKeyRef: null,
        customHeaders: null,
        maxTokens: null,
        temperature: null,
        isEnabled: 1,
        privacyAcknowledged: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockDb.getFirstAsync.mockResolvedValue(mockRow);

      const result = await repo.getByModelId("custom-my-model");

      expect(result).not.toBeNull();
      expect(result?.modelId).toBe("custom-my-model");
    });

    it("returns null for non-existent model", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      const result = await repo.getByModelId("non-existent");

      expect(result).toBeNull();
    });
  });

  describe("getByType", () => {
    it("returns only custom-local models when specified", async () => {
      const mockRows = [
        {
          id: 1,
          modelId: "custom-model-1",
          modelType: "custom-local",
          displayName: "Model 1",
          description: null,
          folderName: "model-1",
          pteFileName: "model.pte",
          tokenizerFileName: null,
          tokenizerConfigFileName: null,
          huggingFaceUrl: null,
          modelSize: null,
          quantization: null,
          ramRequired: null,
          providerId: null,
          baseUrl: null,
          modelName: null,
          apiKeyRef: null,
          customHeaders: null,
          maxTokens: null,
          temperature: null,
          isEnabled: 1,
          privacyAcknowledged: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      mockDb.getAllAsync.mockResolvedValue(mockRows);

      await repo.getByType("custom-local");

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("WHERE modelType = ?"),
        ["custom-local"],
      );
    });

    it("returns only remote-api models when specified", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      await repo.getByType("remote-api");

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("WHERE modelType = ?"),
        ["remote-api"],
      );
    });
  });

  describe("update", () => {
    it("updates model properties", async () => {
      const existingRow = {
        id: 1,
        modelId: "remote-openai-gpt-4",
        modelType: "remote-api",
        displayName: "GPT-4",
        description: null,
        folderName: null,
        pteFileName: null,
        tokenizerFileName: null,
        tokenizerConfigFileName: null,
        huggingFaceUrl: null,
        modelSize: null,
        quantization: null,
        ramRequired: null,
        providerId: "openai",
        baseUrl: "https://api.openai.com/v1",
        modelName: "gpt-4",
        apiKeyRef: "remote-openai-gpt-4-key",
        customHeaders: null,
        maxTokens: 4096,
        temperature: 0.7,
        isEnabled: 1,
        privacyAcknowledged: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockDb.getFirstAsync.mockResolvedValue(existingRow);

      await repo.update("remote-openai-gpt-4", {
        displayName: "GPT-4 Updated",
        privacyAcknowledged: true,
      });

      expect(mockDb.runAsync).toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("deletes a model by modelId", async () => {
      const mockRow = {
        id: 1,
        modelId: "custom-my-model",
        modelType: "custom-local",
        displayName: "My Model",
        description: null,
        folderName: "my-model",
        pteFileName: "model.pte",
        tokenizerFileName: null,
        tokenizerConfigFileName: null,
        huggingFaceUrl: null,
        modelSize: null,
        quantization: null,
        ramRequired: null,
        providerId: null,
        baseUrl: null,
        modelName: null,
        apiKeyRef: null,
        customHeaders: null,
        maxTokens: null,
        temperature: null,
        isEnabled: 1,
        privacyAcknowledged: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockDb.getFirstAsync.mockResolvedValue(mockRow);

      await repo.delete("custom-my-model");

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM custom_models"),
        ["custom-my-model"],
      );
    });

    it("throws error for non-existent model", async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      await expect(repo.delete("non-existent")).rejects.toThrow();
    });
  });

  describe("acknowledgePrivacy", () => {
    it("sets privacyAcknowledged to true for remote models", async () => {
      const mockRow = {
        id: 1,
        modelId: "remote-openai-gpt-4",
        modelType: "remote-api",
        displayName: "GPT-4",
        description: null,
        folderName: null,
        pteFileName: null,
        tokenizerFileName: null,
        tokenizerConfigFileName: null,
        huggingFaceUrl: null,
        modelSize: null,
        quantization: null,
        ramRequired: null,
        providerId: "openai",
        baseUrl: "https://api.openai.com/v1",
        modelName: "gpt-4",
        apiKeyRef: "remote-openai-gpt-4-key",
        customHeaders: null,
        maxTokens: 4096,
        temperature: 0.7,
        isEnabled: 1,
        privacyAcknowledged: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockDb.getFirstAsync.mockResolvedValue(mockRow);

      await repo.acknowledgePrivacy("remote-openai-gpt-4");

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("privacyAcknowledged = 1"),
        expect.any(Array),
      );
    });
  });

  describe("getEnabledModels", () => {
    it("returns only enabled models", async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      await repo.getEnabledModels();

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("WHERE isEnabled = 1"),
        [],
      );
    });
  });
});
