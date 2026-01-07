# Jot

A private, local-first journaling app with on-device AI.

## Features

- **Local-first** - All data stays on your device. No accounts, no cloud sync required.
- **Encrypted storage** - Your journal is encrypted at rest using SQLCipher.
- **AI conversations** - Chat with a local AI assistant (runs entirely on-device).
- **Rich text editing** - Write with headings, lists, checkboxes, code blocks, tables, and more.
- **Fast search** - Full-text search across all your entries.

## Tech Stack

- Expo + React Native (macOS desktop)
- SQLite with FTS5 for full-text search
- On-device LLM inference via llama.cpp/ExecuTorch

## Requirements

- Node.js (v18+)
- pnpm
- Xcode (for iOS/macOS builds)
- Android Studio (for Android builds)

## Getting Started

```bash
pnpm install
pnpm ios
# or
pnpm android
```

For detailed setup help, see the [Expo documentation](https://docs.expo.dev/).

## Project Structure

```
src/
├── components/     # React components
├── database/       # SQLite schema, migrations, queries
├── hooks/          # React hooks
├── services/       # Business logic and actions
├── styles/         # Theme and styling
└── types/          # TypeScript types
```

## License

This project is source-available under a restrictive license.

**Permitted:**

- Personal, non-commercial use
- Forking and local modification for personal use
- Learning and reference

**Not permitted:**

- Redistribution (modified or unmodified)
- Commercial use
- Derivative works for distribution

See [LICENSE](./LICENSE) for full terms.
