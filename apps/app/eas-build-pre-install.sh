#!/bin/bash
# EAS Build pre-install hook
# This script runs before dependencies are installed

set -e

# Install cmake on macOS (iOS builds)
if [[ "$EAS_BUILD_PLATFORM" == "ios" ]]; then
  echo "Installing cmake for iOS build..."
  brew install cmake
fi
