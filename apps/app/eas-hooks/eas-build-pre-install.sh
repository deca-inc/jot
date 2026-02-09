#!/bin/bash
set -e

# Install cmake for @dr.pogodin/react-native-static-server
# Required to build native Lighttpd components

if [[ "$EAS_BUILD_PLATFORM" == "ios" ]]; then
  brew install cmake
elif [[ "$EAS_BUILD_PLATFORM" == "android" ]]; then
  if ! command -v cmake &> /dev/null; then
    sudo apt-get update && sudo apt-get install -y cmake
  fi
fi
