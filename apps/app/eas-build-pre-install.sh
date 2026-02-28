#!/bin/bash
# EAS Build pre-install hook
# This script runs before dependencies are installed

set -e

# Install cmake and pkg-config on macOS (iOS builds)
# Required for @dr.pogodin/react-native-static-server which uses Lighttpd
if [[ "$EAS_BUILD_PLATFORM" == "ios" ]]; then
  echo "Installing cmake and pkg-config for iOS build..."
  brew install cmake pkg-config

  # Create symlinks so Xcode can find these tools
  # Xcode's build scripts don't have /opt/homebrew/bin in PATH
  echo "Creating symlinks to /usr/local/bin..."
  sudo mkdir -p /usr/local/bin
  sudo ln -sf $(which cmake) /usr/local/bin/cmake
  sudo ln -sf $(which pkg-config) /usr/local/bin/pkg-config

  # Also symlink cmake share directory for CMake v3.31.x compatibility
  if [ -d "/opt/homebrew/share/cmake" ]; then
    sudo mkdir -p /usr/local/share
    sudo ln -sf /opt/homebrew/share/cmake /usr/local/share/cmake
  fi

  echo "cmake location: $(which cmake)"
  echo "pkg-config location: $(which pkg-config)"
fi
