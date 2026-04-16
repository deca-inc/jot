#!/bin/bash
set -e

# Deploy a new desktop release.
#
# Usage:
#   ./scripts/deploy-desktop.sh <version>
#   ./scripts/deploy-desktop.sh 0.2.0
#
# This script:
#   1. Updates the version in tauri.conf.json and desktop package.json
#   2. Commits the version bump
#   3. Tags with desktop-v<version>
#   4. Pushes the commit and tag to trigger the release workflow

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

VERSION="$1"

if [ -z "$VERSION" ]; then
  echo -e "${RED}Usage: $0 <version>${NC}"
  echo "  Example: $0 0.2.0"
  exit 1
fi

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo -e "${RED}Error: Version must be in semver format (e.g. 0.2.0)${NC}"
  exit 1
fi

TAG="desktop-v${VERSION}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAURI_CONF="$REPO_ROOT/apps/desktop/src-tauri/tauri.conf.json"
DESKTOP_PKG="$REPO_ROOT/apps/desktop/package.json"

# Check for clean working tree (allow untracked files)
if ! git diff --quiet HEAD 2>/dev/null; then
  echo -e "${RED}Error: Working tree has uncommitted changes. Commit or stash first.${NC}"
  exit 1
fi

# Check tag doesn't already exist
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo -e "${RED}Error: Tag $TAG already exists${NC}"
  exit 1
fi

echo -e "${GREEN}Deploying desktop v${VERSION}${NC}"

# Update versions
echo -e "${YELLOW}Updating version to ${VERSION}...${NC}"
cd "$REPO_ROOT"

# Update tauri.conf.json
sed -i '' "s/\"version\": \"[0-9]*\.[0-9]*\.[0-9]*\"/\"version\": \"${VERSION}\"/" "$TAURI_CONF"

# Update desktop package.json
sed -i '' "s/\"version\": \"[0-9]*\.[0-9]*\.[0-9]*\"/\"version\": \"${VERSION}\"/" "$DESKTOP_PKG"

# Commit version bump
echo -e "${YELLOW}Committing version bump...${NC}"
git add "$TAURI_CONF" "$DESKTOP_PKG"
git commit -m "Bump desktop version to ${VERSION}"

# Create and push tag
echo -e "${YELLOW}Tagging ${TAG}...${NC}"
git tag "$TAG"

echo -e "${YELLOW}Pushing to origin...${NC}"
git push origin HEAD
git push origin "$TAG"

echo ""
echo -e "${GREEN}Done! Release workflow triggered.${NC}"
echo -e "Track the build: ${YELLOW}gh run list --workflow=release-desktop.yml${NC}"
