#!/bin/bash

# Sign and notarize macOS app for distribution
# Usage: ./sign-and-notarize.sh /path/to/App.app
#
# Required environment variables:
#   APPLE_DEVELOPER_ID_APPLICATION - Code signing identity (e.g., "Developer ID Application: Company Name (TEAM_ID)")
#   APPLE_ID                       - Apple ID email for notarization
#   APPLE_APP_PASSWORD             - App-specific password for notarization
#   APPLE_TEAM_ID                  - Apple Developer Team ID

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_PATH="$1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[sign-notarize]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[sign-notarize]${NC} $1"
}

error() {
    echo -e "${RED}[sign-notarize]${NC} $1"
    exit 1
}

# Validate inputs
if [ -z "$APP_PATH" ]; then
    error "Usage: $0 /path/to/App.app"
fi

if [ ! -d "$APP_PATH" ]; then
    error "App not found at: $APP_PATH"
fi

# Check required environment variables
if [ -z "$APPLE_DEVELOPER_ID_APPLICATION" ]; then
    error "APPLE_DEVELOPER_ID_APPLICATION not set"
fi

if [ -z "$APPLE_ID" ]; then
    error "APPLE_ID not set"
fi

if [ -z "$APPLE_APP_PASSWORD" ]; then
    error "APPLE_APP_PASSWORD not set"
fi

if [ -z "$APPLE_TEAM_ID" ]; then
    error "APPLE_TEAM_ID not set"
fi

# Get the entitlements file
ENTITLEMENTS="$SCRIPT_DIR/Entitlements.plist"
if [ ! -f "$ENTITLEMENTS" ]; then
    warn "Entitlements.plist not found, creating default..."
    cat > "$ENTITLEMENTS" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
</dict>
</plist>
EOF
fi

log "Code signing app: $APP_PATH"
log "Using identity: $APPLE_DEVELOPER_ID_APPLICATION"

# Sign all frameworks and dylibs first
log "Signing frameworks and libraries..."
find "$APP_PATH" -type f \( -name "*.dylib" -o -name "*.framework" \) | while read -r lib; do
    codesign --force --options runtime --sign "$APPLE_DEVELOPER_ID_APPLICATION" "$lib" 2>/dev/null || true
done

# Sign the main app bundle
log "Signing main app bundle..."
codesign \
    --force \
    --options runtime \
    --entitlements "$ENTITLEMENTS" \
    --sign "$APPLE_DEVELOPER_ID_APPLICATION" \
    --timestamp \
    "$APP_PATH"

# Verify signature
log "Verifying signature..."
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

# Create a ZIP for notarization
APP_NAME=$(basename "$APP_PATH" .app)
ZIP_PATH="$(dirname "$APP_PATH")/${APP_NAME}.zip"

log "Creating ZIP for notarization: $ZIP_PATH"
ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"

# Submit for notarization
log "Submitting for notarization..."
NOTARIZATION_OUTPUT=$(xcrun notarytool submit \
    "$ZIP_PATH" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_APP_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait \
    --output-format json)

echo "$NOTARIZATION_OUTPUT"

# Check if notarization was successful
STATUS=$(echo "$NOTARIZATION_OUTPUT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('status', 'unknown'))" 2>/dev/null || echo "unknown")

if [ "$STATUS" != "Accepted" ]; then
    # Get the submission ID for log retrieval
    SUBMISSION_ID=$(echo "$NOTARIZATION_OUTPUT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('id', ''))" 2>/dev/null || echo "")

    if [ -n "$SUBMISSION_ID" ]; then
        log "Fetching notarization log..."
        xcrun notarytool log "$SUBMISSION_ID" \
            --apple-id "$APPLE_ID" \
            --password "$APPLE_APP_PASSWORD" \
            --team-id "$APPLE_TEAM_ID" || true
    fi

    error "Notarization failed with status: $STATUS"
fi

log "Notarization successful!"

# Staple the ticket to the app
log "Stapling notarization ticket..."
xcrun stapler staple "$APP_PATH"

# Clean up the ZIP
rm -f "$ZIP_PATH"

log "App signed and notarized successfully!"
log "App location: $APP_PATH"
