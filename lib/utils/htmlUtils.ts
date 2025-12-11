import { marked } from "marked";
import type { Block } from "../db/entries";

/**
 * Convert markdown content to HTML
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown || !markdown.trim()) {
    return "";
  }

  // Parse markdown to HTML
  const html = marked.parse(markdown, { async: false }) as string;

  return html;
}

/**
 * Check if content is already HTML (has HTML tags)
 */
export function isHtmlContent(content: string): boolean {
  if (!content) return false;
  // Check for common HTML patterns
  return /<[a-z][\s\S]*>/i.test(content);
}

/**
 * Convert a markdown block to an html block, or return as-is if already html
 */
export function convertBlockToHtml(block: Block): Block {
  if (block.type === "html") {
    return block;
  }

  if (block.type === "markdown") {
    // If it's already HTML content (wrapped in <html> tags or has HTML tags),
    // just change the type to html
    if (isHtmlContent(block.content)) {
      return {
        type: "html",
        content: block.content,
        role: block.role,
      };
    }

    // Otherwise, convert markdown to HTML
    const htmlContent = markdownToHtml(block.content);
    return {
      type: "html",
      content: htmlContent,
      role: block.role,
    };
  }

  // For other block types, return as-is
  return block;
}

/**
 * Convert all markdown blocks in an array to html blocks
 */
export function convertBlocksToHtml(blocks: Block[]): Block[] {
  return blocks.map(convertBlockToHtml);
}

/**
 * Repair common HTML issues from Quill editor output
 * Based on the existing repairHtml function in journalActions.ts
 */
export function repairQuillHtml(html: string): string {
  if (!html || !html.trim()) {
    return "<p></p>";
  }

  let cleanHtml = html;

  // Remove malformed <p> tags around block elements
  cleanHtml = cleanHtml.replace(/<p>(<(?:ul|ol|h[1-6]|blockquote|pre)[^>]*>)/gi, "$1");
  cleanHtml = cleanHtml.replace(/(<\/(?:ul|ol|h[1-6]|blockquote|pre)>)<\/p>/gi, "$1");

  // Remove empty <li> tags that can cause issues
  cleanHtml = cleanHtml.replace(/<li>\s*<\/li>/g, "");

  // Normalize whitespace but preserve intentional line breaks
  cleanHtml = cleanHtml.replace(/\n\s*\n/g, "\n");

  return cleanHtml;
}

/**
 * Convert old react-native-enriched checklist format to Quill format
 *
 * Old format: <checklist><cli checked="true">Item</cli><cli checked="false">Item2</cli></checklist>
 * Quill format: <ul data-checked="true"><li>Item</li></ul><ul data-checked="false"><li>Item2</li></ul>
 *
 * Note: Quill puts each checklist item in its own <ul> with data-checked attribute
 */
export function convertEnrichedChecklistToQuill(html: string): string {
  if (!html || !html.includes("<checklist>") && !html.includes("<cli")) {
    return html;
  }

  let converted = html;

  // Convert <checklist>...</checklist> blocks
  // Each <cli> item becomes its own <ul data-checked="..."><li>...</li></ul>
  converted = converted.replace(
    /<checklist>([\s\S]*?)<\/checklist>/gi,
    (match, content) => {
      // Process each <cli> item within the checklist
      const items = content.replace(
        /<cli\s+checked="(true|false)"[^>]*>([\s\S]*?)<\/cli>/gi,
        (itemMatch: string, checked: string, itemContent: string) => {
          return `<ul data-checked="${checked}"><li>${itemContent.trim()}</li></ul>`;
        }
      );
      return items;
    }
  );

  // Also handle standalone <cli> tags that might not be wrapped in <checklist>
  converted = converted.replace(
    /<cli\s+checked="(true|false)"[^>]*>([\s\S]*?)<\/cli>/gi,
    (match, checked, content) => {
      return `<ul data-checked="${checked}"><li>${content.trim()}</li></ul>`;
    }
  );

  return converted;
}

/**
 * Convert HTML from old react-native-enriched format to Quill-compatible format
 * This handles checklist conversion and any other format differences
 */
export function convertEnrichedHtmlToQuill(html: string): string {
  if (!html) return html;

  let converted = html;

  // Convert checklists
  converted = convertEnrichedChecklistToQuill(converted);

  // Strip <html> wrapper tags if present (Quill doesn't need them)
  converted = converted.replace(/^<html>\s*/i, "");
  converted = converted.replace(/\s*<\/html>$/i, "");

  return converted;
}

/**
 * Extract title from HTML content (first heading or first paragraph)
 */
export function extractTitleFromHtml(html: string): string {
  if (!html) return "Untitled";

  // Try to find first h1
  const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
  if (h1Match && h1Match[1].trim()) {
    return h1Match[1].trim().slice(0, 100);
  }

  // Try to find first heading of any level
  const headingMatch = html.match(/<h[1-6][^>]*>([^<]*)<\/h[1-6]>/i);
  if (headingMatch && headingMatch[1].trim()) {
    return headingMatch[1].trim().slice(0, 100);
  }

  // Try to find first paragraph
  const pMatch = html.match(/<p[^>]*>([^<]*)<\/p>/i);
  if (pMatch && pMatch[1].trim()) {
    return pMatch[1].trim().slice(0, 100);
  }

  // Fallback: strip all tags and take first 100 chars
  const stripped = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped) {
    return stripped.slice(0, 100);
  }

  return "Untitled";
}
