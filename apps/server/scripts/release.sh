#!/bin/bash
# Release script for jot-server
#
# Usage:
#   ./scripts/release.sh 1.0.0        # Create and push tag v1.0.0
#   ./scripts/release.sh 1.0.0 --dry  # Dry run (show what would happen)
#   ./scripts/release.sh --delete 1.0.0  # Delete tag v1.0.0

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

show_help() {
    echo "Jot Server Release Script"
    echo ""
    echo "Usage:"
    echo "  $0 <version>              Create and push tag (e.g., 1.0.0)"
    echo "  $0 <version> --dry        Dry run - show what would happen"
    echo "  $0 --delete <version>     Delete a tag locally and remotely"
    echo "  $0 --list                 List existing tags"
    echo "  $0 --help                 Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 1.0.0                  # Creates and pushes v1.0.0"
    echo "  $0 1.0.1 --dry            # Shows what would happen for v1.0.1"
    echo "  $0 --delete 1.0.0         # Deletes v1.0.0 locally and from origin"
}

list_tags() {
    log_info "Existing tags:"
    git tag -l "v*" --sort=-version:refname | head -10
}

delete_tag() {
    local version=$1
    local tag="v${version}"

    log_warning "Deleting tag: $tag"

    # Delete local tag
    if git tag -l | grep -q "^${tag}$"; then
        git tag -d "$tag"
        log_success "Deleted local tag: $tag"
    else
        log_warning "Local tag not found: $tag"
    fi

    # Delete remote tag
    if git ls-remote --tags origin | grep -q "refs/tags/${tag}$"; then
        git push origin --delete "$tag"
        log_success "Deleted remote tag: $tag"
    else
        log_warning "Remote tag not found: $tag"
    fi
}

create_release() {
    local version=$1
    local dry_run=$2
    local tag="v${version}"

    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "  Jot Server Release: $tag"
    echo "═══════════════════════════════════════════════════"
    echo ""

    # Check for uncommitted changes
    if ! git diff-index --quiet HEAD --; then
        log_error "You have uncommitted changes. Please commit or stash them first."
        exit 1
    fi

    # Check if on main branch
    local current_branch=$(git branch --show-current)
    if [ "$current_branch" != "main" ]; then
        log_warning "Not on main branch (current: $current_branch)"
        read -p "Continue anyway? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    # Check if tag already exists
    if git tag -l | grep -q "^${tag}$"; then
        log_warning "Tag $tag already exists locally"
        if [ "$dry_run" != "true" ]; then
            read -p "Delete and recreate? [y/N] " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                delete_tag "$version"
            else
                exit 1
            fi
        fi
    fi

    # Show what we're about to do
    log_info "Current commit:"
    git log -1 --oneline
    echo ""

    if [ "$dry_run" = "true" ]; then
        log_warning "DRY RUN - No changes will be made"
        echo ""
        echo "Would execute:"
        echo "  git tag $tag"
        echo "  git push origin $tag"
        echo ""
        echo "This will trigger the GitHub Actions release workflow which builds:"
        echo "  - macOS (Apple Silicon & Intel)"
        echo "  - Linux (x64 & ARM64)"
        echo "  - Windows (x64)"
        return
    fi

    # Create and push tag
    log_info "Creating tag: $tag"
    git tag "$tag"
    log_success "Created tag: $tag"

    log_info "Pushing tag to origin..."
    git push origin "$tag"
    log_success "Pushed tag: $tag"

    echo ""
    log_success "Release initiated!"
    echo ""
    echo "GitHub Actions will now build releases for all platforms."
    echo "View progress at:"
    echo "  https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/actions"
    echo ""
    echo "Once complete, releases will be at:"
    echo "  https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/releases/tag/$tag"
}

# Parse arguments
case "$1" in
    --help|-h)
        show_help
        exit 0
        ;;
    --list|-l)
        list_tags
        exit 0
        ;;
    --delete|-d)
        if [ -z "$2" ]; then
            log_error "Version required for delete"
            exit 1
        fi
        delete_tag "$2"
        exit 0
        ;;
    "")
        log_error "Version required"
        show_help
        exit 1
        ;;
    *)
        version=$1
        dry_run=false
        if [ "$2" = "--dry" ]; then
            dry_run=true
        fi
        create_release "$version" "$dry_run"
        ;;
esac
