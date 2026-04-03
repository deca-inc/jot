#!/bin/bash

# Create DMG installer for macOS app
# Usage: ./create-dmg.sh /path/to/App.app [output.dmg]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_PATH="$1"
DMG_PATH="${2:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[create-dmg]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[create-dmg]${NC} $1"
}

error() {
    echo -e "${RED}[create-dmg]${NC} $1"
    exit 1
}

# Validate inputs
if [ -z "$APP_PATH" ]; then
    error "Usage: $0 /path/to/App.app [output.dmg]"
fi

if [ ! -d "$APP_PATH" ]; then
    error "App not found at: $APP_PATH"
fi

# Extract app name and version
APP_NAME=$(basename "$APP_PATH" .app)
APP_BUNDLE="$APP_PATH"

# Get version from Info.plist
VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || echo "1.0.0")
BUILD=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$APP_BUNDLE/Contents/Info.plist" 2>/dev/null || echo "1")

log "App: $APP_NAME"
log "Version: $VERSION (build $BUILD)"

# Set output path if not provided
if [ -z "$DMG_PATH" ]; then
    DMG_PATH="$(dirname "$APP_PATH")/${APP_NAME}-${VERSION}.dmg"
fi

# Create temporary directory for DMG contents
TEMP_DIR=$(mktemp -d)
DMG_CONTENTS="$TEMP_DIR/dmg"
mkdir -p "$DMG_CONTENTS"

log "Preparing DMG contents..."

# Copy the app
cp -R "$APP_PATH" "$DMG_CONTENTS/"

# Create Applications symlink for drag-and-drop install
ln -s /Applications "$DMG_CONTENTS/Applications"

# Calculate size needed (app size + 50MB buffer)
APP_SIZE=$(du -sm "$APP_PATH" | cut -f1)
DMG_SIZE=$((APP_SIZE + 50))

log "Creating DMG ($DMG_SIZE MB)..."

# Remove existing DMG if present
rm -f "$DMG_PATH"

# Check if create-dmg tool is available (provides nicer DMG with background)
if command -v create-dmg &> /dev/null; then
    log "Using create-dmg tool for fancy DMG..."
    create-dmg \
        --volname "$APP_NAME" \
        --volicon "$APP_BUNDLE/Contents/Resources/AppIcon.icns" \
        --window-pos 200 120 \
        --window-size 600 400 \
        --icon-size 100 \
        --icon "$APP_NAME.app" 150 200 \
        --hide-extension "$APP_NAME.app" \
        --app-drop-link 450 200 \
        --no-internet-enable \
        "$DMG_PATH" \
        "$DMG_CONTENTS" \
        || {
            warn "create-dmg failed, falling back to hdiutil..."
            # Fall through to hdiutil
        }
fi

# If DMG wasn't created yet, use hdiutil
if [ ! -f "$DMG_PATH" ]; then
    log "Creating DMG with hdiutil..."

    # Create a temporary DMG
    TEMP_DMG="$TEMP_DIR/temp.dmg"

    hdiutil create \
        -srcfolder "$DMG_CONTENTS" \
        -volname "$APP_NAME" \
        -fs HFS+ \
        -fsargs "-c c=64,a=16,e=16" \
        -format UDRW \
        -size "${DMG_SIZE}m" \
        "$TEMP_DMG"

    # Mount it
    MOUNT_POINT=$(hdiutil attach -readwrite -noverify "$TEMP_DMG" | grep -E '^/dev/' | tail -1 | awk '{print $3}')

    if [ -n "$MOUNT_POINT" ]; then
        # Set window properties (optional, may not work without LSUIElement)
        echo '
           tell application "Finder"
             tell disk "'"$APP_NAME"'"
                   open
                   set current view of container window to icon view
                   set toolbar visible of container window to false
                   set statusbar visible of container window to false
                   set bounds of container window to {400, 100, 1000, 500}
                   set theViewOptions to icon view options of container window
                   set arrangement of theViewOptions to not arranged
                   set icon size of theViewOptions to 100
                   close
             end tell
           end tell
        ' | osascript 2>/dev/null || true

        # Unmount
        hdiutil detach "$MOUNT_POINT" -force
    fi

    # Convert to compressed read-only DMG
    hdiutil convert "$TEMP_DMG" -format UDZO -imagekey zlib-level=9 -o "$DMG_PATH"
fi

# Clean up
rm -rf "$TEMP_DIR"

# Verify DMG
log "Verifying DMG..."
hdiutil verify "$DMG_PATH"

# Get final size
DMG_SIZE_FINAL=$(du -h "$DMG_PATH" | cut -f1)

log "DMG created successfully!"
log "Output: $DMG_PATH"
log "Size: $DMG_SIZE_FINAL"

# Output path for CI
echo "DMG_PATH=$DMG_PATH" >> "${GITHUB_OUTPUT:-/dev/null}"
