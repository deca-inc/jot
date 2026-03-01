#!/bin/bash
# EAS Build pre-install hook
# This script runs before dependencies are installed

set -eox pipefail

echo "========================================"
echo "[eas-build-pre-install] Starting..."
echo "EAS_BUILD_PLATFORM: $EAS_BUILD_PLATFORM"
echo "EAS_BUILD_RUNNER: $EAS_BUILD_RUNNER"
echo "PWD: $(pwd)"
echo "========================================"

# Install cmake and pkg-config on macOS (iOS builds)
# Required for @dr.pogodin/react-native-static-server which uses Lighttpd
if [[ "$EAS_BUILD_PLATFORM" == "ios" ]]; then
  echo "[eas-build-pre-install] Installing cmake and pkg-config via Homebrew..."
  brew install cmake pkg-config

  echo "[eas-build-pre-install] Checking cmake location..."
  CMAKE_PATH=$(which cmake)
  echo "[eas-build-pre-install] cmake found at: $CMAKE_PATH"

  # Create symlinks so Xcode can find these tools
  # Xcode's build scripts don't have /opt/homebrew/bin in PATH
  echo "[eas-build-pre-install] Creating symlinks to /usr/local/bin..."
  sudo mkdir -p /usr/local/bin
  sudo ln -sf "$CMAKE_PATH" /usr/local/bin/cmake
  sudo ln -sf "$(which pkg-config)" /usr/local/bin/pkg-config

  # Also symlink cmake share directory for CMake v3.31.x compatibility
  if [ -d "/opt/homebrew/share/cmake" ]; then
    echo "[eas-build-pre-install] Symlinking cmake share directory..."
    sudo mkdir -p /usr/local/share
    sudo ln -sf /opt/homebrew/share/cmake /usr/local/share/cmake
  fi

  echo "[eas-build-pre-install] Verifying symlinks..."
  ls -la /usr/local/bin/cmake
  ls -la /usr/local/bin/pkg-config
  /usr/local/bin/cmake --version

  echo "[eas-build-pre-install] Done!"
else
  echo "[eas-build-pre-install] Skipping cmake install (not iOS platform)"
fi

echo "========================================"
