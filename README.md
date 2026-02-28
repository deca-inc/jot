# Jot

A private, local-first journaling app with on-device AI.

## Features

- **Local-first** - All data stays on your device. No accounts, no cloud sync required.
- **Encrypted storage** - Your journal is encrypted at rest using SQLCipher.
- **AI conversations** - Chat with a local AI assistant (runs entirely on-device).
- **Rich text editing** - Write with headings, lists, checkboxes, code blocks, tables, and more.
- **Fast search** - Full-text search across all your entries.

### Sync Server (Beta)

> **Note:** The sync server is currently in beta. It's functional but may have breaking changes.

An optional sync server (`apps/server`) for multi-device sync:

- **Yjs sync** - Real-time collaborative document sync via Hocuspocus
- **REST API** - Server status and session management
- **LLM inference** - Server-side AI chat (planned, currently stubbed)

## Tech Stack

- **Framework**: Expo 54 + React Native 0.81
- **Build System**: pnpm workspaces + Turborepo
- **Database**: SQLite with FTS5 full-text search (encrypted via SQLCipher)
- **State**: React Query (@tanstack/react-query)
- **AI**: On-device LLM inference via ExecuTorch (react-native-executorch)
- **Editor**: Quill-based rich text editor (react-native-cn-quill)
- **Security**: Argon2 key derivation, secure keychain storage

## Requirements

- Node.js (v18+)
- pnpm
- Xcode (for iOS/macOS builds)
- Android Studio (for Android builds)

## Getting Started

```bash
pnpm install
cd apps/app
pnpm ios
# or
pnpm android
```

For detailed setup help, see the [Expo documentation](https://docs.expo.dev/).

## Project Structure

```
jot/
├── apps/
│   ├── app/                    # Main Expo mobile app
│   │   ├── lib/                # Main TypeScript/React source code
│   │   │   ├── ai/             # AI/LLM functionality
│   │   │   ├── analytics/      # PostHog telemetry (optional)
│   │   │   ├── attachments/    # File attachment handling
│   │   │   ├── components/     # Reusable React components
│   │   │   ├── db/             # Database layer (SQLite, migrations)
│   │   │   ├── encryption/     # Encryption and key management
│   │   │   ├── navigation/     # Navigation logic
│   │   │   ├── screens/        # Screen components
│   │   │   ├── theme/          # Theming and styling
│   │   │   ├── utils/          # Utility functions
│   │   │   └── widgets/        # Widget data bridge
│   │   ├── modules/            # Expo native modules
│   │   │   ├── platform-ai/    # Platform-specific AI (Swift/Kotlin)
│   │   │   ├── keyboard-module/# Custom keyboard handling
│   │   │   └── widget-bridge/  # Widget communication bridge
│   │   ├── scripts/            # Development scripts
│   │   ├── targets/            # iOS widget targets (@bacons/apple-targets)
│   │   ├── packages/           # Swift packages
│   │   │   └── widget-utils/   # Shared widget utilities
│   │   └── native/             # Native widget source code
│   └── server/                 # Sync server (Beta)
│       ├── src/                # Server source code
│       │   ├── cli.ts          # CLI entry point
│       │   ├── server.ts       # Express + WebSocket server
│       │   ├── db/             # SQLite database layer
│       │   ├── sync/           # Yjs sync via Hocuspocus
│       │   ├── llm/            # LLM service (stub)
│       │   └── api/            # REST API routes
│       └── __tests__/          # Server tests
├── packages/                   # Shared packages (future)
├── pnpm-workspace.yaml         # Workspace configuration
├── turbo.json                  # Turborepo task definitions
└── package.json                # Workspace root
```

## Development

### Commands

From the root directory (runs across all packages via Turborepo):

```bash
pnpm turbo lint          # Run ESLint across all packages
pnpm turbo typecheck     # TypeScript type checking
pnpm turbo test          # Run tests across all packages
```

From `apps/app/` directory:

```bash
# Start development
pnpm start              # Start Expo dev server
pnpm ios                # Run on iOS simulator
pnpm android            # Run on Android emulator

# Code quality
pnpm lint               # Run ESLint
pnpm lint:fix           # Auto-fix lint issues
pnpm typecheck          # TypeScript type checking

# Testing
pnpm test               # Run all TypeScript tests
pnpm test:swift         # Run Swift tests
pnpm test:kotlin        # Run Kotlin tests
pnpm test:all           # Run all tests
pnpm coverage           # Generate coverage report

# Database
pnpm create:migration <name>   # Create a new migration
pnpm test:migrations           # Test migrations (up/down/reset)

# AI Models
pnpm download:models    # Download AI models for on-device inference
```

From `apps/server/` directory (sync server - Beta):

```bash
# Start server
pnpm dev                # Start server in development mode (port 3000)
pnpm jot-server start   # Same as above

# Server commands
pnpm jot-server status  # Show server status (documents, sessions)
pnpm jot-server devices # List connected sessions
pnpm jot-server models list    # List available AI models (stub)

# Code quality
pnpm lint               # Run ESLint
pnpm typecheck          # TypeScript type checking
pnpm test               # Run server tests
```

### Pre-commit Hooks

The project uses husky + lint-staged to automatically lint and fix staged files before each commit.

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
