#!/bin/bash

# Build macOS app using xcodebuild
# Usage: ./build-macos.sh [debug|release]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
IOS_DIR="$APP_DIR/ios"
BUILD_DIR="$IOS_DIR/build"

BUILD_TYPE="${1:-release}"

# Auto-detect workspace (production builds create "Jot", dev builds create "JotDev")
WORKSPACE=$(find "$IOS_DIR" -maxdepth 1 -name "*.xcworkspace" -not -name "project.xcworkspace" | head -1)
if [ -z "$WORKSPACE" ]; then
    error "No .xcworkspace found in $IOS_DIR. Run 'pod install' first."
fi
SCHEME=$(basename "$WORKSPACE" .xcworkspace)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[build-macos]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[build-macos]${NC} $1"
}

error() {
    echo -e "${RED}[build-macos]${NC} $1"
    exit 1
}

# Check if ios directory exists
if [ ! -d "$IOS_DIR" ]; then
    error "ios directory not found. Run 'npx expo prebuild --platform macos' first."
fi

log "Using workspace: $WORKSPACE (scheme: $SCHEME)"

# Set configuration based on build type
if [ "$BUILD_TYPE" = "debug" ]; then
    CONFIGURATION="Debug"
    log "Building DEBUG configuration..."
else
    CONFIGURATION="Release"
    log "Building RELEASE configuration..."
fi

# Clean build directory
log "Cleaning build directory..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Build the app
log "Building $SCHEME with configuration $CONFIGURATION..."
xcodebuild \
    -workspace "$WORKSPACE" \
    -scheme "$SCHEME" \
    -configuration "$CONFIGURATION" \
    -derivedDataPath "$BUILD_DIR/DerivedData" \
    -archivePath "$BUILD_DIR/$SCHEME.xcarchive" \
    -destination "generic/platform=macOS,variant=Designed for [iPad,iPhone]" \
    archive

# Check if archive was created
if [ ! -d "$BUILD_DIR/$SCHEME.xcarchive" ]; then
    error "Archive failed - no xcarchive created"
fi

log "Archive created at $BUILD_DIR/$SCHEME.xcarchive"

# Export the app
log "Exporting app..."
EXPORT_OPTIONS="$SCRIPT_DIR/ExportOptions.plist"

if [ ! -f "$EXPORT_OPTIONS" ]; then
    warn "ExportOptions.plist not found, using default export"
    # Create a basic ExportOptions.plist
    cat > "$BUILD_DIR/ExportOptions.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>developer-id</string>
    <key>destination</key>
    <string>export</string>
</dict>
</plist>
EOF
    EXPORT_OPTIONS="$BUILD_DIR/ExportOptions.plist"
fi

xcodebuild \
    -exportArchive \
    -archivePath "$BUILD_DIR/$SCHEME.xcarchive" \
    -exportPath "$BUILD_DIR/Export" \
    -exportOptionsPlist "$EXPORT_OPTIONS"

# Check if app was exported
APP_PATH="$BUILD_DIR/Export/$SCHEME.app"
if [ ! -d "$APP_PATH" ]; then
    # Try looking in the archive directly for debug builds
    APP_PATH="$BUILD_DIR/$SCHEME.xcarchive/Products/Applications/$SCHEME.app"
fi

if [ ! -d "$APP_PATH" ]; then
    error "Export failed - no .app bundle found"
fi

log "Build complete!"
log "App location: $APP_PATH"

# Output path for CI
echo "APP_PATH=$APP_PATH" >> "${GITHUB_OUTPUT:-/dev/null}"
