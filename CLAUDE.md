# Claude Development Guide

This document provides essential context for AI assistants (like Claude) working on this codebase. It covers architecture, coding guidelines, and product fundamentals.

## Table of Contents

- [Product Fundamentals](#product-fundamentals)
- [Architecture](#architecture)
- [Coding Guidelines](#coding-guidelines)
- [Design System](#design-system)
- [Data Model](#data-model)
- [Security & Privacy](#security--privacy)

---

## Product Fundamentals

### Core Principles

#### 1. Writing Experience is the Most Important Thing

The typing and writing experience must be exceptional—competitive with the best writing apps (iA Writer, Ulysses, Bear, Craft).

- **Low Latency**: Keystroke-to-render latency must be imperceptible (<16ms target). Never laggy or sluggish.
- **Focus When You Get in the Zone**: Distraction-free writing mode, smooth focus transitions, no interruptions.
- **Excellent Typography and Design**: Beautiful, readable fonts with proper spacing, sizing, and contrast. Premium and delightful UI.
- **Extremely Flexible**: Mix components together—text, images, videos, embeds, code blocks, tables, AI chat threads—seamlessly within a single entry.

#### 2. Fast to Find Your Content

Search must be comprehensive, fast, and forgiving.

- **Searchable by Whatever You Can Remember**: Full-text search across all content, metadata search (tags, dates, attachments), media search.
- **Search is Fast So You Can Correct Quickly**: Sub-100ms search results. Instant feedback as you type.

#### 3. Privacy First

We are a private personal assistant and journaling app. Privacy is a core feature.

- **Your Private Personal Assistant**: Trusted, private space for thoughts. Local-first by default.
- **Stay at the Frontier of AI**: Leverage cutting-edge AI while maintaining privacy. Prioritize on-device AI models.
- **Transparency and Control**: Extremely transparent about data collection. User privacy comes first.
- **Privacy Does Not Mean Absolutely No Data Transfer**: Privacy means **predictable** and **transparent** data transfer with user control. Default to the most private option, requiring explicit opt-in for any data sharing.

### Product Scope

- **Audience**: Individuals who want a private, fast, local-first journal with optional AI assistance.
- **Platforms**: macOS desktop (Expo + React Native). Mobile later.
- **Connectivity**: Works fully offline. Optional backups to user-selected services.

#### Key Features

- **Entries + AI Convos**: Unified timeline combining manual journal entries and conversations with a personal AI.
- **Entry Types**: Journal Entry and AI Chat. _AI summarization planned._
- **Search**: Full-text search across all content. _Semantic (AI) search planned._
- **Encryption**: Local database encryption at rest (SQLCipher). _Zero-knowledge cloud backups planned._
- **Local AI**: On-device inference for AI conversations. _Summarization, Q&A, insight extraction planned._
- **Import/Export (Planned)**: JSON/Markdown export; portable backups.
- **Trial & Purchase (Planned)**: 7-day free trial, then $45 lifetime license.

#### Non-Goals (v1)

- Multi-user collaboration
- Realtime sync across devices (v1 supports backup/restore, not continuous sync)
- Server-side features; no vendor lock-in

#### Success Metrics

- **Performance**: <100ms search on 10k notes; <300ms app launch cold.
- **Reliability**: Zero data loss in local crash scenarios; validated backup/restore.
- **Delight**: >40% week-4 retention after trial; NPS > 50.

### UX Overview

#### Primary Screens

- **Home Timeline**: Mixed list of entries and AI convos, grouped by day. Quick filters: Entries, AI, Favorites, Tags.
- **Composer**:
  - Journal Entry: Rich block-based editor (checkboxes, lists, tables, images, embeds, code blocks) - WYSIWYG with low latency
  - AI Chat: Markdown-based editor/display
- **Search**: Unified search bar with filters. _Keyboard navigation and semantic tabs planned._
- **Settings**: Encryption, backups, AI model, license, import/export.

#### Interaction Principles

- **Zero friction**: Minimal modals; optimistic UI; autosave.
- **Accessible (Planned)**: _Full keyboard navigation, prefers-reduced-motion, and high contrast mode are planned._
- **Trust**: Clear encryption states; explicit backup confirmation; no hidden sync.

---

## Architecture

### Tech Stack

- **Framework**: Expo + React Native for macOS via [react-native-macos](https://github.com/microsoft/react-native-macos)
- **Package Manager**: pnpm (always use `pnpm` commands, never `npm` or `yarn`)
- **Build System**: Turborepo for monorepo task orchestration
- **No web app**: Desktop-only initially

### Monorepo Structure

```
journal/
├── apps/
│   └── app/                  # Main Expo mobile app
│       ├── App.tsx
│       ├── index.ts
│       ├── lib/              # Application code
│       ├── modules/          # Native modules (platform-ai, widget-bridge, keyboard-module)
│       ├── packages/         # Swift package (widget-utils)
│       ├── assets/
│       ├── plugins/
│       ├── targets/          # @bacons/apple-targets
│       ├── native/
│       └── package.json
├── packages/                 # Shared packages (empty for now)
├── pnpm-workspace.yaml       # Workspace configuration
├── turbo.json                # Turborepo task definitions
└── package.json              # Workspace root
```

**Key conventions:**

- Run app-specific commands from `apps/app/` (e.g., `cd apps/app && pnpm start`)
- Run workspace-wide commands from root (e.g., `pnpm turbo lint`)
- All app code lives in `apps/app/lib/`
- Native modules stay with the app in `apps/app/modules/`

### Local-First Storage

- **Database**: SQLite (via `expo-sqlite` or `better-sqlite3` for desktop). Full-text search with FTS5.
- **Files**: Attachments stored under app data directory. Metadata in DB.
- **Schema versioning**: Migration table; deterministic up/down migrations.
- **Creating migrations**: Always use `pnpm create:migration <name>` to create new migrations. This script generates the correct timestamp and automatically registers the migration. **Never create migration files manually** - incorrect timestamps cause migrations to run out of order.

### Backup Integrations (Planned)

_Backup functionality is not yet implemented. The following describes the planned strategy:_

- Providers: Google Drive, Dropbox, iCloud Drive, Local file export.
- Backups are encrypted client-side with user key; providers see only ciphertext.
- Strategy: Periodic snapshot with incremental diffs; verify integrity with checksum.

### Sync vs Backup

- v1: Backup/restore only. No multi-device conflict resolution.
- v2+: Consider CRDTs (e.g., Yjs) for multi-device sync.

### App Layers

```
UI (React Native/Expo) → Data access layer → Crypto layer → Storage layer
Background workers: indexing, embeddings, backup scheduler
```

### Embedding Storage

- **Strategy**: Simple blob storage in SQLite (`Entry.embedding` BLOB column)
- Vectors stored as float32 arrays, queried via linear scan with cosine similarity
- Suitable for personal journaling scale (<50K entries). Can optimize to FAISS-like index later if needed.

### Local AI

- On-device small LLM (e.g., Llama 3.2 3B Instruct) via `llama.cpp`/Metal or MLC.
- Optional local embedding model (e.g., MiniLM/all-MiniLM-L6-v2 distilled variant) for semantic search.
- **Download Strategy**: Small initial app download. Models downloaded on-demand with user choice.
- **Multiple Models Support**: Users can download and keep multiple models simultaneously.
  - Fast models: Smaller, quicker responses for real-time interactions
  - Slow/quality models: Larger, higher-quality responses when speed is less important
  - Users can switch between downloaded models per conversation or globally in settings

### Retrieval

- Hybrid search: BM25 via FTS5 + vector similarity over embeddings.
- Chunking strategy: sentence/paragraph for entries; per-message for AI conversations.

### Telemetry

- Default off. If enabled, anonymous, no content ever leaves device.

---

## Coding Guidelines

### Test-First Development (TDD)

**IMPORTANT**: All new features and bug fixes MUST follow test-first development. This is mandatory, not optional.

#### Workflow

1. **Write failing tests first**
   - Before writing any implementation code, write tests that describe the expected behavior
   - Run the tests to confirm they fail (Red phase)
   - Stop and wait for user review before proceeding

2. **Get user approval**
   - Present the failing tests to the user
   - Explain what behavior the tests cover
   - Wait for explicit approval before implementing

3. **Implement to make tests pass**
   - Write the minimum code needed to make tests pass (Green phase)
   - Run tests to confirm they pass
   - Run `pnpm typecheck` to ensure no TypeScript errors (tests may pass at runtime but fail type checking)

4. **Refactor if needed**
   - Clean up the implementation while keeping tests green (Blue phase)

5. **Check coverage before completing**
   - Run `pnpm coverage` to check for missing branches/lines
   - Review uncovered code paths and add tests for important branches
   - Aim for >80% coverage on new/modified files

#### Test Commands

Run from `apps/app/`:

```bash
pnpm test:ts      # TypeScript tests (Jest)
pnpm test:swift   # Swift (Swift Package Manager)
pnpm test:kotlin  # Kotlin (Gradle) - requires prebuild
pnpm test:all     # Run all tests
pnpm typecheck    # TypeScript type checking (IMPORTANT: run after tests pass)
```

Or from root with Turborepo:

```bash
pnpm turbo test       # Run tests across all packages
pnpm turbo typecheck  # Typecheck all packages
pnpm turbo lint       # Lint all packages
```

#### Coverage Commands

Run from `apps/app/`:

```bash
pnpm coverage        # TypeScript coverage (text + HTML report)
pnpm coverage:ts     # Same as above
pnpm coverage:swift  # Swift coverage via llvm-cov
```

Coverage reports are generated in `apps/app/coverage/` for TypeScript (open `coverage/index.html` in browser).

#### Test Locations

- **TypeScript**: `apps/app/lib/**/*.test.ts` colocated with source files
- **Swift**: `apps/app/packages/widget-utils/Tests/`
- **Kotlin**: `apps/app/native/android/widget-tests/` (copied during prebuild)

### Core Principles

#### 1. Minimize useEffect (Aim for 0)

**Why**: `useEffect` creates reactive dependencies that are hard to track and often cause duplicate work, infinite loops, and race conditions.

**Instead**: Use direct event handlers and action functions.

```typescript
// ❌ BAD: Reactive detection
useEffect(() => {
  if (shouldDoWork) {
    doWork();
  }
}, [many, dependencies, here]);

// ✅ GOOD: Direct event handling
const handleUserAction = () => {
  if (shouldDoWork) {
    doWork();
  }
};
```

**When useEffect is acceptable**:

- Subscribing to external systems (WebSocket, DOM events)
- Cleanup operations on unmount
- Syncing with browser APIs (window size, scroll position)

#### 2. Avoid Refs for State Tracking

**Why**: Refs bypass React's reactivity and create hidden state that doesn't trigger re-renders.

**Instead**: Derive state from props or database/store data.

```typescript
// ❌ BAD: Tracking state with refs
const hasGeneratedTitleRef = useRef(false);
if (!hasGeneratedTitleRef.current) {
  generateTitle();
  hasGeneratedTitleRef.current = true;
}

// ✅ GOOD: Derive from data
const hasTitle = entry?.title && entry.title !== "AI Conversation";
if (!hasTitle) {
  generateTitle();
}
```

**When refs are acceptable**:

- DOM manipulation (focusing inputs, scrolling)
- Storing timeout/interval IDs for cleanup
- Storing stable callbacks that don't need to trigger re-renders

#### 3. Rely on Input Data (Single Source of Truth)

**Why**: Multiple sources of truth lead to sync bugs. The database is the source of truth.

**Pattern**: Read from DB via React Query → Display in UI

```typescript
// ❌ BAD: Local state that needs syncing
const [chatMessages, setChatMessages] = useState([]);
useEffect(() => {
  setChatMessages(entry.blocks);
}, [entry]);

// ✅ GOOD: Derive from entry directly
const displayedBlocks = entry?.blocks ?? initialBlocks;
```

#### 4. Use Events and Actions, Not Reactions

**Why**: Events are explicit and easier to trace than reactive cascades.

```typescript
// ❌ BAD: Chain of useEffects reacting to each other
useEffect(() => {
  if (entryCreated) {
    setNeedsGeneration(true);
  }
}, [entryCreated]);

// ✅ GOOD: Sequential action
async function createConversation() {
  const entry = await createEntry();
  await generateAI(entry.id);
  await generateTitle(entry.id);
  return entry.id;
}
```

### Action Pattern

For complex workflows, use the action pattern:

```typescript
// Define action context with proper types (not `any`)
interface ActionContext {
  createEntry: UseMutationResult<Entry, Error, CreateEntryInput>;
  updateEntry: UseMutationResult<Entry, Error, UpdateEntryInput>;
  llm: LLMService;
  onSave?: (id: number) => void;
}

// Action: encapsulates a complete workflow
async function createConversation(
  params: { userMessage: string },
  context: ActionContext
): Promise<number> {
  // 1. Create entry
  const entry = await createEntry(...);

  // 2. Trigger navigation immediately
  context.onSave?.(entry.id);

  // 3. Queue background work (don't await)
  queueBackgroundWork(entry.id);

  return entry.id;
}
```

**Benefits**:

- Clear, testable workflow
- Easy to understand sequence
- No hidden dependencies
- Can be called from anywhere

### Data Flow

```
User Action → Event Handler → Action Function
                                    ↓
                              DB Update
                                    ↓
                            React Query Cache
                                    ↓
                              Component Re-render
```

### Performance Optimization

#### Memoization Rules

**When to memoize**:

1. **Context values** - Always memoize with `useMemo`
2. **Callbacks passed as props** - Always wrap with `useCallback`
3. **Expensive computations** - Use `useMemo` for derived data
4. **Theme/config objects** - Cache at module level, not per-render

#### Context Provider Performance

```typescript
// ❌ BAD: Creates new object every render
export function ThemeProvider({ children }) {
  const contextValue = {
    theme: getTheme(),
    settings: getSettings(),
  };

  return <Context.Provider value={contextValue}>{children}</Context.Provider>;
}

// ✅ GOOD: Memoized context value
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(null);
  const [settings, setSettings] = useState(null);

  const contextValue = useMemo(
    () => ({ theme, settings }),
    [theme, settings]
  );

  return <Context.Provider value={contextValue}>{children}</Context.Provider>;
}
```

#### Caching Static Objects

```typescript
// ❌ BAD: Creates new theme object every call
export function getSeasonalTheme(season: Season, time: TimeOfDay) {
  return {
    gradient: { start: "#...", middle: "#...", end: "#..." },
    textPrimary: "#...",
  };
}

// ✅ GOOD: Cache theme objects
const themeCache = new Map<string, SeasonalTheme>();

export function getSeasonalTheme(season: Season, time: TimeOfDay) {
  const cacheKey = `${season}-${time}`;
  const cached = themeCache.get(cacheKey);
  if (cached) return cached;

  const theme = {
    gradient: { start: "#...", middle: "#...", end: "#..." },
    textPrimary: "#...",
  };

  themeCache.set(cacheKey, theme);
  return theme;
}
```

#### Stabilizing Unstable Dependencies

React Query mutations and some callbacks change on every render. Use refs to stabilize them:

```typescript
// ❌ BAD: Mutation in dependency array causes callback to recreate
const createEntry = useCreateEntry();
const handleSubmit = useCallback(
  async (text: string) => {
    await createEntry.mutateAsync({ text });
  },
  [createEntry], // Recreates every render!
);

// ✅ GOOD: Use ref to access mutation
const createEntry = useCreateEntry();
const createEntryRef = useRef(createEntry);
createEntryRef.current = createEntry;

const handleSubmit = useCallback(
  async (text: string) => {
    await createEntryRef.current.mutateAsync({ text });
  },
  [], // Stable!
);
```

### TypeScript: Prefer Proper Types Over `any`

**Why**: `any` disables type checking and defeats the purpose of TypeScript. It hides bugs and makes refactoring dangerous.

**Hierarchy of solutions** (in order of preference):

1. **Use proper types** - Define interfaces, use generics, leverage library types
2. **Use `unknown`** - When you truly don't know the type, use `unknown` and narrow with type guards
3. **Line-level disable** - If a specific line genuinely needs `any` (e.g., library interop), use `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a comment explaining why
4. **File-level disable** - Only as absolute last resort for files with extensive library interop

```typescript
// ❌ BAD: Using any
function handleError(error: any) {
  console.log(error.message);
}

// ✅ GOOD: Use unknown and narrow
function handleError(error: unknown) {
  const err = error as { message?: string };
  console.log(err?.message || String(error));
}

// ✅ GOOD: Use proper library types
const handlePress: TouchableOpacityProps["onPress"] = (e) => {
  // e is properly typed
};

// ✅ ACCEPTABLE: Line-level disable with explanation
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostHog SDK types don't export this
const analytics = posthog as any;
```

### Summary

- **0 useEffects**: Handle everything through events and actions
- **0 refs for state**: Derive everything from data (but use refs for unstable callbacks)
- **Single source of truth**: Database via React Query
- **Actions, not reactions**: Explicit workflows over reactive cascades
- **Memoize everything passed as props**: Callbacks, context values, config objects
- **Cache static objects**: Theme objects, config maps that don't change
- **Stabilize unstable dependencies**: Use refs for React Query mutations
- **Update state conditionally**: Only when value actually changes
- **Proper types over `any`**: Use real types, then `unknown`, then line-level disables, file-level only as last resort

When in doubt, ask: "Can I derive this from data?" and "Can I handle this with an event?" The answer is usually yes.

---

## Design System

### Component Philosophy

**Prefer shared components over inline styling.** When you find yourself writing the same styling pattern more than twice, extract it into a reusable component. This ensures:

- Visual consistency across the app
- Single source of truth for styling decisions
- Easier updates when design changes
- Less code duplication

### Standard Components

The following shared components are available in `apps/app/lib/components/`:

#### Input

Standardized text input with consistent theming:

```tsx
import { Input } from "../components";

<Input
  value={value}
  onChangeText={setValue}
  placeholder="Enter text..."
  multiline={false} // Set true for textarea behavior
  minHeight={80} // For multiline inputs
  autoCapitalize="none"
  secureTextEntry={false}
/>;
```

**Styling (built-in):**

- `borderRadius: md`
- `fontSize: 16`
- `paddingHorizontal: md`, `paddingVertical: sm`
- Background: `rgba(255,255,255,0.08)` dark / `rgba(255,255,255,0.9)` light
- Border: `textSecondary + "40"`

#### FormField

Wrapper for form inputs with label and optional hint:

```tsx
import { FormField } from "../components";

<FormField
  label="Email Address"
  hint="We'll never share your email"
  marginBottom={true}  // Default: true
>
  <Input ... />
</FormField>
```

**Styling (built-in):**

- Label: `variant="caption"`, `fontWeight: "600"`, `marginBottom: sm`
- Hint: `variant="caption"`, `marginTop: xs`, `fontSize: 12`
- Container: `marginBottom: lg` (when marginBottom=true)

#### FormModal

Standardized modal for form dialogs with header, scrollable content, and sticky footer:

```tsx
import { FormModal } from "../components";

<FormModal
  visible={isOpen}
  onClose={() => setIsOpen(false)}
  title="Edit Profile"
  footer={
    <View style={styles.actions}>
      <TouchableOpacity onPress={onCancel}>Cancel</TouchableOpacity>
      <TouchableOpacity onPress={onSave}>Save</TouchableOpacity>
    </View>
  }
  onBack={handleBack}          // Optional: shows back arrow
  maxHeightRatio={0.85}        // Default: 0.85
  showCloseButton={true}       // Default: true
>
  <FormField label="Name">
    <Input ... />
  </FormField>
</FormModal>
```

**Features:**

- Tap outside to close
- Keyboard avoidance (iOS padding, Android height)
- Centered header with optional back/close buttons
- Scrollable content area
- Sticky footer for action buttons
- Consistent theming with `seasonalTheme.gradient.middle`

#### Text

Themed text component with variants:

```tsx
import { Text } from "../components";

<Text variant="h1">Heading 1</Text>
<Text variant="h2">Heading 2</Text>
<Text variant="h3">Heading 3</Text>
<Text variant="body">Body text</Text>
<Text variant="caption">Caption text</Text>
```

### When to Create New Components

Create a new shared component when:

1. **Same styling appears 3+ times** - Extract into a component
2. **Complex theming logic** - Encapsulate dark/light mode handling
3. **Accessibility requirements** - Centralize a11y props
4. **Platform-specific behavior** - Handle iOS/Android differences once

### Theming

Use the seasonal theme system for colors:

```tsx
const seasonalTheme = useSeasonalTheme();

// Text colors
seasonalTheme.textPrimary;
seasonalTheme.textSecondary;

// Backgrounds
seasonalTheme.cardBg;
seasonalTheme.gradient.start / middle / end;
seasonalTheme.isDark; // boolean for dark mode

// For dynamic backgrounds with guaranteed contrast, use:
backgroundColor: seasonalTheme.isDark
  ? "rgba(255, 255, 255, 0.08)"
  : "rgba(255, 255, 255, 0.9)";
```

### Spacing & Layout

Use spacing patterns from theme:

```tsx
import { spacingPatterns, borderRadius } from "../theme";

// Spacing
spacingPatterns.xxs; // 4
spacingPatterns.xs; // 8
spacingPatterns.sm; // 12
spacingPatterns.md; // 16
spacingPatterns.lg; // 24
spacingPatterns.xl; // 32

// Border radius
borderRadius.sm; // 4
borderRadius.md; // 8
borderRadius.lg; // 12
```

---

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

- Journal entries: `type='journal'`, `blocks` contains rich block types (paragraph, heading, list, checkbox, table, image, code, etc.)
- AI chat messages: `type='ai_chat'`, `blocks` typically contains a markdown block type with `role='user'` or `role='assistant'` set on blocks

**Notes:**

- Each entry is a self-contained document
- Journal entries are standalone pages with rich content blocks
- AI chat entries are individual messages in a conversation (grouped by date or conversation thread)

#### Block Schema

Blocks are intentionally **flat** with no nested children for performance and simplicity.

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

All blocks support:

- `role`: Optional `user`, `assistant`, or `system` (identifies the author/origin of the block)

**Design Decision: Flat Structure (No Nesting)**

- Blocks are intentionally flat with no nested children
- This is for performance (simpler parsing, faster rendering) and simplicity (easier to reason about, less complexity)
- Adding nesting later should be very carefully thought through - it increases complexity significantly and may impact performance

#### Settings

- `key`: string
- `value`: JSON/text
- `updatedAt`: timestamp
- Key-value store for app settings including license

### Storage

- SQLite tables with FTS5 virtual table for `Entry.blocks` (extracts plain text from blocks for search).
- **Content Format**: All content stored as JSON array of block objects, validated with Zod schema.
- **Embeddings**: Stored directly on `Entry.embedding` as BLOB (float32 array).
  - Simple blob storage approach: no separate index files, everything in SQLite
  - Query via linear scan with cosine similarity (fast enough for personal journaling scale)
  - Easy backup/restore (everything in SQLite)
- Attachments stored as files; referenced by path in Entry.attachments[].

### File Formats

- **Export**: JSON bundle + attachments folder; optional Markdown per entry.
- **Backup**: Encrypted TAR/ZIP of DB + attachments + metadata.json.

---

## Security & Privacy

### Threat Model

- Protect against lost/stolen device, nosy processes, and cloud providers.
- Not defending against targeted, persistent attackers with device root access.

### Keys

- **Master Key**: 256-bit key auto-generated using cryptographically secure random number generation.
- **Key Storage**: Stored securely in OS keystore (Keychain on macOS/iOS, Keystore on Android).
- **Key Management**: Key is automatically generated on first launch and stored securely. No user passphrase required for default encryption mode.
- **Optional Passphrase Mode**: Future enhancement - allow users to optionally enable passphrase-based encryption for additional security.

### Data at Rest

- **DB Encryption**: Encrypt the entire SQLite storage file as a whole (opaque to most of the system). This keeps the encryption layer separate from the application logic.
- **Files (Planned)**: Each attachment encrypted with random file key; keys wrapped by master key. _Note: Attachments feature not yet implemented._

### Backups (Planned)

_Backup functionality is not yet implemented. The following describes the planned strategy:_

- Client-side encryption before upload. Zero-knowledge providers.
- Integrity: HMAC over archive manifest; per-file checksums.

### Privacy

- **All inference on-device**. No remote calls unless user opts into a provider.
- No content leaves device unless exporting/backing up.
- Telemetry off by default.

---

## Quick Reference

### Implementation Implications

- Optimized Expo/React Native stack for ultra-low latency typing
- Investment in editor technology and typography
- Comprehensive search infrastructure (FTS5, embeddings, media indexing)
- Privacy-by-design architecture (local-first, encrypted, zero-knowledge backups)
- Clear, accessible privacy documentation and controls

### When Working on Code

1. **Always read existing code first** - Never propose changes to code you haven't read
2. **Minimize useEffect** - Prefer event handlers and actions
3. **Single source of truth** - Database via React Query
4. **Performance matters** - Memoize callbacks, cache static objects, stabilize dependencies
5. **Privacy first** - All AI inference on-device, no content leaves device without explicit user action
6. **Keep blocks flat** - No nesting in the block structure
7. **Avoid over-engineering** - Only make changes that are directly requested or clearly necessary
8. **Run lint and typecheck** - After making significant changes, run `pnpm lint` and `pnpm typecheck` to catch issues early

### Code Quality Commands

From root (runs across all packages via Turborepo):

- **`pnpm turbo lint`** - Run ESLint across all packages
- **`pnpm turbo typecheck`** - Run TypeScript type checking across all packages
- **`pnpm turbo test`** - Run tests across all packages

From `apps/app/`:

- **`pnpm lint`** - Run ESLint for the app
- **`pnpm lint:fix`** - Auto-fix ESLint issues (import sorting, trailing commas, etc.)
- **`pnpm typecheck`** - Run TypeScript type checking without emitting files
- **`pnpm create:migration <name>`** - Create a new database migration (generates timestamp, creates file, registers it)

### Code Style (Enforced by ESLint)

- **Trailing commas**: Always use trailing commas in multiline structures
- **Import order**: Imports are auto-sorted alphabetically (builtin → external → internal → relative)
- **Unused variables**: Prefer deleting unused code entirely. Only use `_` prefix when the variable is required by an API/signature but not used (e.g., `_event` in a callback)
- **Newlines**: Files must end with a newline

A pre-commit hook runs `lint-staged` to automatically lint and fix staged files before each commit.
