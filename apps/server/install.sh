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
    info "Fetching latest version..."
    VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/')
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
    curl -fsSL "$DOWNLOAD_URL" | tar -xz -C "$TEMP_DIR"

    # Install files
    cp "$TEMP_DIR/jot-server" "$INSTALL_DIR/"
    chmod +x "$INSTALL_DIR/jot-server"

    # Copy native modules if present
    if [ -d "$TEMP_DIR/native" ]; then
        cp -r "$TEMP_DIR/native" "$INSTALL_DIR/"
    fi

    # Create wrapper script in bin directory
    cat > "$BIN_DIR/jot-server" << EOF
#!/bin/bash
export NODE_PATH="$INSTALL_DIR/native"
exec "$INSTALL_DIR/jot-server" "\$@"
EOF
    chmod +x "$BIN_DIR/jot-server"

    # Cleanup
    rm -rf "$TEMP_DIR"

    info "Installed to: $INSTALL_DIR"
}

# Add to PATH if needed
setup_path() {
    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        warn "$BIN_DIR is not in your PATH"

        SHELL_NAME=$(basename "$SHELL")
        case "$SHELL_NAME" in
            zsh) RC_FILE="$HOME/.zshrc" ;;
            bash) RC_FILE="$HOME/.bashrc" ;;
            *) RC_FILE="" ;;
        esac

        if [ -n "$RC_FILE" ]; then
            echo "" >> "$RC_FILE"
            echo "# Jot Server" >> "$RC_FILE"
            echo "export PATH=\"\$PATH:$BIN_DIR\"" >> "$RC_FILE"
            info "Added $BIN_DIR to PATH in $RC_FILE"
            info "Run 'source $RC_FILE' or restart your terminal"
        else
            warn "Add this to your shell profile:"
            echo "    export PATH=\"\$PATH:$BIN_DIR\""
        fi
    fi
}

# Main
main() {
    echo ""
    echo "  ╭─────────────────────────────────────╮"
    echo "  │      Jot Server Installer           │"
    echo "  ╰─────────────────────────────────────╯"
    echo ""

    detect_platform
    get_latest_version
    install
    setup_path

    echo ""
    info "Installation complete!"
    echo ""
    echo "  To start the server:"
    echo "    jot-server start"
    echo ""
    echo "  Data will be stored in: $DATA_DIR"
    echo ""
    echo "  For persistent sessions, set JWT_SECRET:"
    echo "    export JWT_SECRET=\$(openssl rand -base64 32)"
    echo ""
}

main
