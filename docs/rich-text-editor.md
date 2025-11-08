# Native Rich Text Editor with react-native-enriched

## Overview

We use **`react-native-enriched`** - a truly native rich text editor for React Native. It provides **inline WYSIWYG editing** (bold, italic, underline) and block-level formatting (headings, lists) with **native iOS/Android performance**.

Unlike WebView-based editors (TenTap, Pell, Quill) that take 5-10 seconds to load, `react-native-enriched` is:
- ⚡ **Instant** - No WebView, no loading delays
- 🎨 **True WYSIWYG** - See bold/italic/underline while typing
- 🚀 **Native** - Uses NSAttributedString (iOS) and Spannable (Android)
- 💾 **HTML storage** - Stores content as HTML in SQLite

## Key Features

### Inline Formatting
- **Bold** (⌘B) - Make text bold
- **Italic** (⌘I) - Make text italic
- **Underline** (⌘U) - Underline text

### Block-Level Formatting
- **Heading 1** - Large, bold headings (32px)
- **Heading 2** - Medium headings (26px)
- **Heading 3** - Small headings (22px)
- **Bullet Lists** - Unordered lists with • markers
- **Numbered Lists** - Ordered lists with 1, 2, 3...

## Toolbar

The formatting toolbar provides quick access to all formatting options:

```
[B] [I] [U]  |  [H1] [H2] [H3]  |  [•] [1.]
```

- **B/I/U** - Toggle bold, italic, underline on selected text
- **H1/H2/H3** - Convert current paragraph to heading
- **• / 1.** - Create bullet or numbered lists

## How It Works

### Editing

1. **EnrichedTextInput** component provides the editing surface
2. User types and sees formatted text in real-time
3. Toolbar buttons call editor methods:
   - `toggleBold()`, `toggleItalic()`, `toggleUnderline()`
   - `applyHeading(1|2|3)`
   - `toggleBulletList()`, `toggleNumberedList()`
4. Content is stored as HTML internally
5. Auto-saves every 1 second after changes

### Saving

1. Content is stored as HTML in a single `markdown` block:
   ```typescript
   {
     type: "markdown",
     content: "<p>Hello <b>world</b></p>"
   }
   ```
2. HTML is stored in SQLite as text
3. Debounced auto-save prevents excessive writes

### Viewing Saved Entries

1. `EntryDetailScreen` reads blocks from database
2. Detects HTML content (contains `<` tags)
3. Uses `react-native-render-html` to display formatted content
4. All formatting (bold, italic, headings, lists) is preserved
5. Themed to match app's seasonal theme

## Architecture

```
JournalComposer.tsx
├── Title TextInput
├── Formatting Toolbar (B/I/U, H1/H2/H3, Lists)
└── EnrichedTextInput
    ├── Handles editing
    ├── Applies formatting
    └── Returns HTML

EntryDetailScreen.tsx
└── RenderHtml
    ├── Parses HTML
    ├── Applies theme styles
    └── Displays formatted content
```

## Technical Details

### Data Flow

```typescript
User types → EnrichedTextInput → HTML string → Save to DB
                                     ↓
                            <p>Hello <b>world</b></p>
                                     ↓
Load from DB → RenderHtml → Formatted display
```

### Storage Format

```typescript
// New format (react-native-enriched)
{
  blocks: [
    {
      type: "markdown",
      content: "<h1>My Title</h1><p>Some <b>bold</b> text</p><ul><li>Item 1</li></ul>"
    }
  ]
}

// Legacy format (auto-converted on load)
{
  blocks: [
    { type: "heading1", content: "My Title" },
    { type: "paragraph", content: "Some text" },
    { type: "list", items: ["Item 1"] }
  ]
}
```

### Theming

Both editor and viewer respect the app's seasonal theme:
- Text colors: `seasonalTheme.textPrimary` / `textSecondary`
- Background: Transparent, inherits from parent
- All HTML tags styled with theme colors

## Benefits

1. **True inline WYSIWYG** - Bold/italic/underline visible while editing (impossible with native TextInput alone)
2. **Fast** - Native implementation, no WebView overhead
3. **Production-ready** - Built by Software Mansion, battle-tested
4. **Rich formatting** - Supports everything we need (bold, italic, underline, headings, lists)
5. **Platform-native** - Uses iOS's NSAttributedString and Android's Spannable
6. **Themed** - Fully integrated with our seasonal theme system
7. **Accessible** - Works with screen readers and accessibility tools

## Usage

1. **Type normally** - Just start typing
2. **Select text** - Tap and drag to select
3. **Apply formatting** - Tap B/I/U buttons
4. **Create headings** - Tap H1/H2/H3 buttons
5. **Add lists** - Tap • or 1. buttons
6. **Auto-saves** - Changes saved automatically after 1 second

## Limitations

⚠️ **Important quirk from library:**
Heading `fontSize` cannot match input `fontSize` on iOS. Our headings are:
- Body text: 18px
- H3: 22px
- H2: 26px
- H1: 32px

This is actually perfect - headings **should** be bigger! It's enforcing good design.

## Why We Chose This

After testing multiple solutions:

| Solution | Load Time | Inline Formatting | Performance | Verdict |
|----------|-----------|-------------------|-------------|---------|
| `@10play/tentap-editor` | 5-10s | ✅ | ❌ WebView | Too slow |
| `react-native-pell-rich-editor` | 5-10s | ✅ | ❌ WebView | Too slow |
| `react-native-cn-quill` | 5-10s | ✅ | ❌ WebView | Too slow |
| Custom block-based | Instant | ❌ | ✅ Native | No inline formatting |
| **`react-native-enriched`** | **Instant** | **✅** | **✅ Native** | **Perfect!** ✨ |

## Future Enhancements

- [ ] Strikethrough support
- [ ] Text color/highlight
- [ ] Inline links
- [ ] Inline images
- [ ] Code blocks
- [ ] Blockquotes
- [ ] Tables
- [ ] Markdown import/export
- [ ] Collaborative editing
- [ ] Version history

## Dependencies

- `react-native-enriched` (^0.1.5) - Editor component
- `react-native-render-html` (^6.3.4) - HTML rendering for viewing entries

## References

- [react-native-enriched GitHub](https://github.com/software-mansion/react-native-enriched)
- [Software Mansion](https://swmansion.com/) - Creators of Reanimated, Gesture Handler, and more
