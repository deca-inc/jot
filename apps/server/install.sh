#!/bin/bash
# Jot Server Installer for macOS and Linux
# Usage: curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/journal/main/apps/server/install.sh | bash

set -e

# Configuration
REPO="deca-inc/jot"
INSTALL_DIR="${JOT_INSTALL_DIR:-$HOME/.jot-server}"
BIN_DIR="${JOT_BIN_DIR:-$HOME/.local/bin}"
DATA_DIR="${JOT_DATA_DIR:-$HOME/.jot-server/data}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Detect OS and architecture
detect_platform() {
    OS="$(uname -s)"
    ARCH="$(uname -m)"

    case "$OS" in
        Darwin) OS="macos" ;;
        Linux) OS="linux" ;;
        *) error "Unsupported OS: $OS" ;;
    esac

    case "$ARCH" in
        x86_64|amd64) ARCH="x64" ;;
        arm64|aarch64) ARCH="arm64" ;;
        *) error "Unsupported architecture: $ARCH" ;;
    esac

    PLATFORM="${OS}-${ARCH}"
    info "Detected platform: $PLATFORM"
}

# Get latest release version
get_latest_version() {
    info "Fetching latest server version..."
    # Read version from raw.githubusercontent.com (no API rate limits)
    VERSION=$(curl -sL "https://raw.githubusercontent.com/$REPO/main/apps/server/VERSION" 2>/dev/null | tr -d '[:space:]')
    if [ -z "$VERSION" ]; then
        warn "Could not fetch VERSION file, trying GitHub API..."
        VERSION=$(curl -sL -H "User-Agent: jot-server-installer" "https://api.github.com/repos/$REPO/releases?per_page=15" | grep '"tag_name"' | grep -v 'desktop-v' | head -1 | sed -E 's/.*"v([^"]+)".*/\1/')
    fi
    if [ -z "$VERSION" ]; then
        error "Could not determine latest version"
    fi
    info "Latest version: v$VERSION"
}

# Download and install
install() {
    DOWNLOAD_URL="https://github.com/$REPO/releases/download/v$VERSION/jot-server-$PLATFORM.tar.gz"

    info "Downloading from: $DOWNLOAD_URL"

    # Create directories
    mkdir -p "$INSTALL_DIR" "$BIN_DIR" "$DATA_DIR"

    # Download and extract
    TEMP_DIR=$(mktemp -d)
    curl -fSL "$DOWNLOAD_URL" -o "$TEMP_DIR/download.tar.gz" || error "Download failed. Check that the release exists at: $DOWNLOAD_URL"
    tar -xzf "$TEMP_DIR/download.tar.gz" -C "$TEMP_DIR"

    # Install executable
    cp "$TEMP_DIR/jot-server" "$INSTALL_DIR/"
    chmod +x "$INSTALL_DIR/jot-server"

    # Symlink to bin directory
    ln -sf "$INSTALL_DIR/jot-server" "$BIN_DIR/jot-server"

    # Cleanup
    rm -rf "$TEMP_DIR"

    info "Installed to: $INSTALL_DIR"
}

# Detect shell config file
get_shell_rc() {
    SHELL_NAME=$(basename "$SHELL")
    case "$SHELL_NAME" in
        zsh) echo "$HOME/.zshrc" ;;
        bash) echo "$HOME/.bashrc" ;;
        *) echo "" ;;
    esac
}

# Add to PATH if needed
setup_path() {
    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        warn "$BIN_DIR is not in your PATH"

        RC_FILE=$(get_shell_rc)

        if [ -n "$RC_FILE" ]; then
            if ! grep -q "# Jot Server" "$RC_FILE" 2>/dev/null; then
                echo "" >> "$RC_FILE"
                echo "# Jot Server" >> "$RC_FILE"
            fi
            if ! grep -q "$BIN_DIR" "$RC_FILE" 2>/dev/null; then
                echo "export PATH=\"\$PATH:$BIN_DIR\"" >> "$RC_FILE"
                info "Added $BIN_DIR to PATH in $RC_FILE"
            fi
            NEED_SOURCE=true
        else
            warn "Add this to your shell profile:"
            echo "    export PATH=\"\$PATH:$BIN_DIR\""
        fi
    fi
}

# Setup JWT_SECRET for persistent sessions
setup_jwt_secret() {
    RC_FILE=$(get_shell_rc)

    # Check if already configured
    if [ -n "$JWT_SECRET" ]; then
        info "JWT_SECRET is already set"
        return
    fi

    if [ -n "$RC_FILE" ] && grep -q "JWT_SECRET" "$RC_FILE" 2>/dev/null; then
        info "JWT_SECRET is already configured in $RC_FILE"
        return
    fi

    echo ""
    echo "  JWT_SECRET enables persistent sessions across server restarts."
    echo "  Without it, all clients will need to re-authenticate when the server restarts."
    echo ""

    # Check if running interactively
    if [ -t 0 ]; then
        read -p "  Would you like to generate and save a JWT_SECRET? [Y/n] " -n 1 -r
        echo ""

        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            if [ -z "$RC_FILE" ]; then
                warn "Could not detect shell config file"
                echo "  Add this to your shell profile manually:"
                echo "    export JWT_SECRET=$(openssl rand -base64 32)"
                return
            fi

            # Generate secret
            SECRET=$(openssl rand -base64 32)

            # Add to shell config
            if ! grep -q "# Jot Server" "$RC_FILE" 2>/dev/null; then
                echo "" >> "$RC_FILE"
                echo "# Jot Server" >> "$RC_FILE"
            fi
            echo "export JWT_SECRET=\"$SECRET\"" >> "$RC_FILE"

            info "JWT_SECRET saved to $RC_FILE"
            NEED_SOURCE=true
        fi
    else
        info "Run interactively to set up JWT_SECRET, or add manually:"
        echo "    export JWT_SECRET=\$(openssl rand -base64 32)"
    fi
}

# Main
main() {
    NEED_SOURCE=false

    echo ""
    echo "  ╭─────────────────────────────────────╮"
    echo "  │      Jot Server Installer           │"
    echo "  ╰─────────────────────────────────────╯"
    echo ""

    detect_platform
    get_latest_version
    install
    setup_path
    setup_jwt_secret

    echo ""
    info "Installation complete!"
    echo ""
    echo "  To start the server:"
    echo "    jot-server start"
    echo ""
    echo "  Data will be stored in: $DATA_DIR"

    if [ "$NEED_SOURCE" = true ]; then
        RC_FILE=$(get_shell_rc)
        echo ""
        warn "Run 'source $RC_FILE' or restart your terminal to apply changes"
    fi
    echo ""
}

main
