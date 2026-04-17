#!/bin/bash
set -e

# Deploy a new server release.
#
# Usage:
#   ./scripts/deploy-server.sh <version>
#   ./scripts/deploy-server.sh 1.0.1
#
# This script:
#   1. Updates the hardcoded VERSION in apps/server/src/utils/updater.ts
#   2. Updates version in apps/server/package.json
#   3. Commits the version bump
#   4. Tags with v<version>
#   5. Pushes the commit and tag to trigger the release workflow

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

VERSION="$1"

if [ -z "$VERSION" ]; then
  echo -e "${RED}Usage: $0 <version>${NC}"
  echo "  Example: $0 1.0.1"
  exit 1
fi

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo -e "${RED}Error: Version must be in semver format (e.g. 1.0.1)${NC}"
  exit 1
fi

TAG="v${VERSION}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UPDATER_FILE="$REPO_ROOT/apps/server/src/utils/updater.ts"
SERVER_PKG="$REPO_ROOT/apps/server/package.json"

# Check for clean working tree
if ! git diff --quiet HEAD 2>/dev/null; then
  echo -e "${RED}Error: Working tree has uncommitted changes. Commit or stash first.${NC}"
  exit 1
fi

# Check tag doesn't already exist
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo -e "${RED}Error: Tag $TAG already exists${NC}"
  exit 1
fi

echo -e "${GREEN}Deploying server v${VERSION}${NC}"

# Update versions
echo -e "${YELLOW}Updating version to ${VERSION}...${NC}"
cd "$REPO_ROOT"

# Update hardcoded VERSION in updater.ts
sed -i '' "s/const VERSION = \"[0-9]*\.[0-9]*\.[0-9]*\"/const VERSION = \"${VERSION}\"/" "$UPDATER_FILE"

# Update server package.json
sed -i '' "s/\"version\": \"[0-9]*\.[0-9]*\.[0-9]*\"/\"version\": \"${VERSION}\"/" "$SERVER_PKG"

# Commit version bump
echo -e "${YELLOW}Committing version bump...${NC}"
git add "$UPDATER_FILE" "$SERVER_PKG"
git commit -m "Bump server version to ${VERSION}"

# Create and push tag
echo -e "${YELLOW}Tagging ${TAG}...${NC}"
git tag "$TAG"

echo -e "${YELLOW}Pushing to origin...${NC}"
git push origin HEAD
git push origin "$TAG"

echo ""
echo -e "${GREEN}Done! Release workflow triggered.${NC}"
echo -e "Track the build: ${YELLOW}gh run list --workflow=release.yml${NC}"
echo ""
echo -e "After the release is published, users can update with:"
echo -e "  ${YELLOW}jot-server update${NC}"
