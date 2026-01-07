## Architecture

### Tech Stack

- **Framework**: Expo + React Native for macOS via [react-native-macos](https://github.com/microsoft/react-native-macos)
- **No web app**: Desktop-only initially

### Local-First Storage

- **Database**: SQLite (via `expo-sqlite` or `better-sqlite3` for desktop). Full-text search with FTS5.
- **Files**: Attachments stored under app data directory. Metadata in DB.
- **Schema versioning**: Migration table; deterministic up/down migrations.

### Backup Integrations (Planned)

_Backup functionality is not yet implemented. The following describes the planned strategy:_

- Providers: Google Drive, Dropbox, iCloud Drive, Local file export.
- Approach: Possibly allow users to point to a file/directory location (needs verification for mobile).
- Backups are encrypted client-side with user key; providers see only ciphertext.
- Strategy: Periodic snapshot with incremental diffs; verify integrity with checksum.

### Sync vs Backup

- v1: Backup/restore only. No multi-device conflict resolution.
- v2+: Consider CRDTs (e.g., Yjs) for multi-device sync.

### App Layers

- UI (React Native/Expo) → Data access layer → Crypto layer → Storage layer.
- Background workers: indexing, embeddings, backup scheduler.

### Embedding Storage

- **Strategy**: Simple blob storage in SQLite (`Entry.embedding` BLOB column)
- Vectors stored as float32 arrays, queried via linear scan with cosine similarity
- Suitable for personal journaling scale (<50K entries). Can optimize to FAISS-like index later if needed.

### Telemetry

- Default off. If enabled, anonymous, no content ever leaves device.
