/**
 * Entry Actions
 *
 * Action functions for entry operations (rename, delete).
 * Following the action pattern from react-patterns.md
 */

import { Alert } from "react-native";
import type { Entry, UpdateEntryInput } from "../db/entries";
import type { UseMutationResult } from "@tanstack/react-query";

export interface EntryActionContext {
  updateEntry: UseMutationResult<
    Entry,
    Error,
    { id: number; input: UpdateEntryInput },
    unknown
  >;
  deleteEntry: UseMutationResult<number, Error, number, unknown>;
  onNavigateBack?: () => void;
}

/**
 * Rename an entry (AI chat only)
 */
export async function renameEntry(
  entryId: number,
  newTitle: string,
  context: EntryActionContext,
): Promise<void> {
  if (!newTitle.trim()) {
    throw new Error("Title cannot be empty");
  }

  try {
    await context.updateEntry.mutateAsync({
      id: entryId,
      input: { title: newTitle.trim() },
    });
  } catch (error) {
    console.error("[entryActions] Error renaming entry:", error);
    throw error;
  }
}

/**
 * Delete an entry with confirmation
 */
export async function deleteEntry(
  entryId: number,
  context: EntryActionContext,
  options?: {
    confirmTitle?: string;
    confirmMessage?: string;
    skipConfirmation?: boolean;
  },
): Promise<void> {
  const {
    confirmTitle = "Delete Entry",
    confirmMessage = "Are you sure you want to delete this entry? This action cannot be undone.",
    skipConfirmation = false,
  } = options || {};

  return new Promise((resolve, reject) => {
    const performDelete = async () => {
      try {
        await context.deleteEntry.mutateAsync(entryId);
        // Navigate back if handler provided
        context.onNavigateBack?.();
        resolve();
      } catch (error) {
        console.error("[entryActions] Error deleting entry:", error);
        reject(error);
      }
    };

    if (skipConfirmation) {
      performDelete();
    } else {
      Alert.alert(confirmTitle, confirmMessage, [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => reject(new Error("Deletion cancelled")),
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: performDelete,
        },
      ]);
    }
  });
}

/**
 * Delete entry without confirmation (for use in UI with explicit delete button)
 */
export async function deleteEntryWithConfirmation(
  entryId: number,
  context: EntryActionContext,
): Promise<void> {
  return deleteEntry(entryId, context, { skipConfirmation: false });
}

