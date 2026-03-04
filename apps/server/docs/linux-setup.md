# Linux Setup Guide (Ubuntu/Debian)

This guide covers setting up jot-server as a systemd service on Ubuntu/Debian-based systems, with optional Tailscale integration for secure remote access.

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Running as a Systemd Service](#running-as-a-systemd-service)
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

### Prerequisites

- Ubuntu 20.04+ or Debian 11+
- curl or wget

### Install jot-server

```bash
curl -fsSL https://raw.githubusercontent.com/deca-inc/jot/main/apps/server/install.sh | bash
```

This installs the binary to `~/.local/bin/jot-server`. Make sure `~/.local/bin` is in your PATH:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Verify Installation

```bash
jot-server --version
jot-server status
```

---

## Running as a Systemd Service

Running jot-server as a systemd service ensures it starts automatically on boot and restarts on failure.

### 1. Create a Dedicated User (Recommended)

```bash
sudo useradd -r -s /bin/false jot-server
sudo mkdir -p /var/lib/jot-server
sudo chown jot-server:jot-server /var/lib/jot-server
```

### 2. Copy the Binary

```bash
sudo cp ~/.local/bin/jot-server /usr/local/bin/
sudo chmod +x /usr/local/bin/jot-server
```

### 3. Create Environment File

```bash
sudo mkdir -p /etc/jot-server
sudo tee /etc/jot-server/env << 'EOF'
# Server port
PORT=3000

# JWT secret for persistent sessions (generate with: openssl rand -base64 32)
JWT_SECRET=your-secret-here

# Optional: TLS certificate paths (see Tailscale section)
# TLS_CERT=/var/lib/jot-server/certs/cert.pem
# TLS_KEY=/var/lib/jot-server/certs/key.pem
EOF

# Generate a secure JWT secret
sudo sed -i "s/your-secret-here/$(openssl rand -base64 32)/" /etc/jot-server/env

# Secure the file
sudo chmod 600 /etc/jot-server/env
sudo chown jot-server:jot-server /etc/jot-server/env
```

### 4. Create Systemd Service File

```bash
sudo tee /etc/systemd/system/jot-server.service << 'EOF'
[Unit]
Description=Jot Sync Server
Documentation=https://github.com/deca-inc/jot
After=network.target

[Service]
Type=simple
User=jot-server
Group=jot-server
EnvironmentFile=/etc/jot-server/env
ExecStart=/usr/local/bin/jot-server start --data-dir /var/lib/jot-server/data
Restart=on-failure
RestartSec=5

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/jot-server

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=jot-server

[Install]
WantedBy=multi-user.target
EOF
```

### 5. Enable and Start the Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable jot-server

# Start the service
sudo systemctl start jot-server

# Check status
sudo systemctl status jot-server
```

---

## Tailscale Integration

> **Why HTTPS?** Android requires HTTPS connections by default - the Jot app will not connect to an HTTP-only server. Tailscale makes TLS certificate management easy, but you can also use Let's Encrypt, self-signed certs (with manual trust), or any other certificate authority.

[Tailscale](https://tailscale.com/) provides secure, encrypted networking between your devices. Using Tailscale with jot-server allows you to sync across devices without exposing your server to the public internet.

### 1. Install Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

### 2. Authenticate Tailscale

```bash
sudo tailscale up
```

Follow the URL to authenticate with your Tailscale account.

### 3. Get Your Tailscale IP

```bash
tailscale ip -4
# Example output: 100.64.0.1
```

### 4. Enable HTTPS with Tailscale Certs

Tailscale can automatically provision TLS certificates for your machine. This is the recommended way to secure your server.

#### Enable HTTPS in Tailscale Admin

1. Go to [Tailscale Admin Console](https://login.tailscale.com/admin/dns)
2. Under **DNS**, enable **MagicDNS**
3. Under **HTTPS Certificates**, enable HTTPS

#### Generate Certificates

```bash
# Get your machine's Tailscale DNS name
tailscale status
# Look for your hostname, e.g., "my-server.tail12345.ts.net"

# Generate certificates
sudo tailscale cert my-server.tail12345.ts.net

# This creates:
#   /var/lib/tailscale/certs/my-server.tail12345.ts.net.crt
#   /var/lib/tailscale/certs/my-server.tail12345.ts.net.key
```

#### Configure jot-server for TLS

Update your environment file:

```bash
sudo tee -a /etc/jot-server/env << 'EOF'

# TLS Configuration (Tailscale certs)
TLS_CERT=/var/lib/tailscale/certs/my-server.tail12345.ts.net.crt
TLS_KEY=/var/lib/tailscale/certs/my-server.tail12345.ts.net.key
EOF
```

Update the systemd service to use TLS:

```bash
sudo tee /etc/systemd/system/jot-server.service << 'EOF'
[Unit]
Description=Jot Sync Server
Documentation=https://github.com/deca-inc/jot
After=network.target tailscaled.service
Wants=tailscaled.service

[Service]
Type=simple
User=jot-server
Group=jot-server
EnvironmentFile=/etc/jot-server/env
ExecStart=/usr/local/bin/jot-server start \
    --data-dir /var/lib/jot-server/data \
    --tls-cert ${TLS_CERT} \
    --tls-key ${TLS_KEY}
Restart=on-failure
RestartSec=5

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/jot-server
ReadOnlyPaths=/var/lib/tailscale/certs

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=jot-server

[Install]
WantedBy=multi-user.target
EOF
```

#### Grant Certificate Access

The jot-server user needs read access to the Tailscale certificates:

```bash
# Add jot-server to a group that can read certs
sudo groupadd -f tailscale-certs
sudo usermod -aG tailscale-certs jot-server

# Set permissions on cert directory
sudo chgrp -R tailscale-certs /var/lib/tailscale/certs
sudo chmod 750 /var/lib/tailscale/certs
sudo chmod 640 /var/lib/tailscale/certs/*
```

#### Restart the Service

```bash
sudo systemctl daemon-reload
sudo systemctl restart jot-server
sudo systemctl status jot-server
```

### 5. Certificate Renewal

Tailscale certificates are valid for 90 days. Set up automatic renewal:

```bash
sudo tee /etc/cron.weekly/tailscale-cert-renew << 'EOF'
#!/bin/bash
# Renew Tailscale certificate and restart jot-server
HOSTNAME=$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')
tailscale cert "$HOSTNAME"
systemctl restart jot-server
EOF

sudo chmod +x /etc/cron.weekly/tailscale-cert-renew
```

### 6. Connect from Jot App

In your Jot app settings, configure the sync server:

- **Server URL**: `https://my-server.tail12345.ts.net:3000`

Make sure the device running the app is also connected to your Tailscale network.

---

## Firewall Configuration

### With Tailscale (Recommended)

When using Tailscale, you don't need to open any ports on your firewall. Tailscale handles all networking through its encrypted overlay network.

### Without Tailscale (Direct Access)

If you need direct access without Tailscale:

```bash
# Allow port 3000 (or your chosen port)
sudo ufw allow 3000/tcp

# Check status
sudo ufw status
```

**Warning**: Exposing jot-server directly to the internet is not recommended. If you must, ensure you:
1. Use TLS (with Let's Encrypt or similar)
2. Use a strong JWT_SECRET
3. Consider putting a reverse proxy (nginx, Caddy) in front

---

## Useful Commands

### Service Management

```bash
# Start the service
sudo systemctl start jot-server

# Stop the service
sudo systemctl stop jot-server

# Restart the service
sudo systemctl restart jot-server

# Check service status
sudo systemctl status jot-server

# Enable auto-start on boot
sudo systemctl enable jot-server

# Disable auto-start
sudo systemctl disable jot-server
```

### Viewing Logs

```bash
# View recent logs
sudo journalctl -u jot-server -n 50

# Follow logs in real-time
sudo journalctl -u jot-server -f

# View logs since last boot
sudo journalctl -u jot-server -b

# View logs from the last hour
sudo journalctl -u jot-server --since "1 hour ago"

# View logs with timestamps
sudo journalctl -u jot-server -o short-precise

# Export logs to a file
sudo journalctl -u jot-server --since today > jot-server-logs.txt
```

### Server Status and Testing

```bash
# Check server status (local)
jot-server status --data-dir /var/lib/jot-server/data

# List connected devices
jot-server devices --data-dir /var/lib/jot-server/data

# Test HTTP endpoint
curl http://localhost:3000/
# Expected: {"ok":true,"service":"jot-server"}

# Test HTTPS endpoint (with Tailscale)
curl https://my-server.tail12345.ts.net:3000/
# Expected: {"ok":true,"service":"jot-server"}

# Test API status endpoint
curl http://localhost:3000/api/status
```

### Tailscale Commands

```bash
# Check Tailscale status
tailscale status

# Get your Tailscale IP
tailscale ip -4

# Check if Tailscale is running
sudo systemctl status tailscaled

# Restart Tailscale
sudo systemctl restart tailscaled

# View Tailscale logs
sudo journalctl -u tailscaled -f
```

---

## Troubleshooting

### Server Won't Start

**Check logs first:**
```bash
sudo journalctl -u jot-server -n 100 --no-pager
```

**Common issues:**

1. **Port already in use**
   ```bash
   # Check what's using the port
   sudo lsof -i :3000
   # or
   sudo ss -tlnp | grep 3000

   # Change the port in /etc/jot-server/env
   ```

2. **Permission denied on data directory**
   ```bash
   sudo chown -R jot-server:jot-server /var/lib/jot-server
   sudo chmod 755 /var/lib/jot-server
   ```

3. **Binary not found**
   ```bash
   # Verify binary exists and is executable
   ls -la /usr/local/bin/jot-server
   sudo chmod +x /usr/local/bin/jot-server
   ```

### TLS Certificate Errors

1. **Certificate not found**
   ```bash
   # Verify certificate files exist
   ls -la /var/lib/tailscale/certs/

   # Regenerate if needed
   sudo tailscale cert your-hostname.tail12345.ts.net
   ```

2. **Permission denied reading certificates**
   ```bash
   # Check permissions
   ls -la /var/lib/tailscale/certs/

   # Fix permissions
   sudo chgrp -R tailscale-certs /var/lib/tailscale/certs
   sudo chmod 750 /var/lib/tailscale/certs
   sudo chmod 640 /var/lib/tailscale/certs/*

   # Ensure jot-server user is in the group
   sudo usermod -aG tailscale-certs jot-server

   # Restart the service (to pick up group membership)
   sudo systemctl restart jot-server
   ```

3. **Certificate expired**
   ```bash
   # Check certificate expiration
   openssl x509 -in /var/lib/tailscale/certs/*.crt -noout -dates

   # Renew certificate
   sudo tailscale cert your-hostname.tail12345.ts.net
   sudo systemctl restart jot-server
   ```

### Connection Issues

1. **Can't connect from other devices**
   ```bash
   # Verify Tailscale is running on both devices
   tailscale status

   # Ping the server from the client device
   ping my-server.tail12345.ts.net

   # Test the connection
   curl -v https://my-server.tail12345.ts.net:3000/
   ```

2. **Firewall blocking connections**
   ```bash
   # Check if ufw is blocking
   sudo ufw status

   # Tailscale traffic should bypass ufw, but verify:
   sudo ufw allow in on tailscale0
   ```

3. **WebSocket connection failing**

   WebSocket upgrades happen on the same port as HTTP. If HTTP works but WebSocket doesn't:
   ```bash
   # Test WebSocket with wscat (install: npm install -g wscat)
   wscat -c wss://my-server.tail12345.ts.net:3000
   ```

### Tailscale Issues

1. **Tailscale not connecting**
   ```bash
   # Check Tailscale status
   sudo systemctl status tailscaled

   # View Tailscale logs
   sudo journalctl -u tailscaled -f

   # Re-authenticate if needed
   sudo tailscale up --reset
   ```

2. **MagicDNS not resolving**
   ```bash
   # Check DNS configuration
   tailscale status

   # Verify MagicDNS is enabled in admin console
   # Try using the IP directly instead of hostname
   curl https://100.64.0.1:3000/
   ```

3. **HTTPS certificates not generating**
   ```bash
   # Ensure HTTPS is enabled in Tailscale admin console
   # DNS -> HTTPS Certificates -> Enable

   # Try regenerating
   sudo tailscale cert $(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')
   ```

### Performance Issues

1. **High CPU usage**
   ```bash
   # Check process stats
   top -p $(pgrep jot-server)

   # View detailed logs
   sudo journalctl -u jot-server -f
   ```

2. **Database locked errors**
   ```bash
   # Check for stuck processes
   sudo lsof /var/lib/jot-server/data/jot-server.db

   # Restart the service
   sudo systemctl restart jot-server
   ```

### Updating jot-server

```bash
# Check for updates
jot-server update --check

# Install update
jot-server update

# Or reinstall manually
curl -fsSL https://raw.githubusercontent.com/deca-inc/jot/main/apps/server/install.sh | bash
sudo cp ~/.local/bin/jot-server /usr/local/bin/
sudo systemctl restart jot-server
```

---

## Additional Resources

- [Tailscale Documentation](https://tailscale.com/kb/)
- [Systemd Service Documentation](https://www.freedesktop.org/software/systemd/man/systemd.service.html)
- [Ubuntu Server Guide](https://ubuntu.com/server/docs)
