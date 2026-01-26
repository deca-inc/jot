import { Message as LlmMessage } from "react-native-executorch";
import { fitsInContext, truncateContext } from "./contextManager";
import { MODEL_IDS } from "./modelConfig";

describe("contextManager", () => {
  describe("fitsInContext", () => {
    it("returns true for messages that fit within context limit", () => {
      const messages: LlmMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      const result = fitsInContext(
        messages,
        MODEL_IDS["llama-3.2-3b-instruct"],
      );

      expect(result).toBe(true);
    });

    it("returns false for messages that exceed context limit", () => {
      // Create a very long message that exceeds context limits
      const longContent = "x".repeat(20000); // ~5700 tokens at 3.5 chars/token
      const messages: LlmMessage[] = [{ role: "user", content: longContent }];

      const result = fitsInContext(messages, MODEL_IDS["qwen-3-0.6b"]);

      expect(result).toBe(false);
    });

    it("uses default context limit for unknown models", () => {
      const messages: LlmMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      // Even with unknown model ID, should work with default limit
      const result = fitsInContext(
        messages,
        "unknown-model" as unknown as MODEL_IDS,
      );

      expect(result).toBe(true);
    });

    it("accounts for message formatting overhead", () => {
      // Create messages that would fit if overhead wasn't counted
      // Each message adds ~4 tokens overhead
      const nearLimitContent = "x".repeat(5200); // ~1486 tokens
      const messages: LlmMessage[] = [
        { role: "user", content: nearLimitContent },
      ];

      // With overhead (1486 + 4 = 1490), should still fit in 1500 limit
      const result = fitsInContext(messages, MODEL_IDS["qwen-3-0.6b"]);
      expect(result).toBe(true);
    });

    it("handles empty message array", () => {
      const messages: LlmMessage[] = [];

      const result = fitsInContext(
        messages,
        MODEL_IDS["llama-3.2-1b-instruct"],
      );

      expect(result).toBe(true);
    });
  });

  describe("truncateContext", () => {
    it("returns all messages if they fit within limit", () => {
      const messages: LlmMessage[] = [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
      ];

      const result = truncateContext(
        messages,
        MODEL_IDS["llama-3.2-3b-instruct"],
      );

      expect(result).toEqual(messages);
    });

    it("preserves system message when truncating", () => {
      const systemPrompt = "You are a helpful assistant.";
      const longContent = "x".repeat(10000);
      const messages: LlmMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: longContent },
        { role: "assistant", content: "Response" },
        { role: "user", content: "Recent message" },
      ];

      const result = truncateContext(messages, MODEL_IDS["qwen-3-0.6b"]);

      expect(result[0]).toEqual({ role: "system", content: systemPrompt });
    });

    it("keeps most recent messages when truncating", () => {
      const messages: LlmMessage[] = [
        { role: "system", content: "System prompt" },
        { role: "user", content: "x".repeat(5000) }, // Old message
        { role: "assistant", content: "x".repeat(5000) }, // Old response
        { role: "user", content: "Recent question" }, // Recent
        { role: "assistant", content: "Recent answer" }, // Recent
      ];

      const result = truncateContext(messages, MODEL_IDS["qwen-3-0.6b"]);

      // Should have system prompt and most recent messages
      expect(result[0].role).toBe("system");
      // Recent messages should be preserved
      const hasRecentQuestion = result.some(
        (m) => m.content === "Recent question",
      );
      const hasRecentAnswer = result.some((m) => m.content === "Recent answer");
      expect(hasRecentQuestion).toBe(true);
      expect(hasRecentAnswer).toBe(true);
    });

    it("handles messages without system prompt", () => {
      const messages: LlmMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
      ];

      const result = truncateContext(
        messages,
        MODEL_IDS["llama-3.2-1b-instruct"],
      );

      expect(result).toEqual(messages);
      expect(result.find((m) => m.role === "system")).toBeUndefined();
    });

    it("handles empty message array", () => {
      const result = truncateContext([], MODEL_IDS["llama-3.2-1b-instruct"]);

      expect(result).toEqual([]);
    });

    it("handles only system message", () => {
      const messages: LlmMessage[] = [
        { role: "system", content: "You are helpful." },
      ];

      const result = truncateContext(
        messages,
        MODEL_IDS["llama-3.2-1b-instruct"],
      );

      expect(result).toEqual(messages);
    });

    it("truncates progressively from oldest messages", () => {
      const messages: LlmMessage[] = [
        { role: "user", content: "First" },
        { role: "assistant", content: "x".repeat(3000) }, // Takes up space
        { role: "user", content: "Second" },
        { role: "assistant", content: "x".repeat(3000) }, // Takes up space
        { role: "user", content: "Third" },
        { role: "assistant", content: "Fourth" },
      ];

      const result = truncateContext(messages, MODEL_IDS["qwen-3-0.6b"]);

      // Should drop earlier long messages first
      expect(result.length).toBeLessThan(messages.length);
      // Most recent short messages should be kept
      const hasThird = result.some((m) => m.content === "Third");
      const hasFourth = result.some((m) => m.content === "Fourth");
      expect(hasThird).toBe(true);
      expect(hasFourth).toBe(true);
    });

    it("respects different model context limits", () => {
      const messages: LlmMessage[] = [
        { role: "user", content: "x".repeat(7000) }, // ~2000 tokens
        { role: "assistant", content: "Response" },
      ];

      // Small model should truncate
      const smallResult = truncateContext(messages, MODEL_IDS["qwen-3-0.6b"]);
      expect(smallResult.length).toBeLessThan(messages.length);

      // Larger model should keep all
      const largeResult = truncateContext(
        messages,
        MODEL_IDS["llama-3.2-3b-instruct"],
      );
      expect(largeResult).toEqual(messages);
    });
  });
});
