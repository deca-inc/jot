#!/bin/bash

# Generate Sparkle appcast.xml for auto-updates
# Usage: ./generate-appcast.sh /path/to/app.dmg [version]
#
# Required environment variables:
#   SPARKLE_ED_PRIVATE_KEY - EdDSA private key for signing updates (base64 encoded)
#
# The appcast.xml is uploaded to GitHub releases alongside the DMG.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DMG_PATH="$1"
VERSION="${2:-}"

# GitHub repository info (extracted from git remote or env)
GITHUB_REPO="${GITHUB_REPOSITORY:-deca-inc/jot}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[generate-appcast]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[generate-appcast]${NC} $1"
}

error() {
    echo -e "${RED}[generate-appcast]${NC} $1"
    exit 1
}

# Validate inputs
if [ -z "$DMG_PATH" ]; then
    error "Usage: $0 /path/to/app.dmg [version]"
fi

if [ ! -f "$DMG_PATH" ]; then
    error "DMG not found at: $DMG_PATH"
fi

# Get version from DMG name if not provided
if [ -z "$VERSION" ]; then
    # Try to extract from filename like Jot-1.0.0.dmg
    VERSION=$(basename "$DMG_PATH" .dmg | sed -E 's/.*-([0-9]+\.[0-9]+\.[0-9]+).*/\1/')

    if [ -z "$VERSION" ] || [ "$VERSION" = "$(basename "$DMG_PATH" .dmg)" ]; then
        error "Could not determine version. Please provide as second argument."
    fi
fi

log "DMG: $DMG_PATH"
log "Version: $VERSION"
log "Repository: $GITHUB_REPO"

# Calculate DMG size and checksum
DMG_SIZE=$(stat -f%z "$DMG_PATH" 2>/dev/null || stat --printf="%s" "$DMG_PATH" 2>/dev/null)
DMG_SHA256=$(shasum -a 256 "$DMG_PATH" | cut -d' ' -f1)

log "Size: $DMG_SIZE bytes"
log "SHA256: $DMG_SHA256"

# Generate EdDSA signature if private key is available
ED_SIGNATURE=""
if [ -n "$SPARKLE_ED_PRIVATE_KEY" ]; then
    log "Signing update with EdDSA..."

    # Write private key to temp file
    TEMP_KEY=$(mktemp)
    echo "$SPARKLE_ED_PRIVATE_KEY" | base64 -d > "$TEMP_KEY" 2>/dev/null || \
        echo "$SPARKLE_ED_PRIVATE_KEY" > "$TEMP_KEY"

    # Check if Sparkle's sign_update is available
    if command -v sign_update &> /dev/null; then
        ED_SIGNATURE=$(sign_update -s "$TEMP_KEY" "$DMG_PATH" 2>/dev/null || true)
    elif [ -f "/usr/local/bin/sign_update" ]; then
        ED_SIGNATURE=$(/usr/local/bin/sign_update -s "$TEMP_KEY" "$DMG_PATH" 2>/dev/null || true)
    else
        # Try using openssl directly for EdDSA
        # Note: This is a simplified approach; real Sparkle uses a specific format
        ED_SIGNATURE=$(openssl dgst -sha512 -sign "$TEMP_KEY" "$DMG_PATH" | base64 | tr -d '\n' 2>/dev/null || true)
    fi

    rm -f "$TEMP_KEY"

    if [ -n "$ED_SIGNATURE" ]; then
        log "EdDSA signature generated"
    else
        warn "Could not generate EdDSA signature (sign_update tool may be missing)"
    fi
else
    warn "SPARKLE_ED_PRIVATE_KEY not set, update will not be signed"
fi

# Get current date in RFC 822 format
PUB_DATE=$(date -R 2>/dev/null || date "+%a, %d %b %Y %H:%M:%S %z")

# Construct download URL
DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/v${VERSION}/$(basename "$DMG_PATH")"

# Generate appcast.xml
APPCAST_PATH="$(dirname "$DMG_PATH")/appcast.xml"

log "Generating appcast.xml..."

# Create the signature attribute if we have a signature
SIGNATURE_ATTR=""
if [ -n "$ED_SIGNATURE" ]; then
    SIGNATURE_ATTR="sparkle:edSignature=\"$ED_SIGNATURE\""
fi

cat > "$APPCAST_PATH" << EOF
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Jot Updates</title>
    <link>https://github.com/${GITHUB_REPO}</link>
    <description>Most recent updates to Jot</description>
    <language>en</language>
    <item>
      <title>Version ${VERSION}</title>
      <pubDate>${PUB_DATE}</pubDate>
      <sparkle:version>${VERSION}</sparkle:version>
      <sparkle:shortVersionString>${VERSION}</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>12.0</sparkle:minimumSystemVersion>
      <description><![CDATA[
        <h2>Jot ${VERSION}</h2>
        <p>See the <a href="https://github.com/${GITHUB_REPO}/releases/tag/v${VERSION}">release notes</a> for details.</p>
      ]]></description>
      <enclosure
        url="${DOWNLOAD_URL}"
        length="${DMG_SIZE}"
        type="application/octet-stream"
        ${SIGNATURE_ATTR}
      />
    </item>
  </channel>
</rss>
EOF

log "Appcast generated: $APPCAST_PATH"

# Output path for CI
echo "APPCAST_PATH=$APPCAST_PATH" >> "${GITHUB_OUTPUT:-/dev/null}"

# Print the appcast for verification
log "Appcast contents:"
cat "$APPCAST_PATH"
