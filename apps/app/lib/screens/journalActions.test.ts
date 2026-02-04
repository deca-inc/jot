/**
 * Tests for journal actions - ensuring cache consistency
 *
 * These tests verify that the cache is properly updated when saving journal content,
 * especially when navigating back from the editor.
 */

import {
  saveJournalContent,
  saveJournalContentFireAndForget,
} from "./journalActions";
import type { JournalActionContext } from "./journalActions";
import type { Entry, UpdateEntryInput } from "../db/entries";
import type { UseMutationResult } from "@tanstack/react-query";

// Type for the mutation
type UpdateEntryMutation = UseMutationResult<
  Entry,
  Error,
  { id: number; input: UpdateEntryInput; skipCacheUpdate?: boolean }
>;

describe("journalActions", () => {
  // Mock mutation that tracks calls
  const createMockMutation = () => {
    const calls: Array<{
      id: number;
      input: UpdateEntryInput;
      skipCacheUpdate?: boolean;
    }> = [];

    const mockMutation = {
      mutate: jest.fn(
        (
          variables: {
            id: number;
            input: UpdateEntryInput;
            skipCacheUpdate?: boolean;
          },
          options?: {
            onSuccess?: () => void;
            onError?: (error: Error) => void;
          },
        ) => {
          calls.push(variables);
          // Simulate async success
          setTimeout(() => options?.onSuccess?.(), 0);
        },
      ),
      mutateAsync: jest.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
      isIdle: true,
      data: undefined,
      error: null,
      reset: jest.fn(),
      status: "idle" as const,
      failureCount: 0,
      failureReason: null,
      variables: undefined,
      submittedAt: 0,
      context: undefined,
    } as unknown as UpdateEntryMutation;

    return { mockMutation, calls };
  };

  describe("saveJournalContent", () => {
    it("should skip cache update by default during editing (debounced saves)", async () => {
      const { mockMutation, calls } = createMockMutation();
      const context: JournalActionContext = {
        updateEntry: mockMutation,
      };

      await saveJournalContent(1, "<p>Hello world</p>", "", context);

      expect(calls).toHaveLength(1);
      expect(calls[0].skipCacheUpdate).toBe(true);
    });

    it("should NOT skip cache update when updateCache option is true", async () => {
      const { mockMutation, calls } = createMockMutation();
      const context: JournalActionContext = {
        updateEntry: mockMutation,
      };

      await saveJournalContent(1, "<p>Hello world</p>", "", context, {
        updateCache: true,
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].skipCacheUpdate).toBe(false);
    });

    it("should include correct blocks and title in mutation", async () => {
      const { mockMutation, calls } = createMockMutation();
      const context: JournalActionContext = {
        updateEntry: mockMutation,
      };

      await saveJournalContent(1, "<p>Test content</p>", "My Title", context);

      expect(calls).toHaveLength(1);
      expect(calls[0].id).toBe(1);
      expect(calls[0].input.title).toBe("My Title");
      expect(calls[0].input.blocks).toEqual([
        { type: "html", content: "<p>Test content</p>" },
      ]);
    });

    it("should derive title from content if not provided", async () => {
      const { mockMutation, calls } = createMockMutation();
      const context: JournalActionContext = {
        updateEntry: mockMutation,
      };

      await saveJournalContent(
        1,
        "<p>This is my journal entry</p>",
        "",
        context,
      );

      expect(calls[0].input.title).toBe("This is my journal entry");
    });

    it("should not save if content is empty", async () => {
      const { mockMutation, calls } = createMockMutation();
      const context: JournalActionContext = {
        updateEntry: mockMutation,
      };

      await saveJournalContent(1, "<p></p>", "", context);

      expect(calls).toHaveLength(0);
    });

    it("should not save if content only has HTML tags with no text", async () => {
      const { mockMutation, calls } = createMockMutation();
      const context: JournalActionContext = {
        updateEntry: mockMutation,
      };

      await saveJournalContent(1, "<p>  </p><br><div></div>", "", context);

      expect(calls).toHaveLength(0);
    });
  });

  describe("saveJournalContentFireAndForget", () => {
    it("should always skip cache update (fire-and-forget is for auto-save during editing)", () => {
      const { mockMutation, calls } = createMockMutation();
      const context: JournalActionContext = {
        updateEntry: mockMutation,
      };

      saveJournalContentFireAndForget(1, "<p>Hello</p>", "", context);

      expect(calls).toHaveLength(1);
      expect(calls[0].skipCacheUpdate).toBe(true);
    });
  });
});
