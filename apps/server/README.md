# Jot Server (Beta)

> **Beta:** This server is functional but may have breaking changes between versions.

Sync server for Jot - local-first journaling with end-to-end encryption.

## Platform Setup Guides

For detailed setup instructions including running as a system service and Tailscale integration:

- **[Linux Setup](docs/linux-setup.md)** - Ubuntu/Debian with systemd, Tailscale TLS, firewall config
- **[macOS Setup](docs/macos-setup.md)** - launchd service, Tailscale integration
- **[Windows Setup](docs/windows-setup.md)** - Windows Service with NSSM, Tailscale integration

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

### TLS / HTTPS

> **Important:** Android requires HTTPS connections - the app will not connect to an HTTP-only server. You must configure TLS certificates for Android clients to sync.

Enable HTTPS by providing certificate and key files:

```bash
jot-server start --tls-cert /path/to/cert.pem --tls-key /path/to/key.pem
```

**Certificate options:**
- **Tailscale** (recommended) - Automatic certs via `tailscale cert`, easy setup, no port forwarding needed
- **Let's Encrypt** - Free certs via certbot, requires public DNS and port 80/443
- **Self-signed** - For testing only, requires manual trust on each device
- **Bring your own** - Any valid certificate chain works

For Tailscale-managed certificates, see the [platform setup guides](#platform-setup-guides).

## Testing & Debugging

### Test Connectivity

```bash
# Test HTTP endpoint
curl http://localhost:3000/
# Expected: {"ok":true,"service":"jot-server"}

# Test API status
curl http://localhost:3000/api/status

# Test HTTPS (with TLS enabled)
curl https://your-hostname:3000/
```

### Verbose Logging

Enable detailed logging with the `--verbose` flag:

```bash
jot-server start --verbose
```

### View Logs

**Linux (systemd):**
```bash
sudo journalctl -u jot-server -f
```

**macOS (launchd):**
```bash
tail -f ~/.jot-server/logs/stdout.log
```

**Windows:**
```powershell
Get-Content "$env:LOCALAPPDATA\jot-server\logs\stdout.log" -Wait -Tail 50
```

### Server Commands

```bash
# Check server status (documents, sessions)
jot-server status

# List all connected devices/sessions
jot-server devices

# List only active sessions
jot-server devices --active-only
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
