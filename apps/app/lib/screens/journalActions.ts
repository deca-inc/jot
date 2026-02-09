/**
 * Journal Actions - Action-based system for managing journal entry workflows
 *
 * This system provides a clean way to orchestrate journal operations:
 * - Entry creation/updates
 * - Content saving
 * - Title management
 *
 * Follows the patterns from docs/react-patterns.md:
 * - No useEffects
 * - Actions over reactions
 * - Database as single source of truth
 */

import {
  Block,
  Entry,
  CreateEntryInput,
  UpdateEntryInput,
} from "../db/entries";
import type { UseMutationResult } from "@tanstack/react-query";

// Type for the mutation objects returned by useCreateEntry and useUpdateEntry
type CreateEntryMutation = UseMutationResult<Entry, Error, CreateEntryInput>;
type UpdateEntryMutation = UseMutationResult<
  Entry,
  Error,
  { id: number; input: UpdateEntryInput; skipCacheUpdate?: boolean }
>;

export interface JournalActionContext {
  // React Query mutations
  createEntry?: CreateEntryMutation;
  updateEntry: UpdateEntryMutation;

  // Callbacks
  onSave?: (entryId: number) => void;

  // Sync callbacks (optional - for real-time sync)
  onEntryCreated?: (entry: Entry) => Promise<void>;
  onEntryUpdated?: (
    entryId: number,
    updates: UpdateEntryInput,
  ) => Promise<void>;
}

interface CreateJournalEntryParams {
  initialContent?: string;
  initialTitle?: string;
}

/**
 * Action: Create a new journal entry
 *
 * Flow:
 * 1. Create entry with initial content
 * 2. Notify sync manager
 * 3. Return entry ID for navigation
 *
 * @returns The created entry ID
 */
export async function createJournalEntry(
  params: CreateJournalEntryParams,
  context: JournalActionContext & { createEntry: CreateEntryMutation },
): Promise<number> {
  const { initialContent = "", initialTitle = "" } = params;
  const { createEntry, onSave, onEntryCreated } = context;

  try {
    console.log("[Journal Action] Creating new journal entry");

    // Convert initial content to blocks (always use html type)
    const blocks: Block[] = [];
    if (initialContent.trim()) {
      // If content has HTML tags, store as-is
      if (initialContent.includes("<")) {
        blocks.push({
          type: "html",
          content: initialContent,
        });
      } else {
        // Plain text - wrap in paragraph tags
        blocks.push({
          type: "html",
          content: `<h1>${initialContent.replace(/\n/g, "<br>")}</h1>`,
        });
      }
    }

    const entry = await new Promise<Entry>((resolve, reject) => {
      createEntry.mutate(
        {
          type: "journal",
          title: initialTitle || "Untitled",
          blocks,
          tags: [],
          attachments: [],
          isFavorite: false,
        },
        {
          onSuccess: resolve,
          onError: reject,
        },
      );
    });

    console.log("[Journal Action] Created entry:", entry.id);

    // Notify sync manager (fire and forget)
    onEntryCreated?.(entry).catch((err) => {
      console.error("[Journal Action] Error notifying sync of creation:", err);
    });

    // Trigger navigation
    onSave?.(entry.id);

    return entry.id;
  } catch (error) {
    console.error("[Journal Action] Error creating entry:", error);
    throw error;
  }
}

/**
 * Prepare journal content for saving - extracts blocks and title from HTML
 */
function prepareJournalContent(
  htmlContent: string,
  title: string,
): { blocks: Block[]; finalTitle: string } | null {
  // Strip HTML to check if there's actual content
  const textContent = htmlContent.replace(/<[^>]*>/g, "").trim();
  if (!textContent) {
    return null;
  }

  // HTML is already repaired by caller
  const cleanHtml = htmlContent.trim();

  // Store HTML as single html block (new format)
  const blocks: Block[] = [
    {
      type: "html",
      content: cleanHtml,
    },
  ];

  // Use title if set, otherwise use content preview
  const finalTitle =
    title.trim() ||
    textContent.slice(0, 50) + (textContent.length > 50 ? "..." : "") ||
    "Untitled";

  return { blocks, finalTitle };
}

/**
 * Action: Save journal entry content (fire-and-forget)
 *
 * Does NOT wait for the database write to complete - truly non-blocking.
 * Use this when navigating away and you don't need to wait for the save.
 */
export function saveJournalContentFireAndForget(
  entryId: number,
  htmlContent: string,
  title: string,
  context: JournalActionContext,
): void {
  const { updateEntry, onEntryUpdated } = context;

  const prepared = prepareJournalContent(htmlContent, title);
  if (!prepared) {
    return;
  }

  const input: UpdateEntryInput = {
    title: prepared.finalTitle,
    blocks: prepared.blocks,
  };

  // Fire and forget - don't await, don't wrap in Promise
  updateEntry.mutate(
    {
      id: entryId,
      input,
      skipCacheUpdate: true,
    },
    {
      onSuccess: () => {
        // Notify sync manager (fire and forget)
        onEntryUpdated?.(entryId, input).catch((err) => {
          console.error("[Journal Action] Error notifying sync:", err);
        });
      },
      onError: (error: Error) => {
        console.error("[Journal Action] Error in fire-and-forget save:", error);
      },
    },
  );
}

export interface SaveJournalContentOptions {
  /**
   * When true, updates the React Query cache after saving.
   * Use this when navigating away from the editor so the entry list
   * shows the updated content immediately without waiting for refetch.
   *
   * Default: false (skips cache update during editing to prevent editor issues)
   */
  updateCache?: boolean;
}

/**
 * Action: Save journal entry content
 *
 * Handles HTML sanitization and block conversion
 * Note: HTML should be pre-repaired before calling this function
 *
 * @param options.updateCache - When true, updates cache (use when navigating away from editor)
 */
export async function saveJournalContent(
  entryId: number,
  htmlContent: string,
  title: string,
  context: JournalActionContext,
  options?: SaveJournalContentOptions,
): Promise<void> {
  const { updateEntry, onEntryUpdated } = context;
  const { updateCache = false } = options ?? {};

  try {
    const prepared = prepareJournalContent(htmlContent, title);
    if (!prepared) {
      return;
    }

    const input: UpdateEntryInput = {
      title: prepared.finalTitle,
      blocks: prepared.blocks,
    };

    await new Promise<void>((resolve, reject) => {
      updateEntry.mutate(
        {
          id: entryId,
          input,
          // Skip cache update during editing (prevents HTML escaping in editor)
          // But update cache when navigating away so list shows fresh data
          skipCacheUpdate: !updateCache,
        },
        {
          onSuccess: () => {
            // DON'T call onSave - it triggers a reload which causes the editor to escape HTML
            // The DB is local, trust our editor state

            // Notify sync manager (fire and forget - don't block the save)
            onEntryUpdated?.(entryId, input).catch((err) => {
              console.error("[Journal Action] Error notifying sync:", err);
            });

            resolve();
          },
          onError: reject,
        },
      );
    });
  } catch (error) {
    console.error("[Journal Action] Error saving entry:", error);
    throw error;
  }
}

/**
 * Action: Update journal entry title
 */
export async function updateJournalTitle(
  entryId: number,
  title: string,
  context: JournalActionContext,
): Promise<void> {
  const { updateEntry, onSave } = context;

  try {
    await new Promise<void>((resolve, reject) => {
      updateEntry.mutate(
        {
          id: entryId,
          input: {
            title: title.trim() || undefined,
          },
        },
        {
          onSuccess: () => {
            onSave?.(entryId);
            resolve();
          },
          onError: reject,
        },
      );
    });

    console.log("[Journal Action] Updated title for entry:", entryId);
  } catch (error) {
    console.error("[Journal Action] Error updating title:", error);
    throw error;
  }
}

// Type for delete mutation
type DeleteEntryMutation = UseMutationResult<
  { id: number; parentId: number | null | undefined },
  Error,
  number | { id: number; parentId?: number | null }
>;

/**
 * Action: Delete journal entry
 */
export async function deleteJournalEntry(
  entryId: number,
  deleteEntry: DeleteEntryMutation,
  onDelete?: (entryId: number) => void,
): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      deleteEntry.mutate(entryId, {
        onSuccess: () => {
          onDelete?.(entryId);
          resolve();
        },
        onError: reject,
      });
    });

    console.log("[Journal Action] Deleted entry:", entryId);
  } catch (error) {
    console.error("[Journal Action] Error deleting entry:", error);
    throw error;
  }
}

/**
 * Utility: Convert blocks to content string
 */
export function blocksToContent(blocks: Block[], type: string): string {
  if (type === "journal") {
    // For journal entries, join html or markdown content
    return blocks
      .filter((b) => b.type === "html" || b.type === "markdown")
      .map((b) => b.content)
      .join("\n\n");
  } else {
    // For other types, join content with newlines
    return blocks
      .map((b) => {
        if ("content" in b) {
          return b.content;
        }
        return "";
      })
      .join("\n\n");
  }
}
