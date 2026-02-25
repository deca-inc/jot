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
        Write-Info "Added to PATH. Restart your terminal for changes to take effect."
    }
}

function Main {
    Write-Host ""
    Write-Host "  +-------------------------------------+" -ForegroundColor Cyan
    Write-Host "  |      Jot Server Installer           |" -ForegroundColor Cyan
    Write-Host "  +-------------------------------------+" -ForegroundColor Cyan
    Write-Host ""

    $Version = Get-LatestVersion
    Install-JotServer -Version $Version
    Add-ToPath

    Write-Host ""
    Write-Info "Installation complete!"
    Write-Host ""
    Write-Host "  To start the server:"
    Write-Host "    jot-server start"
    Write-Host ""
    Write-Host "  Data will be stored in: $DataDir"
    Write-Host ""
    Write-Host "  For persistent sessions, set JWT_SECRET:"
    Write-Host "    `$env:JWT_SECRET = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))"
    Write-Host ""
}

Main
