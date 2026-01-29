# Jot

A private, local-first journaling app with on-device AI.

## Features

- **Local-first** - All data stays on your device. No accounts, no cloud sync required.
- **Encrypted storage** - Your journal is encrypted at rest using SQLCipher.
- **AI conversations** - Chat with a local AI assistant (runs entirely on-device).
- **Rich text editing** - Write with headings, lists, checkboxes, code blocks, tables, and more.
- **Fast search** - Full-text search across all your entries.

## Tech Stack

- **Framework**: Expo 54 + React Native 0.81
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
pnpm ios
# or
pnpm android
```

For detailed setup help, see the [Expo documentation](https://docs.expo.dev/).

## Project Structure

```
lib/                    # Main TypeScript/React source code
├── ai/                 # AI/LLM functionality (model management, inference)
├── analytics/          # PostHog telemetry (optional, off by default)
├── attachments/        # File attachment handling
├── components/         # Reusable React components
├── db/                 # Database layer (SQLite, migrations, queries)
├── encryption/         # Encryption and key management
├── navigation/         # Navigation logic
├── screens/            # Screen components
├── theme/              # Theming and styling
├── utils/              # Utility functions
└── widgets/            # Widget data bridge

modules/                # Expo native modules
├── platform-ai/        # Platform-specific AI module (Swift/Kotlin)
├── keyboard-module/    # Custom keyboard handling
└── widget-bridge/      # Widget communication bridge

scripts/                # Development scripts
├── createMigration.ts  # Create new database migrations
├── downloadModels.ts   # Download AI models
└── testMigrations.ts   # Test migration up/down/reset

targets/                # iOS widget targets
└── jot-widget/         # iOS widget implementation (Swift)

packages/               # Swift packages
└── widget-utils/       # Shared widget utilities
```

## Development

### Commands

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
