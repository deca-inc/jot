## Data Model

### Entities

#### Entry
- `id`: unique identifier
- `type`: journal|ai_chat
- `title`: string
- `blocks`: array of Block objects (see Block schema below)
- `tags[]`: array of tag strings
- `attachments[]`: array of attachment paths
- `isFavorite`: boolean
- `embedding`: vector BLOB|null
- `embeddingModel`: string|null
- `embeddingCreatedAt`: timestamp|null
- `createdAt`: timestamp
- `updatedAt`: timestamp

**Entry Types:**
- Journal entries: `type='journal'`, `blocks` contains rich block types (paragraph, heading, list, checkbox, table, image, code, etc.), blocks typically don't have role set
- AI chat messages: `type='ai_chat'`, `blocks` typically contains a markdown block type with `role='user'` or `role='assistant'` set on blocks

**Notes:**
- Each entry is a self-contained document (merged Page + Entry concept)
- Journal entries are standalone pages with rich content blocks
- AI chat entries are individual messages in a conversation (grouped by date or conversation thread)

#### Block Schema (Zod)
```typescript
// Base block structure (intentionally flat - no nesting for performance and simplicity)
// Adding nesting later requires careful consideration due to complexity and performance implications
const BlockSchema = z.discriminatedUnion('type', [
  // Text blocks
  z.object({
    type: z.literal('paragraph'),
    content: z.string(),
    role: z.enum(['user', 'assistant', 'system']).optional(),
  }),
  z.object({
    type: z.literal('heading1'),
    content: z.string(),
    role: z.enum(['user', 'assistant', 'system']).optional(),
  }),
  z.object({
    type: z.literal('heading2'),
    content: z.string(),
    role: z.enum(['user', 'assistant', 'system']).optional(),
  }),
  z.object({
    type: z.literal('heading3'),
    content: z.string(),
    role: z.enum(['user', 'assistant', 'system']).optional(),
  }),
  
  // List blocks
  z.object({
    type: z.literal('list'),
    ordered: z.boolean().optional(),
    items: z.array(z.string()),
    role: z.enum(['user', 'assistant', 'system']).optional(),
  }),
  z.object({
    type: z.literal('checkbox'),
    checked: z.boolean(),
    content: z.string(),
    role: z.enum(['user', 'assistant', 'system']).optional(),
  }),
  
  // Rich content blocks
  z.object({
    type: z.literal('code'),
    language: z.string().optional(),
    content: z.string(),
    role: z.enum(['user', 'assistant', 'system']).optional(),
  }),
  z.object({
    type: z.literal('markdown'),
    content: z.string(),
    role: z.enum(['user', 'assistant', 'system']).optional(),
  }),
  z.object({
    type: z.literal('table'),
    headers: z.array(z.string()).optional(),
    rows: z.array(z.array(z.string())),
    role: z.enum(['user', 'assistant', 'system']).optional(),
  }),
  
  // Media blocks
  z.object({
    type: z.literal('image'),
    url: z.string(),
    alt: z.string().optional(),
    role: z.enum(['user', 'assistant', 'system']).optional(),
  }),
  
  // Container blocks
  z.object({
    type: z.literal('quote'),
    content: z.string(),
    role: z.enum(['user', 'assistant', 'system']).optional(),
  }),
]);

const BlocksArraySchema = z.array(BlockSchema);
```

**Block Types:**
- `paragraph`: Plain text paragraph
- `heading1`, `heading2`, `heading3`: Headings
- `list`: Ordered or unordered list
- `checkbox`: Checkable list item
- `code`: Code block with optional language
- `markdown`: Raw markdown content (typically for AI messages)
- `table`: Table with rows and optional headers
- `image`: Image with URL and optional alt text
- `quote`: Blockquote
- All blocks support:
  - `role`: Optional `user`, `assistant`, or `system` (identifies the author/origin of the block)
- **Design Decision: Flat Structure (No Nesting)**
  - Blocks are intentionally flat with no nested children
  - This is for performance (simpler parsing, faster rendering) and simplicity (easier to reason about, less complexity)
  - Adding nesting later should be very carefully thought through - it increases complexity significantly and may impact performance. Only add if there's a compelling use case that can't be achieved with flat blocks.

#### Settings
- `key`: string
- `value`: JSON/text
- `updatedAt`: timestamp
- Key-value store for app settings including license

### Storage
- SQLite tables with FTS5 virtual table for `Entry.blocks` (extracts plain text from blocks for search).
- **Content Format**: All content stored as JSON array of block objects, validated with Zod schema.
  - Blocks are typed and validated on save/load
  - Journal entries use rich block types (paragraph, heading, list, checkbox, table, etc.)
  - AI messages typically use markdown blocks (but could mix with other blocks)
  - FTS5 extracts plain text from all block types for search indexing
- **Embeddings**: Stored directly on `Entry.embedding` as BLOB (float32 array).
  - Simple blob storage approach: no separate index files, everything in SQLite
  - Query via linear scan with cosine similarity (fast enough for personal journaling scale)
  - No rebuild needed when embeddings change (O(1) additions)
  - Easy backup/restore (everything in SQLite)
  - If scale requires optimization later, can migrate to FAISS-like index
- Attachments stored as files; referenced by path in Entry.attachments[].

### File Formats
- **Export**: JSON bundle + attachments folder; optional Markdown per entry.
- **Backup**: Encrypted TAR/ZIP of DB + attachments + metadata.json.
- **P2: P2P Transfer**: Easy device-to-device transfer protocol (QR code, local network, or direct connection) for seamless migration between devices without cloud services.

### P2: Sharing Metadata
- Optional per-entry sharing policy and export manifest with optional additional encryption parameters.
