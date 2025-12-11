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

  // DON'T strip <html> wrapper - keep it throughout the flow
  // Editor outputs it and needs it back on input

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

  // Don't remove <br> tags - they represent intentional blank lines
  // Also don't remove empty <p></p> tags for the same reason
  // The editor uses these for spacing

  // Remove list items with only empty headings (rendering bug)
  cleaned = cleaned.replace(/<li>\s*<h[1-6]>\s*<\/h[1-6]>\s*<\/li>/gi, "");

  // CRITICAL: Remove empty <li></li> tags - they cause editor to escape ALL HTML on reload!
  cleaned = cleaned.replace(/<li>\s*<\/li>/gi, "");

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
 * Prepare journal content for saving - extracts blocks and title from HTML
 */
function prepareJournalContent(
  htmlContent: string,
  title: string
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
  context: JournalActionContext
): void {
  const { updateEntry } = context;

  const prepared = prepareJournalContent(htmlContent, title);
  if (!prepared) {
    return;
  }

  // Fire and forget - don't await, don't wrap in Promise
  updateEntry.mutate(
    {
      id: entryId,
      input: {
        title: prepared.finalTitle,
        blocks: prepared.blocks,
      },
      skipCacheUpdate: true,
    },
    {
      onError: (error: Error) => {
        console.error("[Journal Action] Error in fire-and-forget save:", error);
      },
    }
  );
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
  const { updateEntry } = context;

  try {
    const prepared = prepareJournalContent(htmlContent, title);
    if (!prepared) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      updateEntry.mutate(
        {
          id: entryId,
          input: {
            title: prepared.finalTitle,
            blocks: prepared.blocks,
          },
          skipCacheUpdate: true, // Don't update cache to prevent HTML escaping in editor
        },
        {
          onSuccess: () => {
            // DON'T call onSave - it triggers a reload which causes the editor to escape HTML
            // The DB is local, trust our editor state
            resolve();
          },
          onError: reject,
        }
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
