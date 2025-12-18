## UX Overview

### Primary Screens
- **Home Timeline**: Mixed list of entries and AI convos, grouped by day. Quick filters: Entries, AI, Favorites, Tags.
- **Composer**: 
  - Journal Entry: Rich block-based editor (checkboxes, lists, tables, images, embeds, code blocks, etc.) - WYSIWYG with low latency
  - AI Chat: Markdown-based editor/display (AI returns markdown, rendered nicely)
- **Search**: Unified search bar with filters. *Keyboard navigation and semantic tabs planned.*
- **Settings**: Encryption, backups, AI model, license, import/export.

### Core Flows
- **Quick Capture**: Open composer; enter text, add tags, save. *Keyboard shortcut (Cmd+N) planned.*
- **Start AI Chat**: Choose AI Chat in composer; messages appear inline as a conversation thread.
- **Talk to AI**: From composer or message bubble in timeline; responses appear inline.
- **Search**: Type to search; filter by date, tag, type. *Keyboard shortcut (Cmd+K) and semantic search planned.*
- **Backup/Restore (Planned)**: Choose provider; create encrypted backup; restore from file/provider.
- **Purchase (Planned)**: Inline banner after day 7; single-click purchase; license stored locally.
- **Share/Export (P2)**: Select entries/conversations to export/share; optional additional encryption.

### Interaction Principles
- **Zero friction**: Minimal modals; optimistic UI; autosave.
- **Accessible (Planned)**: *Full keyboard navigation, prefers-reduced-motion, and high contrast mode are planned.*
- **Trust**: Clear encryption states; explicit backup confirmation; no hidden sync.
