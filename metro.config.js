// Metro configuration for Expo with ExecuTorch model assets
// Note: Large model files (.pte) are loaded at runtime from filesystem, not bundled by Metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

/** @type {import('metro-config').ConfigT} */
const config = getDefaultConfig(__dirname);

// Ensure ExecuTorch assets are recognized by Metro (for tokenizer files)
config.resolver.assetExts.push("pte");
config.resolver.assetExts.push("bin");

// Block all large .pte model files from being processed by Metro
// This avoids memory issues during development
// Models are downloaded via in-app UI or pnpm download:models script
config.resolver.blockList = [
  new RegExp(path.resolve(__dirname, "assets/models/.*\\.pte$")),
];

module.exports = config;
