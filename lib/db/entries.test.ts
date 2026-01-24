import { describe, it, expect, vi } from "vitest";
import { extractPreviewText, type Block } from "./entries";

// Mock expo-sqlite to avoid React Native dependencies
vi.mock("expo-sqlite", () => ({
  SQLiteDatabase: vi.fn(),
  useSQLiteContext: vi.fn(),
}));

// Mock DatabaseProvider to avoid React imports
vi.mock("./DatabaseProvider", () => ({
  useDatabase: vi.fn(),
}));

describe("extractPreviewText", () => {
  describe("paragraph blocks", () => {
    it("extracts content from paragraph block", () => {
      const blocks: Block[] = [{ type: "paragraph", content: "Hello world" }];
      expect(extractPreviewText(blocks)).toBe("Hello world");
    });

    it("skips empty paragraph blocks", () => {
      const blocks: Block[] = [
        { type: "paragraph", content: "   " },
        { type: "paragraph", content: "Second paragraph" },
      ];
      expect(extractPreviewText(blocks)).toBe("Second paragraph");
    });
  });

  describe("heading blocks", () => {
    it("extracts content from heading1", () => {
      const blocks: Block[] = [{ type: "heading1", content: "Main Heading" }];
      expect(extractPreviewText(blocks)).toBe("Main Heading");
    });

    it("extracts content from heading2", () => {
      const blocks: Block[] = [{ type: "heading2", content: "Sub Heading" }];
      expect(extractPreviewText(blocks)).toBe("Sub Heading");
    });

    it("extracts content from heading3", () => {
      const blocks: Block[] = [{ type: "heading3", content: "Minor Heading" }];
      expect(extractPreviewText(blocks)).toBe("Minor Heading");
    });
  });

  describe("markdown blocks", () => {
    it("extracts and strips HTML from markdown block", () => {
      const blocks: Block[] = [
        { type: "markdown", content: "<p>Some <strong>bold</strong> text</p>" },
      ];
      expect(extractPreviewText(blocks)).toBe("Some bold text");
    });

    it("normalizes whitespace in markdown content", () => {
      const blocks: Block[] = [
        { type: "markdown", content: "<p>Multiple   spaces   here</p>" },
      ];
      expect(extractPreviewText(blocks)).toBe("Multiple spaces here");
    });

    it("handles plain markdown text", () => {
      const blocks: Block[] = [{ type: "markdown", content: "Plain text" }];
      expect(extractPreviewText(blocks)).toBe("Plain text");
    });
  });

  describe("html blocks", () => {
    it("strips HTML tags from html block", () => {
      const blocks: Block[] = [
        { type: "html", content: "<div><p>Nested content</p></div>" },
      ];
      expect(extractPreviewText(blocks)).toBe("Nested content");
    });

    it("handles complex HTML structure", () => {
      const blocks: Block[] = [
        {
          type: "html",
          content: "<ul><li>Item 1</li><li>Item 2</li></ul>",
        },
      ];
      const result = extractPreviewText(blocks);
      expect(result).toContain("Item 1");
      expect(result).toContain("Item 2");
    });
  });

  describe("other block types", () => {
    it("skips code blocks", () => {
      const blocks: Block[] = [
        { type: "code", content: "const x = 1;", language: "javascript" },
        { type: "paragraph", content: "Description" },
      ];
      expect(extractPreviewText(blocks)).toBe("Description");
    });

    it("skips quote blocks", () => {
      const blocks: Block[] = [
        { type: "quote", content: "A famous quote" },
        { type: "paragraph", content: "My thoughts" },
      ];
      expect(extractPreviewText(blocks)).toBe("My thoughts");
    });

    it("skips checkbox blocks", () => {
      const blocks: Block[] = [
        { type: "checkbox", content: "Todo item", checked: false },
        { type: "paragraph", content: "Notes" },
      ];
      expect(extractPreviewText(blocks)).toBe("Notes");
    });

    it("skips list blocks", () => {
      const blocks: Block[] = [
        { type: "list", items: ["item 1", "item 2"], ordered: false },
        { type: "paragraph", content: "Summary" },
      ];
      expect(extractPreviewText(blocks)).toBe("Summary");
    });

    it("skips table blocks", () => {
      const blocks: Block[] = [
        { type: "table", rows: [["a", "b"]] },
        { type: "paragraph", content: "Table description" },
      ];
      expect(extractPreviewText(blocks)).toBe("Table description");
    });

    it("skips image blocks", () => {
      const blocks: Block[] = [
        { type: "image", url: "https://example.com/img.png" },
        { type: "paragraph", content: "Image caption" },
      ];
      expect(extractPreviewText(blocks)).toBe("Image caption");
    });

    it("skips countdown blocks", () => {
      const blocks: Block[] = [
        { type: "countdown", targetDate: Date.now(), title: "Event" },
        { type: "paragraph", content: "Event details" },
      ];
      expect(extractPreviewText(blocks)).toBe("Event details");
    });
  });

  describe("edge cases", () => {
    it("returns empty string for empty block array", () => {
      expect(extractPreviewText([])).toBe("");
    });

    it("returns empty string when no valid content found", () => {
      const blocks: Block[] = [
        { type: "code", content: "code only" },
        { type: "image", url: "https://example.com/img.png" },
      ];
      expect(extractPreviewText(blocks)).toBe("");
    });

    it("returns first valid content from mixed blocks", () => {
      const blocks: Block[] = [
        { type: "code", content: "code" },
        { type: "image", url: "img.png" },
        { type: "paragraph", content: "First paragraph" },
        { type: "paragraph", content: "Second paragraph" },
      ];
      expect(extractPreviewText(blocks)).toBe("First paragraph");
    });

    it("handles blocks with role attribute", () => {
      const blocks: Block[] = [
        { type: "markdown", content: "User message", role: "user" },
      ];
      expect(extractPreviewText(blocks)).toBe("User message");
    });

    it("trims whitespace from extracted content", () => {
      const blocks: Block[] = [
        { type: "html", content: "<p>   Spaced content   </p>" },
      ];
      expect(extractPreviewText(blocks)).toBe("Spaced content");
    });
  });
});
