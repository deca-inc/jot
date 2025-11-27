/**
 * Hook for managing incomplete generation detection and resumption
 */

import { useEffect, useState, useCallback } from "react";
import { useDatabase } from "../db/DatabaseProvider";
import {
  generationResumption,
  type IncompleteGeneration,
} from "./generationResumption";
import { useUpdateEntry } from "../db/useEntries";
import { llmManager } from "./ModelProvider";
import { getModelById } from "./modelConfig";
import { blocksToLlmMessages } from "./ModelProvider";

export function useGenerationResumption(entryId?: number) {
  const db = useDatabase();
  const [incompleteGenerations, setIncompleteGenerations] = useState<
    IncompleteGeneration[]
  >([]);
  const [currentPrompt, setCurrentPrompt] =
    useState<IncompleteGeneration | null>(null);
  const updateEntry = useUpdateEntry();

  // Check for incomplete generations on mount and when entryId changes
  useEffect(() => {
    async function checkIncomplete() {
      if (!db) return;

      const incomplete =
        await generationResumption.checkForIncompleteGenerations(db);

      // Filter by entryId if provided (for inline prompts in specific conversations)
      const filtered = entryId
        ? incomplete.filter((gen) => gen.entry.id === entryId)
        : incomplete;

      setIncompleteGenerations(filtered);

      // Show prompt for the first one (or the one matching entryId)
      if (filtered.length > 0) {
        setCurrentPrompt(filtered[0]);
      } else {
        setCurrentPrompt(null);
      }
    }

    // Delay check slightly to let app fully initialize
    const timer = setTimeout(checkIncomplete, 2000);
    return () => clearTimeout(timer);
  }, [db, entryId]);

  // Also check when entry data changes (e.g., after resume/dismiss)
  // This ensures the prompt disappears when generation status changes
  useEffect(() => {
    async function recheckIncomplete() {
      if (!db || !entryId) return;

      const incomplete =
        await generationResumption.checkForIncompleteGenerations(db);
      const filtered = incomplete.filter((gen) => gen.entry.id === entryId);

      if (filtered.length === 0) {
        // No incomplete generations for this entry, clear the prompt
        setCurrentPrompt(null);
        setIncompleteGenerations([]);
      }
    }

    // Recheck periodically (every 2 seconds) to catch status changes
    const interval = setInterval(recheckIncomplete, 2000);
    return () => clearInterval(interval);
  }, [db, entryId]);

  /**
   * Resume generation for an entry
   */
  const resumeGeneration = useCallback(
    async (generation: IncompleteGeneration) => {
      try {
        console.log(
          `[GenerationResumption] Resuming generation for entry ${generation.entry.id}`
        );

        const entry = generation.entry;
        const modelConfig = entry.generationModelId
          ? getModelById(entry.generationModelId)
          : null;

        if (!modelConfig) {
          console.error(
            `[GenerationResumption] Model not found: ${entry.generationModelId}`
          );
          throw new Error("Model not available for resumption");
        }

        // Get existing messages (everything except the incomplete assistant response)
        const existingBlocks = entry.blocks.slice(0, -1); // Remove last incomplete block

        // Create LLM instance for this conversation
        const convoId = `entry-${entry.id}`;
        const listeners = {
          onToken: (token: string) => {
            // Token streaming is handled by useLLMForConvo if the screen is open
            // Otherwise tokens accumulate in the response
          },
          onMessageHistoryUpdate: async (messages: any[]) => {
            try {
              const updatedBlocks = messages
                .filter((m: any) => m.role !== "system")
                .map((m: any) => ({
                  type: "markdown" as const,
                  content: m.content,
                  role: m.role as "user" | "assistant",
                }));

              updateEntry.mutate({
                id: entry.id,
                input: {
                  blocks: updatedBlocks,
                  generationStatus: "completed",
                },
              });
            } catch (e) {
              console.warn(
                "[GenerationResumption] Failed to write message history:",
                e
              );
            }
          },
        };

        const llmForConvo = await llmManager.getOrCreate(
          convoId,
          modelConfig,
          listeners,
          undefined
        );

        // Convert existing blocks to messages and regenerate
        const messages = blocksToLlmMessages(existingBlocks);

        // Update status to generating
        updateEntry.mutate({
          id: entry.id,
          input: {
            generationStatus: "generating",
            generationStartedAt: Date.now(),
          },
        });

        // Generate response (this will add the assistant block automatically)
        await llmForConvo.generate(messages);

        console.log(
          `[GenerationResumption] Successfully resumed generation for entry ${entry.id}`
        );

        // Remove from incomplete list
        generationResumption.removeIncompleteGeneration(entry.id);

        // Move to next prompt
        const remaining = incompleteGenerations.filter(
          (gen) => gen.entry.id !== entry.id
        );
        setIncompleteGenerations(remaining);
        setCurrentPrompt(remaining.length > 0 ? remaining[0] : null);
      } catch (error) {
        console.error(
          `[GenerationResumption] Failed to resume generation:`,
          error
        );

        // Mark as failed
        try {
          updateEntry.mutate({
            id: generation.entry.id,
            input: {
              generationStatus: "failed",
            },
          });
        } catch (updateError) {
          console.error(
            "[GenerationResumption] Failed to mark as failed:",
            updateError
          );
        }

        throw error;
      }
    },
    [db, updateEntry, incompleteGenerations]
  );

  /**
   * Dismiss a generation prompt (mark as failed)
   */
  const dismissGeneration = useCallback(
    async (generation: IncompleteGeneration) => {
      try {
        console.log(
          `[GenerationResumption] Dismissing generation for entry ${generation.entry.id}`
        );

        // Mark as failed in database
        await generationResumption.markAsFailed(db, generation.entry.id);

        // Remove from incomplete list
        const remaining = incompleteGenerations.filter(
          (gen) => gen.entry.id !== generation.entry.id
        );
        setIncompleteGenerations(remaining);
        setCurrentPrompt(remaining.length > 0 ? remaining[0] : null);
      } catch (error) {
        console.error(
          `[GenerationResumption] Failed to dismiss generation:`,
          error
        );
      }
    },
    [db, incompleteGenerations]
  );

  /**
   * Close the current prompt without taking action
   */
  const closePrompt = useCallback(() => {
    setCurrentPrompt(null);
  }, []);

  /**
   * Clear the current prompt immediately (used when resuming/dismissing)
   */
  const clearCurrentPrompt = useCallback(() => {
    setCurrentPrompt(null);
  }, []);

  return {
    incompleteGenerations,
    currentPrompt,
    resumeGeneration,
    dismissGeneration,
    closePrompt,
    clearCurrentPrompt,
    hasIncompleteGenerations: incompleteGenerations.length > 0,
  };
}
