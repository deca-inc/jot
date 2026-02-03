// Metro configuration for Expo with ExecuTorch model assets
// Note: Large model files (.pte) are loaded at runtime from filesystem, not bundled by Metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

/** @type {import('metro-config').ConfigT} */
const config = getDefaultConfig(projectRoot);

// Add monorepo root to watch folders
config.watchFolders = [monorepoRoot];

// Ensure ExecuTorch assets are recognized by Metro (for tokenizer files)
config.resolver.assetExts.push("pte");
config.resolver.assetExts.push("bin");

// Block all large .pte model files from being processed by Metro
// This avoids memory issues during development
// Models are downloaded via in-app UI or pnpm download:models script
config.resolver.blockList = [
  new RegExp(path.resolve(projectRoot, "assets/models/.*\\.pte$")),
];

module.exports = config;
