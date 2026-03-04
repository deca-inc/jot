# macOS Setup Guide

This guide covers setting up jot-server as a launchd service on macOS, with optional Tailscale integration for secure remote access.

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Running as a Launchd Service](#running-as-a-launchd-service)
- [Tailscale Integration](#tailscale-integration)
- [Firewall Configuration](#firewall-configuration)
- [Useful Commands](#useful-commands)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# Install jot-server
curl -fsSL https://raw.githubusercontent.com/deca-inc/jot/main/apps/server/install.sh | bash

# Start the server
jot-server start

# Check status
jot-server status
```

---

## Installation

### Install jot-server

```bash
curl -fsSL https://raw.githubusercontent.com/deca-inc/jot/main/apps/server/install.sh | bash
```

This installs the binary to `~/.local/bin/jot-server`. Add it to your PATH if not already:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Verify Installation

```bash
jot-server --version
jot-server status
```

---

## Running as a Launchd Service

On macOS, launchd manages background services. You can run jot-server as either a user agent (runs when you log in) or a system daemon (runs at boot).

### Option 1: User Agent (Recommended for Personal Use)

This runs the server when you log in, using your user account.

#### 1. Create the Launchd Plist

```bash
mkdir -p ~/Library/LaunchAgents

cat > ~/Library/LaunchAgents/com.jot.server.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.jot.server</string>

    <key>ProgramArguments</key>
    <array>
        <string>/Users/YOUR_USERNAME/.local/bin/jot-server</string>
        <string>start</string>
        <string>--data-dir</string>
        <string>/Users/YOUR_USERNAME/.jot-server/data</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>3000</string>
        <key>JWT_SECRET</key>
        <string>YOUR_JWT_SECRET_HERE</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/YOUR_USERNAME/.jot-server/logs/stdout.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USERNAME/.jot-server/logs/stderr.log</string>

    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USERNAME/.jot-server</string>
</dict>
</plist>
EOF
```

#### 2. Configure the Service

```bash
# Replace YOUR_USERNAME with your actual username
USERNAME=$(whoami)
sed -i '' "s/YOUR_USERNAME/$USERNAME/g" ~/Library/LaunchAgents/com.jot.server.plist

# Generate a secure JWT secret
JWT_SECRET=$(openssl rand -base64 32)
sed -i '' "s/YOUR_JWT_SECRET_HERE/$JWT_SECRET/g" ~/Library/LaunchAgents/com.jot.server.plist

# Create directories
mkdir -p ~/.jot-server/data ~/.jot-server/logs
```

#### 3. Load and Start the Service

```bash
# Load the service
launchctl load ~/Library/LaunchAgents/com.jot.server.plist

# Check if it's running
launchctl list | grep com.jot.server

# View logs
tail -f ~/.jot-server/logs/stdout.log
```

### Option 2: System Daemon (Runs at Boot)

For a server that runs even when no user is logged in.

```bash
sudo cat > /Library/LaunchDaemons/com.jot.server.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.jot.server</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/jot-server</string>
        <string>start</string>
        <string>--data-dir</string>
        <string>/var/lib/jot-server/data</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>3000</string>
        <key>JWT_SECRET</key>
        <string>YOUR_JWT_SECRET_HERE</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/var/log/jot-server/stdout.log</string>

    <key>StandardErrorPath</key>
    <string>/var/log/jot-server/stderr.log</string>

    <key>UserName</key>
    <string>_jot</string>

    <key>GroupName</key>
    <string>_jot</string>
</dict>
</plist>
EOF

# Create service user and directories
sudo dscl . -create /Users/_jot
sudo dscl . -create /Users/_jot UserShell /usr/bin/false
sudo dscl . -create /Users/_jot UniqueID 400
sudo dscl . -create /Users/_jot PrimaryGroupID 400

sudo mkdir -p /var/lib/jot-server/data /var/log/jot-server
sudo chown -R _jot:_jot /var/lib/jot-server /var/log/jot-server

# Copy binary to system location
sudo cp ~/.local/bin/jot-server /usr/local/bin/

# Generate JWT secret
JWT_SECRET=$(openssl rand -base64 32)
sudo sed -i '' "s/YOUR_JWT_SECRET_HERE/$JWT_SECRET/g" /Library/LaunchDaemons/com.jot.server.plist

# Load the daemon
sudo launchctl load /Library/LaunchDaemons/com.jot.server.plist
```

---

## Tailscale Integration

> **Why HTTPS?** Android requires HTTPS connections by default - the Jot app will not connect to an HTTP-only server. Tailscale makes TLS certificate management easy, but you can also use Let's Encrypt, self-signed certs (with manual trust), or any other certificate authority.

### 1. Install Tailscale

Download from [tailscale.com/download/mac](https://tailscale.com/download/mac) or use Homebrew:

```bash
brew install --cask tailscale
```

### 2. Connect to Tailscale

Open the Tailscale app and sign in to your account.

### 3. Get Your Tailscale Hostname

```bash
# In Terminal
/Applications/Tailscale.app/Contents/MacOS/Tailscale status

# Your hostname will be something like: my-mac.tail12345.ts.net
```

### 4. Enable HTTPS Certificates

1. Go to [Tailscale Admin Console](https://login.tailscale.com/admin/dns)
2. Enable **MagicDNS**
3. Under **HTTPS Certificates**, enable HTTPS

### 5. Generate TLS Certificates

```bash
# Generate certificates
sudo /Applications/Tailscale.app/Contents/MacOS/Tailscale cert my-mac.tail12345.ts.net

# Certificates are saved to the current directory
# Move them to a secure location
mkdir -p ~/.jot-server/certs
sudo mv my-mac.tail12345.ts.net.crt ~/.jot-server/certs/
sudo mv my-mac.tail12345.ts.net.key ~/.jot-server/certs/
sudo chown $(whoami) ~/.jot-server/certs/*
chmod 600 ~/.jot-server/certs/*
```

### 6. Update Launchd Configuration for TLS

Update your plist to include TLS options:

```bash
cat > ~/Library/LaunchAgents/com.jot.server.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.jot.server</string>

    <key>ProgramArguments</key>
    <array>
        <string>/Users/YOUR_USERNAME/.local/bin/jot-server</string>
        <string>start</string>
        <string>--data-dir</string>
        <string>/Users/YOUR_USERNAME/.jot-server/data</string>
        <string>--tls-cert</string>
        <string>/Users/YOUR_USERNAME/.jot-server/certs/my-mac.tail12345.ts.net.crt</string>
        <string>--tls-key</string>
        <string>/Users/YOUR_USERNAME/.jot-server/certs/my-mac.tail12345.ts.net.key</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>3000</string>
        <key>JWT_SECRET</key>
        <string>YOUR_JWT_SECRET_HERE</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/YOUR_USERNAME/.jot-server/logs/stdout.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USERNAME/.jot-server/logs/stderr.log</string>
</dict>
</plist>
EOF

# Update placeholders
USERNAME=$(whoami)
sed -i '' "s/YOUR_USERNAME/$USERNAME/g" ~/Library/LaunchAgents/com.jot.server.plist
sed -i '' "s/my-mac.tail12345.ts.net/YOUR_ACTUAL_HOSTNAME/g" ~/Library/LaunchAgents/com.jot.server.plist

# Generate new JWT secret
JWT_SECRET=$(openssl rand -base64 32)
sed -i '' "s/YOUR_JWT_SECRET_HERE/$JWT_SECRET/g" ~/Library/LaunchAgents/com.jot.server.plist

# Reload the service
launchctl unload ~/Library/LaunchAgents/com.jot.server.plist
launchctl load ~/Library/LaunchAgents/com.jot.server.plist
```

### 7. Certificate Renewal

Create a renewal script:

```bash
cat > ~/.jot-server/renew-cert.sh << 'EOF'
#!/bin/bash
HOSTNAME="my-mac.tail12345.ts.net"  # Update with your hostname
CERT_DIR="$HOME/.jot-server/certs"

cd "$CERT_DIR"
/Applications/Tailscale.app/Contents/MacOS/Tailscale cert "$HOSTNAME"

# Restart jot-server to pick up new certs
launchctl unload ~/Library/LaunchAgents/com.jot.server.plist
launchctl load ~/Library/LaunchAgents/com.jot.server.plist
EOF

chmod +x ~/.jot-server/renew-cert.sh
```

Add to crontab for monthly renewal:

```bash
crontab -e
# Add this line:
0 0 1 * * ~/.jot-server/renew-cert.sh
```

---

## Firewall Configuration

### With Tailscale

No firewall configuration needed. Tailscale handles networking through its encrypted overlay.

### Without Tailscale

If allowing direct connections:

1. **System Preferences** > **Security & Privacy** > **Firewall**
2. Click **Firewall Options**
3. Click **+** and add jot-server
4. Set to **Allow incoming connections**

Or via command line:

```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/jot-server
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /usr/local/bin/jot-server
```

---

## Useful Commands

### Service Management

```bash
# Load (start) the service
launchctl load ~/Library/LaunchAgents/com.jot.server.plist

# Unload (stop) the service
launchctl unload ~/Library/LaunchAgents/com.jot.server.plist

# Check if running
launchctl list | grep com.jot.server

# For system daemon (use sudo)
sudo launchctl load /Library/LaunchDaemons/com.jot.server.plist
sudo launchctl unload /Library/LaunchDaemons/com.jot.server.plist
```

### Viewing Logs

```bash
# View stdout log
tail -f ~/.jot-server/logs/stdout.log

# View stderr log
tail -f ~/.jot-server/logs/stderr.log

# View both
tail -f ~/.jot-server/logs/*.log

# For system daemon
sudo tail -f /var/log/jot-server/*.log
```

### Server Status and Testing

```bash
# Check server status
jot-server status

# List connected devices
jot-server devices

# Test HTTP endpoint
curl http://localhost:3000/

# Test HTTPS endpoint (with Tailscale)
curl https://my-mac.tail12345.ts.net:3000/

# Test API status
curl http://localhost:3000/api/status
```

### Tailscale Commands

```bash
# Check Tailscale status
/Applications/Tailscale.app/Contents/MacOS/Tailscale status

# Get your Tailscale IP
/Applications/Tailscale.app/Contents/MacOS/Tailscale ip -4

# Generate certificate
sudo /Applications/Tailscale.app/Contents/MacOS/Tailscale cert hostname.tail12345.ts.net
```

---

## Troubleshooting

### Server Won't Start

**Check logs first:**
```bash
cat ~/.jot-server/logs/stderr.log
```

**Common issues:**

1. **Port already in use**
   ```bash
   # Check what's using the port
   lsof -i :3000

   # Change port in plist and reload
   ```

2. **Binary not found**
   ```bash
   # Verify path in plist matches actual location
   ls -la ~/.local/bin/jot-server

   # Or copy to /usr/local/bin
   sudo cp ~/.local/bin/jot-server /usr/local/bin/
   ```

3. **Permission denied**
   ```bash
   # Ensure directories exist and are writable
   mkdir -p ~/.jot-server/data ~/.jot-server/logs
   chmod 755 ~/.jot-server
   ```

### Launchd Issues

1. **Service not loading**
   ```bash
   # Check for plist syntax errors
   plutil -lint ~/Library/LaunchAgents/com.jot.server.plist

   # Check launchd logs
   log show --predicate 'subsystem == "com.apple.launchd"' --last 5m
   ```

2. **Service keeps restarting**
   ```bash
   # Check exit code
   launchctl list | grep com.jot.server
   # Non-zero exit code indicates error - check stderr.log
   ```

### TLS Certificate Errors

1. **Certificate not found**
   ```bash
   # Verify files exist
   ls -la ~/.jot-server/certs/

   # Regenerate
   cd ~/.jot-server/certs
   sudo /Applications/Tailscale.app/Contents/MacOS/Tailscale cert hostname.tail12345.ts.net
   sudo chown $(whoami) *
   ```

2. **Permission denied**
   ```bash
   chmod 600 ~/.jot-server/certs/*.key
   chmod 644 ~/.jot-server/certs/*.crt
   ```

### Connection Issues

1. **Can't connect from other devices**
   ```bash
   # Verify Tailscale is connected on both devices
   /Applications/Tailscale.app/Contents/MacOS/Tailscale status

   # Test connectivity
   ping my-mac.tail12345.ts.net
   ```

2. **Firewall blocking**
   ```bash
   # Check firewall status
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

   # Allow jot-server
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add ~/.local/bin/jot-server
   ```

### Updating jot-server

```bash
# Check for updates
jot-server update --check

# Install update
jot-server update

# Reload the service
launchctl unload ~/Library/LaunchAgents/com.jot.server.plist
launchctl load ~/Library/LaunchAgents/com.jot.server.plist
```

---

## Additional Resources

- [Tailscale Documentation](https://tailscale.com/kb/)
- [launchd.info](https://www.launchd.info/) - Comprehensive launchd reference
- [Apple launchd Documentation](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
