# Jot Server

Sync server for Jot - local-first journaling with end-to-end encryption.

## Installation

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/deca-inc/jot/main/apps/server/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/deca-inc/jot/main/apps/server/install.ps1 | iex
```

## Upgrading

The server checks for updates automatically every hour and notifies you when a new version is available.

```bash
# Check for updates
jot-server update --check

# Install the latest version
jot-server update
```

Or run the install command again. Your data is preserved.

## Usage

```bash
# Start the server
jot-server start

# Start on a custom port
jot-server start --port 8080

# Use a custom data directory
jot-server start --data-dir /path/to/data

# View server status
jot-server status

# List connected devices
jot-server devices

# Check for updates
jot-server update --check

# Install updates
jot-server update
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `JWT_SECRET` | Secret for signing auth tokens | Random (regenerated on restart) |

### Persistent Sessions

Set `JWT_SECRET` so user sessions persist across server restarts:

```bash
# Generate a secret
export JWT_SECRET=$(openssl rand -base64 32)

# Start the server
jot-server start
```

On Windows:
```powershell
$env:JWT_SECRET = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))
jot-server start
```

## Data Storage

All data is stored in the data directory (default: `~/.jot-server/data` or `%LOCALAPPDATA%\jot-server\data`):

```
data/
├── jot-server.db      # SQLite database
└── assets/            # Encrypted file attachments
```

## Uninstalling

**macOS / Linux:**
```bash
rm -rf ~/.jot-server ~/.local/bin/jot-server
```

**Windows:**
```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\jot-server"
```

## Development

```bash
# Run in development mode
pnpm dev

# Build
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck
```
