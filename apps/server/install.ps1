# Jot Server Installer for Windows
# Usage: irm https://raw.githubusercontent.com/YOUR_USERNAME/journal/main/apps/server/install.ps1 | iex

$ErrorActionPreference = "Stop"

# Configuration
$Repo = "deca-inc/jot"
$InstallDir = if ($env:JOT_INSTALL_DIR) { $env:JOT_INSTALL_DIR } else { "$env:LOCALAPPDATA\jot-server" }
$DataDir = if ($env:JOT_DATA_DIR) { $env:JOT_DATA_DIR } else { "$InstallDir\data" }

function Write-Info { param($Message) Write-Host "[INFO] $Message" -ForegroundColor Green }
function Write-Warn { param($Message) Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Write-Err { param($Message) Write-Host "[ERROR] $Message" -ForegroundColor Red; exit 1 }

function Get-LatestVersion {
    Write-Info "Fetching latest version..."
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
    $version = $release.tag_name -replace '^v', ''
    Write-Info "Latest version: v$version"
    return $version
}

function Install-JotServer {
    param($Version)

    $Arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { Write-Err "32-bit Windows is not supported" }
    $DownloadUrl = "https://github.com/$Repo/releases/download/v$Version/jot-server-windows-$Arch.zip"

    Write-Info "Downloading from: $DownloadUrl"

    # Create directories
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

    # Download
    $TempFile = Join-Path $env:TEMP "jot-server.zip"
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempFile

    # Extract
    Expand-Archive -Path $TempFile -DestinationPath $InstallDir -Force

    # Cleanup
    Remove-Item $TempFile -Force

    Write-Info "Installed to: $InstallDir"
}

function Add-ToPath {
    $CurrentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($CurrentPath -notlike "*$InstallDir*") {
        Write-Info "Adding $InstallDir to PATH..."
        $NewPath = "$CurrentPath;$InstallDir"
        [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
        $env:Path = "$env:Path;$InstallDir"
        $script:NeedRestart = $true
    }
}

function Setup-JwtSecret {
    # Check if already set
    $existingSecret = [Environment]::GetEnvironmentVariable("JWT_SECRET", "User")
    if ($existingSecret) {
        Write-Info "JWT_SECRET is already configured"
        return
    }

    Write-Host ""
    Write-Host "  JWT_SECRET enables persistent sessions across server restarts."
    Write-Host "  Without it, all clients will need to re-authenticate when the server restarts."
    Write-Host ""

    $response = Read-Host "  Would you like to generate and save a JWT_SECRET? [Y/n]"

    if ($response -ne 'n' -and $response -ne 'N') {
        # Generate a secure random secret
        $bytes = New-Object byte[] 32
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $rng.GetBytes($bytes)
        $secret = [Convert]::ToBase64String($bytes)

        # Set as persistent user environment variable
        [Environment]::SetEnvironmentVariable("JWT_SECRET", $secret, "User")
        $env:JWT_SECRET = $secret

        Write-Info "JWT_SECRET saved to user environment variables"
        $script:NeedRestart = $true
    }
}

function Main {
    $script:NeedRestart = $false

    Write-Host ""
    Write-Host "  +-------------------------------------+" -ForegroundColor Cyan
    Write-Host "  |      Jot Server Installer           |" -ForegroundColor Cyan
    Write-Host "  +-------------------------------------+" -ForegroundColor Cyan
    Write-Host ""

    $Version = Get-LatestVersion
    Install-JotServer -Version $Version
    Add-ToPath
    Setup-JwtSecret

    Write-Host ""
    Write-Info "Installation complete!"
    Write-Host ""
    Write-Host "  To start the server:"
    Write-Host "    jot-server start"
    Write-Host ""
    Write-Host "  Data will be stored in: $DataDir"

    if ($script:NeedRestart) {
        Write-Host ""
        Write-Warn "Restart your terminal for changes to take effect."
    }
    Write-Host ""
}

Main
