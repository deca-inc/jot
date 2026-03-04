# Windows Setup Guide

This guide covers setting up jot-server as a Windows Service, with optional Tailscale integration for secure remote access.

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Running as a Windows Service](#running-as-a-windows-service)
- [Tailscale Integration](#tailscale-integration)
- [Firewall Configuration](#firewall-configuration)
- [Useful Commands](#useful-commands)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

Open PowerShell as Administrator:

```powershell
# Install jot-server
irm https://raw.githubusercontent.com/deca-inc/jot/main/apps/server/install.ps1 | iex

# Start the server
jot-server start

# Check status
jot-server status
```

---

## Installation

### Install jot-server

Open PowerShell and run:

```powershell
irm https://raw.githubusercontent.com/deca-inc/jot/main/apps/server/install.ps1 | iex
```

This installs the binary to `%LOCALAPPDATA%\jot-server\jot-server.exe` and adds it to your PATH.

### Verify Installation

```powershell
jot-server --version
jot-server status
```

---

## Running as a Windows Service

### Option 1: Using NSSM (Recommended)

[NSSM](https://nssm.cc/) (Non-Sucking Service Manager) makes it easy to run any application as a Windows service.

#### 1. Install NSSM

```powershell
# Using winget
winget install NSSM.NSSM

# Or using Chocolatey
choco install nssm

# Or download from https://nssm.cc/download
```

#### 2. Create the Service

Open PowerShell as Administrator:

```powershell
# Set variables
$ServiceName = "JotServer"
$JotServerPath = "$env:LOCALAPPDATA\jot-server\jot-server.exe"
$DataDir = "$env:LOCALAPPDATA\jot-server\data"

# Generate JWT secret
$JwtSecret = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))

# Create data directory
New-Item -ItemType Directory -Force -Path $DataDir

# Install the service
nssm install $ServiceName $JotServerPath start --data-dir $DataDir

# Configure service parameters
nssm set $ServiceName AppDirectory "$env:LOCALAPPDATA\jot-server"
nssm set $ServiceName AppEnvironmentExtra "PORT=3000" "JWT_SECRET=$JwtSecret"
nssm set $ServiceName DisplayName "Jot Sync Server"
nssm set $ServiceName Description "Local sync server for Jot journaling app"
nssm set $ServiceName Start SERVICE_AUTO_START

# Configure logging
nssm set $ServiceName AppStdout "$env:LOCALAPPDATA\jot-server\logs\stdout.log"
nssm set $ServiceName AppStderr "$env:LOCALAPPDATA\jot-server\logs\stderr.log"
nssm set $ServiceName AppRotateFiles 1
nssm set $ServiceName AppRotateBytes 1048576

# Create logs directory
New-Item -ItemType Directory -Force -Path "$env:LOCALAPPDATA\jot-server\logs"
```

#### 3. Start the Service

```powershell
nssm start JotServer

# Check status
nssm status JotServer

# Or using Windows services
Get-Service JotServer
```

### Option 2: Using Windows Task Scheduler

For a simpler setup without additional software:

#### 1. Create a Startup Script

```powershell
$ScriptPath = "$env:LOCALAPPDATA\jot-server\start-server.ps1"

@"
`$env:PORT = "3000"
`$env:JWT_SECRET = "$([Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 })))"

& "`$env:LOCALAPPDATA\jot-server\jot-server.exe" start --data-dir "`$env:LOCALAPPDATA\jot-server\data"
"@ | Out-File -FilePath $ScriptPath -Encoding UTF8
```

#### 2. Create Scheduled Task

```powershell
$Action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$env:LOCALAPPDATA\jot-server\start-server.ps1`""

$Trigger = New-ScheduledTaskTrigger -AtStartup

$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel Highest

$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName "JotServer" -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings
```

#### 3. Start the Task

```powershell
Start-ScheduledTask -TaskName "JotServer"

# Check if running
Get-ScheduledTask -TaskName "JotServer" | Select-Object TaskName, State
```

---

## Tailscale Integration

> **Why HTTPS?** Android requires HTTPS connections by default - the Jot app will not connect to an HTTP-only server. Tailscale makes TLS certificate management easy, but you can also use Let's Encrypt, self-signed certs (with manual trust), or any other certificate authority.

### 1. Install Tailscale

Download from [tailscale.com/download/windows](https://tailscale.com/download/windows) or:

```powershell
winget install Tailscale.Tailscale
```

### 2. Connect to Tailscale

Open Tailscale from the system tray and sign in.

### 3. Get Your Tailscale Hostname

```powershell
tailscale status
# Look for your hostname, e.g., "my-pc.tail12345.ts.net"
```

### 4. Enable HTTPS Certificates

1. Go to [Tailscale Admin Console](https://login.tailscale.com/admin/dns)
2. Enable **MagicDNS**
3. Under **HTTPS Certificates**, enable HTTPS

### 5. Generate TLS Certificates

Open PowerShell as Administrator:

```powershell
# Create certs directory
$CertDir = "$env:LOCALAPPDATA\jot-server\certs"
New-Item -ItemType Directory -Force -Path $CertDir
Set-Location $CertDir

# Generate certificates (replace with your hostname)
tailscale cert my-pc.tail12345.ts.net

# Verify certificates were created
Get-ChildItem $CertDir
```

### 6. Update Service Configuration for TLS

If using NSSM:

```powershell
$CertDir = "$env:LOCALAPPDATA\jot-server\certs"
$Hostname = "my-pc.tail12345.ts.net"  # Replace with your hostname

# Update service with TLS parameters
nssm set JotServer AppParameters "start --data-dir `"$env:LOCALAPPDATA\jot-server\data`" --tls-cert `"$CertDir\$Hostname.crt`" --tls-key `"$CertDir\$Hostname.key`""

# Restart the service
nssm restart JotServer
```

If using Task Scheduler, update the startup script:

```powershell
$CertDir = "$env:LOCALAPPDATA\jot-server\certs"
$Hostname = "my-pc.tail12345.ts.net"  # Replace with your hostname
$ScriptPath = "$env:LOCALAPPDATA\jot-server\start-server.ps1"

@"
`$env:PORT = "3000"
`$env:JWT_SECRET = "YOUR_JWT_SECRET_HERE"

& "`$env:LOCALAPPDATA\jot-server\jot-server.exe" start ``
    --data-dir "`$env:LOCALAPPDATA\jot-server\data" ``
    --tls-cert "$CertDir\$Hostname.crt" ``
    --tls-key "$CertDir\$Hostname.key"
"@ | Out-File -FilePath $ScriptPath -Encoding UTF8

# Restart the task
Stop-ScheduledTask -TaskName "JotServer"
Start-ScheduledTask -TaskName "JotServer"
```

### 7. Certificate Renewal

Create a renewal script:

```powershell
$RenewScript = "$env:LOCALAPPDATA\jot-server\renew-cert.ps1"
$Hostname = "my-pc.tail12345.ts.net"  # Replace with your hostname

@"
Set-Location "`$env:LOCALAPPDATA\jot-server\certs"
tailscale cert $Hostname

# Restart jot-server
if (Get-Service JotServer -ErrorAction SilentlyContinue) {
    Restart-Service JotServer
} else {
    Stop-ScheduledTask -TaskName "JotServer"
    Start-ScheduledTask -TaskName "JotServer"
}
"@ | Out-File -FilePath $RenewScript -Encoding UTF8
```

Create a scheduled task for monthly renewal:

```powershell
$Action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -File `"$env:LOCALAPPDATA\jot-server\renew-cert.ps1`""

$Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 3am

Register-ScheduledTask -TaskName "JotServerCertRenewal" -Action $Action -Trigger $Trigger -RunLevel Highest
```

---

## Firewall Configuration

### With Tailscale

Tailscale handles firewall configuration automatically. No additional setup needed.

### Without Tailscale

Allow jot-server through Windows Firewall:

```powershell
# Allow inbound connections on port 3000
New-NetFirewallRule -DisplayName "Jot Server" `
    -Direction Inbound `
    -LocalPort 3000 `
    -Protocol TCP `
    -Action Allow

# Or allow the application
New-NetFirewallRule -DisplayName "Jot Server App" `
    -Direction Inbound `
    -Program "$env:LOCALAPPDATA\jot-server\jot-server.exe" `
    -Action Allow
```

To verify:

```powershell
Get-NetFirewallRule -DisplayName "Jot Server*" | Format-Table Name, DisplayName, Enabled
```

---

## Useful Commands

### Service Management (NSSM)

```powershell
# Start the service
nssm start JotServer

# Stop the service
nssm stop JotServer

# Restart the service
nssm restart JotServer

# Check status
nssm status JotServer

# Edit service configuration
nssm edit JotServer

# Remove the service
nssm remove JotServer confirm
```

### Service Management (Windows Services)

```powershell
# Using PowerShell
Start-Service JotServer
Stop-Service JotServer
Restart-Service JotServer
Get-Service JotServer

# Using sc.exe
sc.exe start JotServer
sc.exe stop JotServer
sc.exe query JotServer
```

### Task Scheduler Management

```powershell
# Start the task
Start-ScheduledTask -TaskName "JotServer"

# Stop the task
Stop-ScheduledTask -TaskName "JotServer"

# Check status
Get-ScheduledTask -TaskName "JotServer" | Select-Object TaskName, State

# Disable the task
Disable-ScheduledTask -TaskName "JotServer"

# Enable the task
Enable-ScheduledTask -TaskName "JotServer"

# Remove the task
Unregister-ScheduledTask -TaskName "JotServer" -Confirm:$false
```

### Viewing Logs

```powershell
# View recent stdout log
Get-Content "$env:LOCALAPPDATA\jot-server\logs\stdout.log" -Tail 50

# Follow logs in real-time
Get-Content "$env:LOCALAPPDATA\jot-server\logs\stdout.log" -Wait -Tail 20

# View error log
Get-Content "$env:LOCALAPPDATA\jot-server\logs\stderr.log" -Tail 50

# View Windows Event Log for NSSM
Get-EventLog -LogName Application -Source nssm -Newest 20
```

### Server Status and Testing

```powershell
# Check server status
jot-server status

# List connected devices
jot-server devices

# Test HTTP endpoint
Invoke-RestMethod http://localhost:3000/

# Test HTTPS endpoint (with Tailscale)
Invoke-RestMethod https://my-pc.tail12345.ts.net:3000/

# Test API status
Invoke-RestMethod http://localhost:3000/api/status
```

### Tailscale Commands

```powershell
# Check Tailscale status
tailscale status

# Get your Tailscale IP
tailscale ip -4

# Generate certificate
tailscale cert my-pc.tail12345.ts.net
```

---

## Troubleshooting

### Server Won't Start

**Check logs first:**
```powershell
Get-Content "$env:LOCALAPPDATA\jot-server\logs\stderr.log" -Tail 100
```

**Common issues:**

1. **Port already in use**
   ```powershell
   # Check what's using the port
   Get-NetTCPConnection -LocalPort 3000 | Select-Object LocalPort, OwningProcess
   Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess

   # Change port in service configuration
   ```

2. **Binary not found**
   ```powershell
   # Verify the binary exists
   Test-Path "$env:LOCALAPPDATA\jot-server\jot-server.exe"

   # Reinstall if missing
   irm https://raw.githubusercontent.com/deca-inc/jot/main/apps/server/install.ps1 | iex
   ```

3. **Permission issues**
   ```powershell
   # Ensure directories exist
   New-Item -ItemType Directory -Force -Path "$env:LOCALAPPDATA\jot-server\data"
   New-Item -ItemType Directory -Force -Path "$env:LOCALAPPDATA\jot-server\logs"
   ```

### Service Issues (NSSM)

1. **Service won't start**
   ```powershell
   # Check NSSM event log
   Get-EventLog -LogName Application -Source nssm -Newest 10

   # Verify service configuration
   nssm get JotServer Application
   nssm get JotServer AppParameters
   nssm get JotServer AppDirectory
   ```

2. **Service keeps stopping**
   ```powershell
   # Check exit code
   nssm get JotServer ExitActions

   # View stderr log for errors
   Get-Content "$env:LOCALAPPDATA\jot-server\logs\stderr.log"
   ```

### TLS Certificate Errors

1. **Certificate not found**
   ```powershell
   # Verify certificates exist
   Get-ChildItem "$env:LOCALAPPDATA\jot-server\certs"

   # Regenerate
   Set-Location "$env:LOCALAPPDATA\jot-server\certs"
   tailscale cert my-pc.tail12345.ts.net
   ```

2. **Certificate permission issues**
   ```powershell
   # Check file permissions
   Get-Acl "$env:LOCALAPPDATA\jot-server\certs\*.key" | Format-List

   # Ensure the service account can read them
   icacls "$env:LOCALAPPDATA\jot-server\certs" /grant:r "$env:USERNAME:(OI)(CI)F"
   ```

### Connection Issues

1. **Can't connect from other devices**
   ```powershell
   # Verify Tailscale is connected
   tailscale status

   # Test connectivity from the other device
   ping my-pc.tail12345.ts.net
   ```

2. **Firewall blocking connections**
   ```powershell
   # Check firewall rules
   Get-NetFirewallRule -DisplayName "*Jot*" | Format-Table Name, Enabled, Direction

   # Temporarily disable firewall to test (re-enable after!)
   Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False
   # Test, then re-enable:
   Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True
   ```

3. **Antivirus blocking**

   Some antivirus software may block jot-server. Add an exception for:
   - `%LOCALAPPDATA%\jot-server\jot-server.exe`
   - Port 3000 (or your configured port)

### Updating jot-server

```powershell
# Check for updates
jot-server update --check

# Install update
jot-server update

# After update, restart the service
nssm restart JotServer
# Or
Stop-ScheduledTask -TaskName "JotServer"
Start-ScheduledTask -TaskName "JotServer"
```

---

## Additional Resources

- [Tailscale Documentation](https://tailscale.com/kb/)
- [NSSM Documentation](https://nssm.cc/usage)
- [Windows Services Documentation](https://docs.microsoft.com/en-us/windows/win32/services/services)
- [Windows Firewall Documentation](https://docs.microsoft.com/en-us/windows/security/threat-protection/windows-firewall/)
