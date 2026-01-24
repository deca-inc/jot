import {
  markdownToHtml,
  isHtmlContent,
  isHtmlContentEmpty,
  convertBlockToHtml,
  convertBlocksToHtml,
  convertEnrichedChecklistToQuill,
  convertEnrichedHtmlToQuill,
  extractTitleFromHtml,
} from "./htmlUtils";
import type { Block } from "../db/entries";

describe("markdownToHtml", () => {
  it("converts basic markdown text to HTML", () => {
    const result = markdownToHtml("Hello **world**");
    expect(result).toContain("<strong>world</strong>");
  });

  it("converts headings", () => {
    const result = markdownToHtml("# Heading 1");
    expect(result).toContain("<h1");
    expect(result).toContain("Heading 1");
  });

  it("converts multiple paragraphs", () => {
    const result = markdownToHtml("Para 1\n\nPara 2");
    expect(result).toContain("<p>");
  });

  it("converts lists", () => {
    const result = markdownToHtml("- item 1\n- item 2");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>");
  });

  it("converts code blocks", () => {
    const result = markdownToHtml("```js\nconst x = 1;\n```");
    expect(result).toContain("<pre>");
    expect(result).toContain("</code>");
    expect(result).toContain("const x = 1");
  });

  it("returns empty string for null/undefined input", () => {
    expect(markdownToHtml("")).toBe("");
    expect(markdownToHtml("   ")).toBe("");
  });

  it("handles inline code", () => {
    const result = markdownToHtml("Use `console.log` for debugging");
    expect(result).toContain("<code>");
    expect(result).toContain("console.log");
  });

  it("converts links", () => {
    const result = markdownToHtml("[link](https://example.com)");
    expect(result).toContain("<a");
    expect(result).toContain("href");
    expect(result).toContain("example.com");
  });
});

describe("isHtmlContent", () => {
  it("returns true for content with HTML tags", () => {
    expect(isHtmlContent("<p>Hello</p>")).toBe(true);
    expect(isHtmlContent("<div>Content</div>")).toBe(true);
    expect(isHtmlContent("<html><body>Test</body></html>")).toBe(true);
  });

  it("returns true for self-closing tags", () => {
    expect(isHtmlContent("<br/>")).toBe(true);
    expect(isHtmlContent("<img src='test'/>")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(isHtmlContent("Hello world")).toBe(false);
    expect(isHtmlContent("Just some text")).toBe(false);
  });

  it("returns false for markdown", () => {
    expect(isHtmlContent("# Heading")).toBe(false);
    expect(isHtmlContent("**bold**")).toBe(false);
    expect(isHtmlContent("- list item")).toBe(false);
  });

  it("returns false for empty/null content", () => {
    expect(isHtmlContent("")).toBe(false);
    // @ts-expect-error - testing null input
    expect(isHtmlContent(null)).toBe(false);
    // @ts-expect-error - testing undefined input
    expect(isHtmlContent(undefined)).toBe(false);
  });

  it("handles angle brackets in text that are not tags", () => {
    expect(isHtmlContent("5 > 3")).toBe(false);
    expect(isHtmlContent("a < b")).toBe(false);
  });
});

describe("isHtmlContentEmpty", () => {
  it("returns true for empty string", () => {
    expect(isHtmlContentEmpty("")).toBe(true);
  });

  it("returns true for null/undefined", () => {
    // @ts-expect-error - testing null input
    expect(isHtmlContentEmpty(null)).toBe(true);
    // @ts-expect-error - testing undefined input
    expect(isHtmlContentEmpty(undefined)).toBe(true);
  });

  it("returns true for empty HTML tags", () => {
    expect(isHtmlContentEmpty("<p></p>")).toBe(true);
    expect(isHtmlContentEmpty("<div></div>")).toBe(true);
    expect(isHtmlContentEmpty("<p><br></p>")).toBe(true);
    expect(isHtmlContentEmpty("<p><br/></p>")).toBe(true);
  });

  it("returns true for whitespace-only content", () => {
    expect(isHtmlContentEmpty("   ")).toBe(true);
    expect(isHtmlContentEmpty("<p>   </p>")).toBe(true);
    expect(isHtmlContentEmpty("<p>&nbsp;</p>")).toBe(true);
  });

  it("returns false for content with text", () => {
    expect(isHtmlContentEmpty("<p>Hello</p>")).toBe(false);
    expect(isHtmlContentEmpty("Hello")).toBe(false);
    expect(isHtmlContentEmpty("<div>Some content</div>")).toBe(false);
  });

  it("handles nested empty tags", () => {
    expect(isHtmlContentEmpty("<div><p><br></p></div>")).toBe(true);
    expect(isHtmlContentEmpty("<div><p>Text</p></div>")).toBe(false);
  });
});

describe("convertBlockToHtml", () => {
  it("returns html block as-is", () => {
    const block: Block = { type: "html", content: "<p>Hello</p>" };
    const result = convertBlockToHtml(block);
    expect(result).toEqual(block);
  });

  it("converts markdown block with plain text to html", () => {
    const block: Block = { type: "markdown", content: "**bold** text" };
    const result = convertBlockToHtml(block);
    expect(result.type).toBe("html");
    if (result.type === "html") {
      expect(result.content).toContain("<strong>bold</strong>");
    }
  });

  it("preserves role when converting", () => {
    const block: Block = {
      type: "markdown",
      content: "Hello",
      role: "assistant",
    };
    const result = convertBlockToHtml(block);
    expect(result.role).toBe("assistant");
  });

  it("changes type to html if markdown content is already HTML", () => {
    const block: Block = {
      type: "markdown",
      content: "<p>Already HTML</p>",
    };
    const result = convertBlockToHtml(block);
    expect(result.type).toBe("html");
    if (result.type === "html") {
      expect(result.content).toBe("<p>Already HTML</p>");
    }
  });

  it("returns other block types as-is", () => {
    const paragraphBlock: Block = { type: "paragraph", content: "Hello" };
    expect(convertBlockToHtml(paragraphBlock)).toEqual(paragraphBlock);

    const codeBlock: Block = { type: "code", content: "const x = 1" };
    expect(convertBlockToHtml(codeBlock)).toEqual(codeBlock);

    const quoteBlock: Block = { type: "quote", content: "A quote" };
    expect(convertBlockToHtml(quoteBlock)).toEqual(quoteBlock);
  });
});

describe("convertBlocksToHtml", () => {
  it("converts all markdown blocks to html", () => {
    const blocks: Block[] = [
      { type: "markdown", content: "**bold**" },
      { type: "markdown", content: "*italic*" },
    ];
    const result = convertBlocksToHtml(blocks);
    expect(result.every((b) => b.type === "html")).toBe(true);
  });

  it("preserves non-markdown blocks", () => {
    const blocks: Block[] = [
      { type: "paragraph", content: "Hello" },
      { type: "markdown", content: "**bold**" },
      { type: "code", content: "const x = 1" },
    ];
    const result = convertBlocksToHtml(blocks);
    expect(result[0].type).toBe("paragraph");
    expect(result[1].type).toBe("html");
    expect(result[2].type).toBe("code");
  });

  it("handles empty array", () => {
    expect(convertBlocksToHtml([])).toEqual([]);
  });
});

describe("convertEnrichedChecklistToQuill", () => {
  it("converts checklist with checked items", () => {
    const input =
      '<checklist><cli checked="true">Item 1</cli><cli checked="false">Item 2</cli></checklist>';
    const result = convertEnrichedChecklistToQuill(input);

    expect(result).toContain('data-checked="true"');
    expect(result).toContain('data-checked="false"');
    expect(result).toContain("<li>Item 1</li>");
    expect(result).toContain("<li>Item 2</li>");
    expect(result).not.toContain("<checklist>");
    expect(result).not.toContain("<cli");
  });

  it("handles standalone cli tags", () => {
    const input = '<cli checked="true">Standalone item</cli>';
    const result = convertEnrichedChecklistToQuill(input);

    expect(result).toContain('data-checked="true"');
    expect(result).toContain("<li>Standalone item</li>");
  });

  it("returns input unchanged if no checklist elements", () => {
    const input = "<p>Regular paragraph</p>";
    expect(convertEnrichedChecklistToQuill(input)).toBe(input);
  });

  it("handles empty/null input", () => {
    expect(convertEnrichedChecklistToQuill("")).toBe("");
    // @ts-expect-error - testing null input
    expect(convertEnrichedChecklistToQuill(null)).toBe(null);
  });

  it("trims whitespace in item content", () => {
    const input =
      '<checklist><cli checked="true">  Trimmed  </cli></checklist>';
    const result = convertEnrichedChecklistToQuill(input);
    expect(result).toContain("<li>Trimmed</li>");
  });
});

describe("convertEnrichedHtmlToQuill", () => {
  it("converts checklists", () => {
    const input = '<checklist><cli checked="true">Item</cli></checklist>';
    const result = convertEnrichedHtmlToQuill(input);

    expect(result).toContain('data-checked="true"');
    expect(result).not.toContain("<checklist>");
  });

  it("strips html wrapper tags", () => {
    const input = "<html><p>Content</p></html>";
    const result = convertEnrichedHtmlToQuill(input);

    expect(result).not.toContain("<html>");
    expect(result).not.toContain("</html>");
    expect(result).toContain("<p>Content</p>");
  });

  it("handles mixed content", () => {
    const input =
      '<html><p>Paragraph</p><checklist><cli checked="false">Todo</cli></checklist></html>';
    const result = convertEnrichedHtmlToQuill(input);

    expect(result).not.toContain("<html>");
    expect(result).toContain("<p>Paragraph</p>");
    expect(result).toContain('data-checked="false"');
  });

  it("handles empty/null input", () => {
    expect(convertEnrichedHtmlToQuill("")).toBe("");
    // @ts-expect-error - testing null input
    expect(convertEnrichedHtmlToQuill(null)).toBe(null);
  });
});

describe("extractTitleFromHtml", () => {
  it("extracts h1 as title", () => {
    const html = "<h1>My Title</h1><p>Some content</p>";
    expect(extractTitleFromHtml(html)).toBe("My Title");
  });

  it("extracts other heading levels if no h1", () => {
    const html = "<h2>Second Level</h2><p>Content</p>";
    expect(extractTitleFromHtml(html)).toBe("Second Level");

    const html3 = "<h3>Third Level</h3>";
    expect(extractTitleFromHtml(html3)).toBe("Third Level");
  });

  it("falls back to first paragraph if no headings", () => {
    const html = "<p>First paragraph</p><p>Second</p>";
    expect(extractTitleFromHtml(html)).toBe("First paragraph");
  });

  it("falls back to stripped text if no paragraphs", () => {
    const html = "<div>Some div content</div>";
    expect(extractTitleFromHtml(html)).toBe("Some div content");
  });

  it("returns Untitled for empty content", () => {
    expect(extractTitleFromHtml("")).toBe("Untitled");
    // @ts-expect-error - testing null input
    expect(extractTitleFromHtml(null)).toBe("Untitled");
  });

  it("truncates long titles to 100 characters", () => {
    const longTitle = "A".repeat(150);
    const html = `<h1>${longTitle}</h1>`;
    const result = extractTitleFromHtml(html);
    expect(result.length).toBe(100);
  });

  it("trims whitespace from titles", () => {
    const html = "<h1>  Spaced Title  </h1>";
    expect(extractTitleFromHtml(html)).toBe("Spaced Title");
  });

  it("returns Untitled for tags-only content", () => {
    const html = "<div><span></span></div>";
    expect(extractTitleFromHtml(html)).toBe("Untitled");
  });

  it("prefers h1 over other headings", () => {
    const html = "<h2>H2 First</h2><h1>H1 Second</h1>";
    expect(extractTitleFromHtml(html)).toBe("H1 Second");
  });
});
