/**
 * Generation Resumption Service
 *
 * Handles detection and resumption of incomplete AI generations
 * that were interrupted by app crashes, backgrounding, or other issues.
 */

import { Entry, EntryRepository, GenerationStatus } from "../db/entries";
import { SQLiteDatabase } from "expo-sqlite";
import { getModelById } from "./modelConfig";

export interface IncompleteGeneration {
  entry: Entry;
  timeSinceStarted: number; // milliseconds
  modelName: string;
}

/**
 * Service for managing generation resumption
 */
class GenerationResumptionService {
  private incompleteGenerations: IncompleteGeneration[] = [];
  private hasChecked = false;

  /**
   * Check for incomplete generations on app start
   */
  async checkForIncompleteGenerations(
    db: SQLiteDatabase
  ): Promise<IncompleteGeneration[]> {
    if (this.hasChecked) {
      return this.incompleteGenerations;
    }

    try {
      console.log("[GenerationResumption] Checking for incomplete generations...");

      const repo = new EntryRepository(db);
      const incompleteEntries = await repo.findIncompleteGenerations();

      console.log(
        `[GenerationResumption] Found ${incompleteEntries.length} incomplete generation(s)`
      );

      // Map to IncompleteGeneration objects with metadata
      this.incompleteGenerations = incompleteEntries
        .map((entry) => {
          const timeSinceStarted = entry.generationStartedAt
            ? Date.now() - entry.generationStartedAt
            : 0;

          // Get model name from modelId
          const modelConfig = entry.generationModelId
            ? getModelById(entry.generationModelId)
            : null;
          const modelName = modelConfig?.displayName || "Unknown Model";

          return {
            entry,
            timeSinceStarted,
            modelName,
          };
        })
        // Only include entries less than 24 hours old
        .filter((gen) => gen.timeSinceStarted < 24 * 60 * 60 * 1000);

      this.hasChecked = true;

      return this.incompleteGenerations;
    } catch (error) {
      console.error(
        "[GenerationResumption] Error checking for incomplete generations:",
        error
      );
      return [];
    }
  }

  /**
   * Get all incomplete generations
   */
  getIncompleteGenerations(): IncompleteGeneration[] {
    return this.incompleteGenerations;
  }

  /**
   * Remove a generation from the incomplete list
   * (called after resuming or dismissing)
   */
  removeIncompleteGeneration(entryId: number): void {
    this.incompleteGenerations = this.incompleteGenerations.filter(
      (gen) => gen.entry.id !== entryId
    );
  }

  /**
   * Mark a generation as failed and remove from incomplete list
   */
  async markAsFailed(db: SQLiteDatabase, entryId: number): Promise<void> {
    try {
      const repo = new EntryRepository(db);
      await repo.update(entryId, {
        generationStatus: "failed",
      });
      this.removeIncompleteGeneration(entryId);
    } catch (error) {
      console.error(
        `[GenerationResumption] Error marking generation ${entryId} as failed:`,
        error
      );
    }
  }

  /**
   * Reset the check state (useful for testing)
   */
  reset(): void {
    this.incompleteGenerations = [];
    this.hasChecked = false;
  }
}

// Singleton instance
export const generationResumption = new GenerationResumptionService();

