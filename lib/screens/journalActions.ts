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

import { Block } from "../db/entries";

/**
 * Repairs and sanitizes HTML from the editor
 * Fixes common issues like malformed tags, improper nesting, etc.
 */
export function repairHtml(html: string): string {
  let cleaned = html.trim();

  // Remove outer <html> tags if present
  cleaned = cleaned.replace(/^<html>\s*/i, "").replace(/\s*<\/html>$/i, "");

  // Fix: Remove <p> tags that are wrapping block-level elements
  // This fixes the bug where every tag gets wrapped in <p>
  cleaned = cleaned.replace(/<p>\s*(<h[1-6]>)/gi, "$1");
  cleaned = cleaned.replace(/<p>\s*(<\/h[1-6]>)/gi, "$1");
  cleaned = cleaned.replace(/<p>\s*(<ul>)/gi, "$1");
  cleaned = cleaned.replace(/<p>\s*(<ol>)/gi, "$1");
  cleaned = cleaned.replace(/<p>\s*(<li>)/gi, "$1");
  cleaned = cleaned.replace(/<p>\s*(<\/li>)/gi, "$1");
  cleaned = cleaned.replace(/(<\/ul>)\s*<\/p>/gi, "$1");
  cleaned = cleaned.replace(/(<\/ol>)\s*<\/p>/gi, "$1");
  cleaned = cleaned.replace(/(<\/h[1-6]>)\s*<\/p>/gi, "$1");

  // Remove ALL <br> tags - they cause rendering issues
  cleaned = cleaned.replace(/<br\s*\/?>/gi, "");

  // Remove empty <p></p> tags
  cleaned = cleaned.replace(/<p>\s*<\/p>/gi, "");

  // Remove list items with only empty headings (rendering bug)
  cleaned = cleaned.replace(
    /<li>\s*<h[1-6]>\s*<\/h[1-6]>\s*<\/li>/gi,
    "<li></li>"
  );

  // Clean up empty lists
  cleaned = cleaned.replace(/<ul>\s*<\/ul>/gi, "");
  cleaned = cleaned.replace(/<ol>\s*<\/ol>/gi, "");

  // Fix: if content ends with a list, append empty paragraph to prevent rendering bugs
  if (cleaned.match(/<\/(ul|ol)>\s*$/i)) {
    cleaned = cleaned + "<p></p>";
  }

  return cleaned;
}

export interface JournalActionContext {
  // React Query mutations
  createEntry: any;
  updateEntry: any;

  // Callbacks
  onSave?: (entryId: number) => void;
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
 * 2. Return entry ID for navigation
 *
 * @returns The created entry ID
 */
export async function createJournalEntry(
  params: CreateJournalEntryParams,
  context: JournalActionContext
): Promise<number> {
  const { initialContent = "", initialTitle = "" } = params;
  const { createEntry, onSave } = context;

  try {
    console.log("[Journal Action] Creating new journal entry");

    // Convert initial content to blocks
    const blocks: Block[] = [];
    if (initialContent.trim()) {
      // If content has HTML tags, store as markdown block
      if (initialContent.includes("<")) {
        blocks.push({
          type: "markdown",
          content: initialContent,
        });
      } else {
        // Plain text - wrap in paragraph
        blocks.push({
          type: "markdown",
          content: `<p>${initialContent.replace(/\n/g, "<br>")}</p>`,
        });
      }
    }

    const entry = await new Promise<any>((resolve, reject) => {
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
        }
      );
    });

    console.log("[Journal Action] Created entry:", entry.id);

    // Trigger navigation
    onSave?.(entry.id);

    return entry.id;
  } catch (error) {
    console.error("[Journal Action] Error creating entry:", error);
    throw error;
  }
}

/**
 * Action: Save journal entry content
 *
 * Handles HTML sanitization and block conversion
 * Note: HTML should be pre-repaired before calling this function
 */
export async function saveJournalContent(
  entryId: number,
  htmlContent: string,
  title: string,
  context: JournalActionContext
): Promise<void> {
  const { updateEntry, onSave } = context;

  try {
    // Strip HTML to check if there's actual content
    const textContent = htmlContent.replace(/<[^>]*>/g, "").trim();
    if (!textContent) {
      return;
    }

    // HTML is already repaired by caller
    let cleanHtml = htmlContent.trim();

    // Store HTML as single markdown block
    const blocks: Block[] = [
      {
        type: "markdown",
        content: cleanHtml,
      },
    ];

    // Use title if set, otherwise use content preview
    const finalTitle =
      title.trim() ||
      textContent.slice(0, 50) + (textContent.length > 50 ? "..." : "") ||
      "Untitled";

    await new Promise<void>((resolve, reject) => {
      updateEntry.mutate(
        {
          id: entryId,
          input: {
            title: finalTitle,
            blocks,
          },
        },
        {
          onSuccess: () => {
            onSave?.(entryId);
            resolve();
          },
          onError: reject,
        }
      );
    });

    console.log("[Journal Action] Saved entry:", entryId);
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
  context: JournalActionContext
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
        }
      );
    });

    console.log("[Journal Action] Updated title for entry:", entryId);
  } catch (error) {
    console.error("[Journal Action] Error updating title:", error);
    throw error;
  }
}

/**
 * Action: Delete journal entry
 */
export async function deleteJournalEntry(
  entryId: number,
  deleteEntry: any,
  onDelete?: (entryId: number) => void
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
    // For journal entries, join markdown content
    return blocks
      .filter((b) => b.type === "markdown")
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
