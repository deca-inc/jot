import { Block, EntryType } from "../db/entries";

/**
 * Convert entry blocks to plain text content for editing
 */
export function blocksToContent(blocks: Block[], entryType: EntryType): string {
  if (entryType === "journal") {
    // For journal entries, convert text-based blocks to plain text
    const textParts: string[] = [];

    for (const block of blocks) {
      if (
        block.type === "paragraph" ||
        block.type === "heading1" ||
        block.type === "heading2" ||
        block.type === "heading3"
      ) {
        if (block.content.trim()) {
          textParts.push(block.content.trim());
        }
      } else if (block.type === "quote") {
        if (block.content.trim()) {
          textParts.push(block.content.trim());
        }
      } else if (block.type === "list") {
        // Convert list items to text format
        const listText = block.items
          .map((item, index) => {
            const prefix = block.ordered ? `${index + 1}. ` : "- ";
            return `${prefix}${item}`;
          })
          .join("\n");
        if (listText.trim()) {
          textParts.push(listText);
        }
      } else if (block.type === "markdown") {
        // Include markdown blocks (might be formatted text)
        if (block.content.trim()) {
          textParts.push(block.content.trim());
        }
      }
    }

    return textParts.join("\n\n");
  } else {
    // For AI chat, extract markdown content from user messages
    const markdownBlocks = blocks
      .filter(
        (block): block is Extract<Block, { type: "markdown" }> =>
          block.type === "markdown"
      )
      .filter((block) => block.role === "user");
    if (markdownBlocks.length > 0) {
      return markdownBlocks.map((block) => block.content).join("\n\n");
    }
    return "";
  }
}
