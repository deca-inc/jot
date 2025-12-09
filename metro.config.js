// Metro configuration for Expo with ExecuTorch model assets
// Note: Large model files (.pte) are loaded at runtime from filesystem, not bundled by Metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

/** @type {import('metro-config').ConfigT} */
const config = getDefaultConfig(__dirname);

// Ensure ExecuTorch assets are recognized by Metro (for tokenizer files)
config.resolver.assetExts.push('pte');
config.resolver.assetExts.push('bin');

// Start with base blockList
const blockList = [
  // Block all large .pte model files from being processed by Metro
  // This avoids memory issues during development
  // Models are downloaded via in-app UI or pnpm download:models script
  new RegExp(path.resolve(__dirname, 'assets/models/.*\\.pte$')),
];

// Support symlinked react-native-enriched for local development
// Only applies when the package is symlinked (not when using published version)
const enrichedNodeModulesPath = path.resolve(__dirname, 'node_modules/@deca-inc/react-native-enriched');
const isSymlinked = fs.existsSync(enrichedNodeModulesPath) && fs.lstatSync(enrichedNodeModulesPath).isSymbolicLink();

if (isSymlinked) {
  const enrichedPath = fs.realpathSync(enrichedNodeModulesPath);
  config.watchFolders = [enrichedPath];
  // Only use journal's node_modules - don't include enriched's node_modules
  // This forces the symlinked package to use journal's React
  config.resolver.nodeModulesPaths = [
    path.resolve(__dirname, 'node_modules'),
  ];
  // Block the enriched package's node_modules to prevent duplicate React
  blockList.push(
    new RegExp(escapeRegExp(enrichedPath) + '/node_modules/react/.*'),
    new RegExp(escapeRegExp(enrichedPath) + '/node_modules/react-native/.*'),
  );
}

config.resolver.blockList = blockList;

// Helper to escape special regex characters in path
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = config;
