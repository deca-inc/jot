// Metro configuration for Expo with ExecuTorch model assets
// Note: Large model files (.pte) are loaded at runtime from filesystem, not bundled
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('metro-config').ConfigT} */
const config = getDefaultConfig(__dirname);

// Ensure ExecuTorch assets are recognized by Metro (for tokenizer files)
config.resolver.assetExts.push('pte');
config.resolver.assetExts.push('bin');

// Exclude large model files from Metro's file map to avoid memory issues
// Models are loaded at runtime from the filesystem instead
config.watchFolders = config.watchFolders || [];
config.resolver.blockList = [
  // Block large .pte model files from being processed by Metro
  new RegExp(path.resolve(__dirname, 'assets/models/.*\\.pte$')),
];

module.exports = config;


