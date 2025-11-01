## Product Scope

- **Audience**: Individuals who want a private, fast, local-first journal with optional AI assistance.
- **Platforms**: Start with macOS desktop (Electron/React Native Desktop/Expo for desktop). Mobile later.
- **Connectivity**: Works fully offline. Optional backups to services the user selects.

### Key Features
- **Entries + AI Convos**: Unified timeline combining manual journal entries and conversations with a personal AI.
- **Entry Types**: Journal Entry and AI Chat. AI summarization offered on Journal Entries.
- **Search**: Full-text and semantic (AI) search across all content.
- **Encryption**: Local encryption at rest; zero-knowledge optional cloud backups.
- **Local AI**: On-device inference for summarization, Q&A, insight extraction.
- **Import/Export**: JSON/Markdown export; portable backups.
- **Trial & Purchase**: 7-day free trial, then $45 lifetime license (per user/device policy TBD).
- **P2 (Later)**: Selective sharing/export of content with optional additional encryption.

### Non-Goals (v1)
- Multi-user collaboration.
- Realtime sync across devices (v1 supports backup/restore, not continuous sync).
- Server-side features; no vendor lock-in.

### Success Metrics
- **Performance**: <100 ms search on 10k notes; <300 ms app launch cold.
- **Reliability**: Zero data loss in local crash scenarios; validated backup/restore.
- **Delight**: >40% week-4 retention after trial; NPS > 50.
