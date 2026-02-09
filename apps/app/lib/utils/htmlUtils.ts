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
 * Check if HTML content is effectively empty (no actual text content)
 * Handles empty HTML tags like <p></p>, <p><br></p>, whitespace, etc.
 */
export function isHtmlContentEmpty(html: string): boolean {
  if (!html) return true;

  // Strip all HTML tags
  const textContent = html
    .replace(/<br\s*\/?>/gi, "") // Remove <br> tags
    .replace(/<[^>]*>/g, "") // Remove all other HTML tags
    .replace(/&nbsp;/gi, " ") // Convert &nbsp; to space
    .trim();

  return textContent.length === 0;
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
 * Convert old react-native-enriched checklist format to Quill format
 *
 * Old format: <checklist><cli checked="true">Item</cli><cli checked="false">Item2</cli></checklist>
 * Quill format: <ul data-checked="true"><li>Item</li></ul><ul data-checked="false"><li>Item2</li></ul>
 *
 * Note: Quill puts each checklist item in its own <ul> with data-checked attribute
 */
export function convertEnrichedChecklistToQuill(html: string): string {
  if (!html || (!html.includes("<checklist>") && !html.includes("<cli"))) {
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
        },
      );
      return items;
    },
  );

  // Also handle standalone <cli> tags that might not be wrapped in <checklist>
  converted = converted.replace(
    /<cli\s+checked="(true|false)"[^>]*>([\s\S]*?)<\/cli>/gi,
    (match, checked, content) => {
      return `<ul data-checked="${checked}"><li>${content.trim()}</li></ul>`;
    },
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
 * Strip temporary URLs from audio/image attachments in HTML
 * This is critical for sync - we don't want to store temporary URLs in the database
 * Only the attachment ID and metadata should be stored; the actual data lives in encrypted files
 *
 * We strip:
 * 1. data: URIs (base64 encoded content)
 * 2. http://127.0.0.1 URLs (local attachment server, temporary)
 * 3. http://localhost URLs (local attachment server, temporary)
 *
 * We strip from BOTH:
 * 1. data-value attribute (Quill blot data)
 * 2. <audio src="..."> element (actual playback source)
 */
export function stripBase64FromAttachments(html: string): string {
  if (!html) {
    return html;
  }

  let result = html;

  // Helper to check if src should be stripped (data URI, localhost, or file://)
  const shouldStripSrc = (src: string): boolean => {
    if (!src) return false;
    return (
      src.startsWith("data:") ||
      src.startsWith("file://") ||
      src.startsWith("http://127.0.0.1") ||
      src.startsWith("http://localhost")
    );
  };

  // Strip from data-value attributes
  result = result.replace(/data-value="([^"]*)"/g, (match, encodedValue) => {
    try {
      const decoded = encodedValue
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");

      const parsed = JSON.parse(decoded);

      // If it has a src that should be stripped, remove it
      if (parsed.src && shouldStripSrc(parsed.src)) {
        const stripped = {
          id: parsed.id,
          duration: parsed.duration,
        };
        const reEncoded = JSON.stringify(stripped)
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return `data-value="${reEncoded}"`;
      }

      return match;
    } catch {
      return match;
    }
  });

  // Also strip from <audio src="..."> elements (data URIs, file://, and localhost)
  result = result.replace(
    /<audio\s+src="(data:|file:\/\/|http:\/\/127\.0\.0\.1|http:\/\/localhost)[^"]*"/g,
    '<audio src=""',
  );

  return result;
}

/**
 * Extract attachment IDs from HTML that need hydration (have no src)
 * Returns array of { id, mimeType } for attachments that need their data loaded
 */
export function getAttachmentsNeedingHydration(
  html: string,
): Array<{ id: string; duration?: number }> {
  if (!html || !html.includes("data-value")) {
    return [];
  }

  const attachments: Array<{ id: string; duration?: number }> = [];

  // Match data-value attributes
  const regex = /data-value="([^"]*)"/g;
  let match;

  while ((match = regex.exec(html)) !== null) {
    try {
      const decoded = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");

      const parsed = JSON.parse(decoded);

      // If it has an id but no src (or src is not a data URI), it needs hydration
      if (parsed.id && (!parsed.src || !parsed.src.startsWith("data:"))) {
        attachments.push({ id: parsed.id, duration: parsed.duration });
      }
    } catch {
      // Parse error, skip
    }
  }

  return attachments;
}

/**
 * Hydrate attachment data URIs into HTML
 * Takes a map of attachment ID → data URI and injects them into the HTML
 *
 * This updates both:
 * 1. The data-value attribute (for Quill blot data)
 * 2. The <audio src=""> element (for actual playback)
 */
export function hydrateAttachments(
  html: string,
  dataUris: Map<string, string>,
): string {
  if (!html || dataUris.size === 0) {
    return html;
  }

  let result = html;

  // Update data-value attributes with hydrated src
  result = result.replace(/data-value="([^"]*)"/g, (match, encodedValue) => {
    try {
      const decoded = encodedValue
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");

      const parsed = JSON.parse(decoded);

      // If we have a data URI for this attachment, inject it
      if (parsed.id && dataUris.has(parsed.id)) {
        const hydrated = {
          id: parsed.id,
          src: dataUris.get(parsed.id),
          duration: parsed.duration,
        };
        const reEncoded = JSON.stringify(hydrated)
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return `data-value="${reEncoded}"`;
      }

      return match;
    } catch {
      return match;
    }
  });

  // Also update <audio src=""> elements inside audio-attachment divs
  // Match divs with data-attachment-id and update their internal audio src
  // Use a simpler approach: find each data-attachment-id and update the next audio src
  for (const [attachmentId, dataUri] of dataUris) {
    // Find the pattern: data-attachment-id="ID" ... <audio src="...">
    // and replace the audio src with the data URI
    const pattern = new RegExp(
      `(data-attachment-id="${attachmentId}"[^>]*>[\\s\\S]*?<audio\\s+)src="[^"]*"`,
      "g",
    );
    result = result.replace(pattern, `$1src="${dataUri}"`);
  }

  return result;
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
